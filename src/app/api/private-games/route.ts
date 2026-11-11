import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PRIVATE_ACCESS_COOKIE,
  parseAccessSessionCookieValue,
} from "@/lib/private-access";
import {
  createLocalPrivateRoom,
  getLocalPrivateRoomByCode,
  joinLocalPrivateRoom,
  listLocalPrivateRoomsForAdmin,
  listLocalPrivateRoomsForMember,
  updateLocalPrivateRoom,
  type PrivateGameRoom,
} from "@/lib/private-games-store";
import {
  advancePrivateGameTestAIs,
  canStartPrivateGame,
  createPrivateGameState,
  createPrivateGameTestState,
} from "@/lib/private-game-engine";

class PrivateGameConflictError extends Error {}

function roomSummary(room: Pick<PrivateGameRoom, "id" | "code" | "status" | "created_at" | "participants">) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    created_at: room.created_at,
    participants: room.participants.map(({ room_id, user_id, pseudo, role, joined_at }) => ({
      room_id, user_id, pseudo, role, joined_at,
    })),
  };
}

async function getAccessSession() {
  const cookieStore = await cookies();
  return parseAccessSessionCookieValue(cookieStore.get(PRIVATE_ACCESS_COOKIE)?.value);
}

export async function GET() {
  const session = await getAccessSession();
  if (!session) {
    return NextResponse.json({ error: "Accès privé requis" }, { status: 401 });
  }

  try {
    const rooms = session.role === "admin"
      ? await listLocalPrivateRoomsForAdmin()
      : await listLocalPrivateRoomsForMember(session.userId);
    if (session.role === "admin") {
      return NextResponse.json({
        rooms: rooms.map(roomSummary),
        memberships: rooms
          .filter((room) => room.participants.some((participant) => participant.user_id === session.userId))
          .map((room) => ({
            ...roomSummary(room),
            pseudo: room.participants.find((participant) => participant.user_id === session.userId)?.pseudo,
          })),
      });
    }
    return NextResponse.json({
      memberships: rooms.map((room) => ({
        ...roomSummary(room),
        pseudo: room.participants.find((participant) => participant.user_id === session.userId)?.pseudo,
      })),
    });
  } catch (error) {
    console.error("[private-games] room list failed", error);
    return NextResponse.json({ error: "Impossible de charger les salons." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAccessSession();
  if (!session) {
    return NextResponse.json({ error: "Accès privé requis" }, { status: 401 });
  }

  let body: { action?: unknown; code?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    if (body.action === "create") {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
      }
      const code = randomBytes(8).toString("hex").toUpperCase();
      const room = await createLocalPrivateRoom(code, session.userId, session.name);
      console.info("[private-games] created room", { roomId: room.id });
      return NextResponse.json({ room }, { status: 201 });
    }

    if (body.action === "start" || body.action === "test") {
      if (session.role !== "admin" || typeof body.code !== "string") {
        return NextResponse.json({ error: "Action réservée à l’administrateur du salon." }, { status: 403 });
      }
      const room = await getLocalPrivateRoomByCode(body.code);
      if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      if (room.created_by !== session.userId) {
        return NextResponse.json({ error: "Seul l’administrateur créateur peut lancer cette partie." }, { status: 403 });
      }
      if (room.status !== "waiting") {
        return NextResponse.json({ error: "Cette partie a déjà été lancée." }, { status: 409 });
      }
      const testMode = body.action === "test";
      if (!testMode && !canStartPrivateGame(room.participants)) {
        return NextResponse.json({ error: "Il faut entre 5 et 10 joueurs inscrits pour lancer la partie." }, { status: 400 });
      }
      if (testMode && (room.participants.length < 1 || room.participants.length > 10)) {
        return NextResponse.json({ error: "Le test nécessite entre 1 et 10 joueurs inscrits." }, { status: 400 });
      }

      const started = await updateLocalPrivateRoom(room.id, (current) => {
        if (current.status !== "waiting") {
          throw new PrivateGameConflictError("Cette partie a déjà été lancée.");
        }
        if (testMode && (current.participants.length < 1 || current.participants.length > 10)) {
          throw new PrivateGameConflictError("Le nombre de joueurs a changé. Actualise puis réessaie.");
        }
        if (!testMode && !canStartPrivateGame(current.participants)) {
          throw new PrivateGameConflictError("Le nombre de joueurs a changé. Actualise puis réessaie.");
        }
        current.status = "running";
        current.game_state = testMode
          ? advancePrivateGameTestAIs(createPrivateGameTestState(current.participants))
          : createPrivateGameState(current.participants);
        if (current.game_state.phase === "ended") current.status = "completed";
      });
      if (!started) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      return NextResponse.json({ ok: true, roomId: room.id });
    }

    if (body.action === "join") {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^[A-F0-9]{16}$/.test(code)) {
        return NextResponse.json({ error: "Le code du salon est invalide." }, { status: 400 });
      }
      const room = await joinLocalPrivateRoom(code, {
        user_id: session.userId,
        pseudo: session.name,
        role: session.role,
      });
      if (!room) {
        const existing = await getLocalPrivateRoomByCode(code);
        if (!existing) return NextResponse.json({ error: "Aucun salon ne correspond à ce code." }, { status: 404 });
        return NextResponse.json({
          error: existing.status !== "waiting" ? "Cette partie a déjà commencé." : "Ce salon est complet.",
        }, { status: 409 });
      }
      return NextResponse.json({ room: roomSummary(room) });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    if (error instanceof PrivateGameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[private-games] room action failed", error);
    return NextResponse.json({ error: "Impossible de modifier ce salon." }, { status: 500 });
  }
}
