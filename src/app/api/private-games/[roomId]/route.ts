import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PRIVATE_ACCESS_COOKIE,
  parseAccessSessionCookieValue,
} from "@/lib/private-access";
import {
  getLocalPrivateRoom,
  updateLocalPrivateRoom,
  type PrivateGameRoom,
  type PrivateGameState,
} from "@/lib/private-games-store";
import {
  advancePrivateGameTestAIs,
  applyPrivateGameAction,
  createPublicPrivateGameSnapshot,
  type PrivateGameAction,
} from "@/lib/private-game-engine";

type RouteContext = { params: Promise<{ roomId: string }> };

class PrivateGameRequestError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 409) {
    super(message);
  }
}

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
    const room = await getLocalPrivateRoom(roomId);
    if (!room) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
    if (!room.participants.some((participant) => participant.user_id === session.userId)) {
      return NextResponse.json({ error: "Tu ne fais pas partie de ce salon." }, { status: 403 });
    }
    if (room.game_state !== null && room.game_state !== undefined && !isPrivateGameState(room.game_state)) {
      throw new Error("Le jeu enregistré est invalide.");
    }
    return NextResponse.json({
      room: getRoomSummary(room),
      viewerId: session.userId,
      game: room.game_state ? createPublicPrivateGameSnapshot(room.game_state, session.userId) : null,
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
    let nextState: PrivateGameState | null = null;
    const updated = await updateLocalPrivateRoom(roomId, (current) => {
      if (!current.participants.some((participant) => participant.user_id === session.userId)) {
        throw new PrivateGameRequestError("Tu ne fais pas partie de ce salon.", 403);
      }
      if (current.status !== "running" || !isPrivateGameState(current.game_state)) {
        throw new PrivateGameRequestError("La partie n’a pas encore commencé.", 409);
      }

      try {
        nextState = advancePrivateGameTestAIs(
          applyPrivateGameAction(current.game_state, session.userId, action),
        );
      } catch (error) {
        throw new PrivateGameRequestError(
          error instanceof Error ? error.message : "Action impossible.",
          409,
        );
      }
      current.game_state = nextState;
      if (nextState.phase === "ended") current.status = "completed";
    });
    if (!updated) return NextResponse.json({ error: "Salon introuvable." }, { status: 404 });
    if (!nextState) throw new Error("L’action n’a pas produit de nouvel état de partie.");
    return NextResponse.json({ game: createPublicPrivateGameSnapshot(nextState, session.userId) });
  } catch (error) {
    if (error instanceof PrivateGameRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[private-games] action failed", error);
    return NextResponse.json({ error: "Impossible d’enregistrer cette action." }, { status: 500 });
  }
}
