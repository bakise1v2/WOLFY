import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PRIVATE_ACCESS_COOKIE,
  parseAccessSessionCookieValue,
} from "@/lib/private-access";
import {
  getLocalPrivateRoom,
  updateLocalPrivateRoom,
  shouldUseLocalPrivateGameStorage,
  type PrivateGameRoom,
  type PrivateGameState,
} from "@/lib/private-games-store";
import {
  applyPrivateGameAction,
  createPublicPrivateGameSnapshot,
  type PrivateGameAction,
} from "@/lib/private-game-engine";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ roomId: string }> };

async function getAccessSession() {
  const cookieStore = await cookies();
  return parseAccessSessionCookieValue(cookieStore.get(PRIVATE_ACCESS_COOKIE)?.value);
}

function isPrivateGameState(value: unknown): value is PrivateGameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PrivateGameState>;
  return (
    typeof state.day === "number" &&
    typeof state.phase === "string" &&
    Array.isArray(state.players) &&
    Array.isArray(state.speeches) &&
    typeof state.votes === "object" &&
    state.votes !== null &&
    typeof state.nightActions === "object" &&
    state.nightActions !== null
  );
}

function parseAction(value: unknown): PrivateGameAction | null {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") {
    return null;
  }
  const action = value as Record<string, unknown>;
  const isSeat = (seat: unknown): seat is number => Number.isInteger(seat) && (seat as number) >= 0;
  switch (action.type) {
    case "wolf_vote":
    case "seer":
    case "vote":
      return isSeat(action.targetSeat)
        ? { type: action.type, targetSeat: action.targetSeat }
        : null;
    case "guard":
    case "hunter":
      return action.targetSeat === null || isSeat(action.targetSeat)
        ? { type: action.type, targetSeat: action.targetSeat as number | null }
        : null;
    case "witch":
      return typeof action.save === "boolean" &&
        (action.poisonSeat === null || isSeat(action.poisonSeat))
        ? { type: "witch", save: action.save, poisonSeat: action.poisonSeat as number | null }
        : null;
    case "speech":
      return typeof action.content === "string"
        ? { type: "speech", content: action.content }
        : null;
    default:
      return null;
  }
}

function getRoomSummary(room: Pick<PrivateGameRoom, "id" | "code" | "status" | "created_at" | "participants">) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    created_at: room.created_at,
    participants: room.participants.map(({ user_id, pseudo, role, joined_at }) => ({
      user_id, pseudo, role, joined_at,
    })),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getAccessSession();
  if (!session) return NextResponse.json({ error: "Accès privé requis." }, { status: 401 });
  const { roomId } = await context.params;

  try {
    if (shouldUseLocalPrivateGameStorage()) {
      const room = await getLocalPrivateRoom(roomId);
      if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      if (!room.participants.some((participant) => participant.user_id === session.userId)) {
        return NextResponse.json({ error: "Tu ne fais pas partie de ce salon." }, { status: 403 });
      }
      return NextResponse.json({
        room: getRoomSummary(room),
        viewerId: session.userId,
        game: room.game_state ? createPublicPrivateGameSnapshot(room.game_state, session.userId) : null,
      });
    }

    ensureAdminClient();
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("private_game_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", session.userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: "Tu ne fais pas partie de ce salon." }, { status: 403 });

    const { data: room, error: roomError } = await supabaseAdmin
      .from("private_game_rooms")
      .select("id, code, status, created_at, game_state")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("private_game_participants")
      .select("room_id, user_id, pseudo, role, joined_at")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });
    if (participantsError) throw participantsError;
    const roomView = { ...room, participants: participants ?? [] };
    const gameState = room.game_state;
    if (gameState === null) {
      return NextResponse.json({ room: getRoomSummary(roomView), viewerId: session.userId, game: null });
    }
    if (!isPrivateGameState(gameState)) {
      throw new Error("Le jeu enregistré est invalide.");
    }
    return NextResponse.json({
      room: getRoomSummary(roomView),
      viewerId: session.userId,
      game: createPublicPrivateGameSnapshot(gameState, session.userId),
    });
  } catch (error) {
    console.error("[private-games] room read failed", error);
    return NextResponse.json({ error: "Impossible de charger cette partie." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAccessSession();
  if (!session) return NextResponse.json({ error: "Accès privé requis." }, { status: 401 });
  const { roomId } = await context.params;
  let action: PrivateGameAction | null;
  try {
    action = parseAction(await request.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!action) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  try {
    if (shouldUseLocalPrivateGameStorage()) {
      const room = await getLocalPrivateRoom(roomId);
      if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      if (!room.participants.some((participant) => participant.user_id === session.userId)) {
        return NextResponse.json({ error: "Tu ne fais pas partie de ce salon." }, { status: 403 });
      }
      if (room.status !== "running" || !room.game_state) {
        return NextResponse.json({ error: "La partie n’a pas encore commencé." }, { status: 409 });
      }
      let nextState: PrivateGameState;
      try {
        nextState = applyPrivateGameAction(room.game_state, session.userId, action);
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "Action impossible.",
        }, { status: 400 });
      }
      const updated = await updateLocalPrivateRoom(roomId, (current) => {
        if (current.revision !== room.revision) throw new Error("La partie a été modifiée. Actualise puis réessaie.");
        current.game_state = nextState;
        if (nextState.phase === "ended") current.status = "completed";
      });
      if (!updated) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      return NextResponse.json({ game: createPublicPrivateGameSnapshot(nextState, session.userId) });
    }

    ensureAdminClient();
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("private_game_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", session.userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: "Tu ne fais pas partie de ce salon." }, { status: 403 });

    const { data: room, error: roomError } = await supabaseAdmin
      .from("private_game_rooms")
      .select("id, status, game_state, revision")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
    if (room.status !== "running" || !isPrivateGameState(room.game_state)) {
      return NextResponse.json({ error: "La partie n’a pas encore commencé." }, { status: 409 });
    }

    let nextState: PrivateGameState;
    try {
      nextState = applyPrivateGameAction(room.game_state, session.userId, action);
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Action impossible.",
      }, { status: 400 });
    }
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("private_game_rooms")
      .update({
        game_state: nextState,
        status: nextState.phase === "ended" ? "completed" : "running",
        revision: room.revision + 1,
      })
      .eq("id", roomId)
      .eq("revision", room.revision)
      .eq("status", "running")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ error: "Un autre joueur vient d’agir. Actualise puis réessaie." }, { status: 409 });
    }
    return NextResponse.json({ game: createPublicPrivateGameSnapshot(nextState, session.userId) });
  } catch (error) {
    console.error("[private-games] action failed", error);
    return NextResponse.json({ error: "Impossible d’enregistrer cette action." }, { status: 500 });
  }
}
