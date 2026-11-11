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
  shouldUseLocalPrivateGameStorage,
} from "@/lib/private-games-store";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { canStartPrivateGame, createPrivateGameState } from "@/lib/private-game-engine";

type ParticipantRow = {
  room_id: string;
  user_id: string;
  pseudo: string;
  role: "admin" | "player" | "reserve";
  joined_at: string;
};

function roomSummary(room: {
  id: string;
  code: string;
  status: "waiting" | "running" | "completed";
  created_at: string;
  participants: ParticipantRow[];
}) {
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
    if (shouldUseLocalPrivateGameStorage()) {
      const rooms = session.role === "admin"
        ? await listLocalPrivateRoomsForAdmin()
        : await listLocalPrivateRoomsForMember(session.userId);
      if (session.role === "admin") return NextResponse.json({
        rooms: rooms.map(roomSummary),
        memberships: rooms
          .filter((room) => room.participants.some((participant) => participant.user_id === session.userId))
          .map((room) => ({
            ...roomSummary(room),
            pseudo: room.participants.find((participant) => participant.user_id === session.userId)?.pseudo,
          })),
      });
      return NextResponse.json({
        memberships: rooms.map((room) => ({
          ...roomSummary(room),
          pseudo: room.participants.find((participant) => participant.user_id === session.userId)?.pseudo,
        })),
      });
    }

    ensureAdminClient();
    if (session.role === "admin") {
      const { data: rooms, error: roomError } = await supabaseAdmin
        .from("private_game_rooms")
        .select("id, code, status, created_at")
        .order("created_at", { ascending: false });
      if (roomError) throw roomError;

      const roomIds = (rooms ?? []).map((room) => room.id);
      const { data: participants, error: participantError } = roomIds.length
        ? await supabaseAdmin
            .from("private_game_participants")
            .select("room_id, user_id, pseudo, role, joined_at")
            .in("room_id", roomIds)
            .order("joined_at", { ascending: true })
        : { data: [], error: null };
      if (participantError) throw participantError;

      const participantsByRoom = new Map<string, ParticipantRow[]>();
      for (const participant of participants ?? []) {
        const group = participantsByRoom.get(participant.room_id) ?? [];
        group.push(participant);
        participantsByRoom.set(participant.room_id, group);
      }

      const roomSummaries = (rooms ?? []).map((room) => roomSummary({
          ...room,
          participants: participantsByRoom.get(room.id) ?? [],
        }));
      return NextResponse.json({
        rooms: roomSummaries,
        memberships: roomSummaries
          .filter((room) => room.participants.some((participant) => participant.user_id === session.userId))
          .map((room) => ({
            ...room,
            pseudo: room.participants.find((participant) => participant.user_id === session.userId)?.pseudo,
          })),
      });
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("private_game_participants")
      .select("room_id, pseudo")
      .eq("user_id", session.userId);
    if (membershipError) throw membershipError;

    const roomIds = (memberships ?? []).map((membership) => membership.room_id);
    const { data: rooms, error: roomError } = roomIds.length
      ? await supabaseAdmin
          .from("private_game_rooms")
          .select("id, code, status, created_at")
          .in("id", roomIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (roomError) throw roomError;

    const { data: participants, error: participantError } = roomIds.length
      ? await supabaseAdmin
          .from("private_game_participants")
          .select("room_id, user_id, pseudo, role, joined_at")
          .in("room_id", roomIds)
          .order("joined_at", { ascending: true })
      : { data: [], error: null };
    if (participantError) throw participantError;

    const participantsByRoom = new Map<string, ParticipantRow[]>();
    for (const participant of participants ?? []) {
      const group = participantsByRoom.get(participant.room_id) ?? [];
      group.push(participant);
      participantsByRoom.set(participant.room_id, group);
    }
    const pseudoByRoom = new Map((memberships ?? []).map((membership) => [membership.room_id, membership.pseudo]));

    return NextResponse.json({
      memberships: (rooms ?? []).map((room) => ({
        ...roomSummary({
          ...room,
          participants: participantsByRoom.get(room.id) ?? [],
        }),
        pseudo: pseudoByRoom.get(room.id),
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
    if (shouldUseLocalPrivateGameStorage()) {
      if (body.action === "create") {
        if (session.role !== "admin") {
          return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
        }
        const code = randomBytes(8).toString("hex").toUpperCase();
        const room = await createLocalPrivateRoom(code, session.userId, session.name);
        console.info("[private-games] created local development room", { roomId: room.id });
        return NextResponse.json({ room }, { status: 201 });
      }

      if (body.action === "start") {
        if (session.role !== "admin" || typeof body.code !== "string") {
          return NextResponse.json({ error: "Action réservée à l’administrateur du salon." }, { status: 403 });
        }
        const room = await getLocalPrivateRoomByCode(body.code);
        if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
        if (room.created_by !== session.userId) {
          return NextResponse.json({ error: "Seul l’administrateur créateur peut lancer cette partie." }, { status: 403 });
        }
        if (room.status !== "waiting") return NextResponse.json({ error: "Cette partie a déjà été lancée." }, { status: 409 });
        if (!canStartPrivateGame(room.participants)) {
          return NextResponse.json({ error: "Il faut entre 5 et 10 joueurs inscrits pour lancer la partie." }, { status: 400 });
        }
        const gameState = createPrivateGameState(room.participants);
        try {
          await updateLocalPrivateRoom(room.id, (current) => {
            if (current.status !== "waiting") throw new Error("Cette partie a déjà été lancée.");
            current.status = "running";
            current.game_state = gameState;
          });
        } catch (error) {
          return NextResponse.json({
            error: error instanceof Error ? error.message : "Le salon a changé. Actualise puis réessaie.",
          }, { status: 409 });
        }
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
          const exists = (await listLocalPrivateRoomsForAdmin()).find((entry) => entry.code === code);
          if (!exists) return NextResponse.json({ error: "Aucun salon ne correspond à ce code." }, { status: 404 });
          return NextResponse.json({ error: exists.status !== "waiting" ? "Cette partie a déjà commencé." : "Ce salon est complet." }, { status: 409 });
        }
        return NextResponse.json({ room: roomSummary(room) });
      }

      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }

    ensureAdminClient();
    if (body.action === "create") {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
      }

      const code = randomBytes(8).toString("hex").toUpperCase();
      const { data: room, error } = await supabaseAdmin
        .from("private_game_rooms")
        .insert({ code, created_by: session.userId })
        .select("id, code, status, created_at")
        .single();
      if (error || !room) throw error ?? new Error("Salon non créé");

      const { error: participantError } = await supabaseAdmin
        .from("private_game_participants")
        .insert({
          room_id: room.id,
          user_id: session.userId,
          pseudo: session.name,
          role: session.role,
        });
      if (participantError) {
        await supabaseAdmin.from("private_game_rooms").delete().eq("id", room.id);
        throw participantError;
      }

      return NextResponse.json({
        room: { ...room, participants: [{
          room_id: room.id, user_id: session.userId, pseudo: session.name, role: session.role,
          joined_at: new Date().toISOString(),
        }] },
      }, { status: 201 });
    }

    if (body.action === "start") {
      if (session.role !== "admin" || typeof body.code !== "string") {
        return NextResponse.json({ error: "Action réservée à l’administrateur du salon." }, { status: 403 });
      }
      const { data: room, error: roomError } = await supabaseAdmin
        .from("private_game_rooms")
        .select("id, code, created_by, status, revision")
        .eq("code", body.code)
        .maybeSingle();
      if (roomError) throw roomError;
      if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
      if (room.created_by !== session.userId) {
        return NextResponse.json({ error: "Seul l’administrateur créateur peut lancer cette partie." }, { status: 403 });
      }
      if (room.status !== "waiting") return NextResponse.json({ error: "Cette partie a déjà été lancée." }, { status: 409 });

      const { data: participants, error: participantError } = await supabaseAdmin
        .from("private_game_participants")
        .select("room_id, user_id, pseudo, role, joined_at")
        .eq("room_id", room.id)
        .order("joined_at", { ascending: true });
      if (participantError) throw participantError;
      if (!canStartPrivateGame(participants ?? [])) {
        return NextResponse.json({ error: "Il faut entre 5 et 10 joueurs inscrits pour lancer la partie." }, { status: 400 });
      }
      const gameState = createPrivateGameState(participants ?? []);
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("private_game_rooms")
        .update({ status: "running", game_state: gameState })
        .eq("id", room.id)
        .eq("status", "waiting")
        .eq("revision", room.revision)
        .is("game_state", null)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return NextResponse.json({ error: "La partie vient d’être lancée par un autre administrateur." }, { status: 409 });
      return NextResponse.json({ ok: true, roomId: room.id });
    }

    if (body.action === "join") {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^[A-F0-9]{16}$/.test(code)) {
        return NextResponse.json({ error: "Le code du salon est invalide." }, { status: 400 });
      }

      const { data: room, error: roomError } = await supabaseAdmin
        .from("private_game_rooms")
        .select("id, code, status, created_at")
        .eq("code", code)
        .maybeSingle();
      if (roomError) throw roomError;
      if (!room) {
        return NextResponse.json({ error: "Aucun salon ne correspond à ce code." }, { status: 404 });
      }
      if (room.status !== "waiting") return NextResponse.json({ error: "Cette partie a déjà commencé." }, { status: 409 });

      const { count, error: countError } = await supabaseAdmin
        .from("private_game_participants")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id);
      if (countError) throw countError;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("private_game_participants")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing && (count ?? 0) >= 10) {
        return NextResponse.json({ error: "Ce salon est complet (10 joueurs maximum)." }, { status: 409 });
      }

      const { error: joinError } = await supabaseAdmin
        .from("private_game_participants")
        .upsert(
          {
            room_id: room.id,
            user_id: session.userId,
            pseudo: session.name,
            role: session.role,
          },
          { onConflict: "room_id,user_id" },
        );
      if (joinError) throw joinError;

      return NextResponse.json({ room }, { status: 200 });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("[private-games] room update failed", error);
    return NextResponse.json({ error: "Impossible de traiter le salon." }, { status: 500 });
  }
}
