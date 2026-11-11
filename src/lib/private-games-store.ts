import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

export type PrivateGameParticipant = {
  room_id: string;
  user_id: string;
  pseudo: string;
  role: "admin" | "player" | "reserve";
  joined_at: string;
};

export type PrivateGameRoom = {
  id: string;
  code: string;
  status: "waiting" | "running" | "completed";
  created_at: string;
  created_by: string;
  participants: PrivateGameParticipant[];
  game_state?: PrivateGameState | null;
  revision?: number;
};

export type PrivateGameState = {
  day: number;
  phase: "night_wolf" | "night_guard" | "night_witch" | "night_seer" | "day_speech" | "day_vote" | "hunter" | "ended";
  players: Array<PrivateGameParticipant & { seat: number; game_role: string; alive: boolean }>;
  speechOrder: string[];
  speechIndex: number;
  speeches: Array<{ user_id: string; pseudo: string; content: string; day: number; created_at: string }>;
  votes: Record<string, number>;
  nightActions: Record<string, { target: number | null; save?: boolean; poison?: number | null }>;
  nightResult?: {
    wolfTarget: number | null;
    guardTarget: number | null;
    witchSave: boolean;
    witchPoison: number | null;
    deaths: number[];
  };
  seerHistory: Record<string, Array<{ pseudo: string; role: string; day: number }>>;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  lastGuardTarget: number | null;
  hunterTarget: number | null;
  winner: "village" | "wolf" | null;
};

type StoreData = { rooms: PrivateGameRoom[] };

function getStorePath() {
  const directory = process.env.PRIVATE_ACCESS_DATA_DIR || path.join(process.cwd(), ".private-access");
  return path.join(directory, "private-games.json");
}

export function shouldUseLocalPrivateGameStorage() {
  if (process.env.NODE_ENV !== "development") return false;
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return true;
  try {
    const hostname = new URL(configuredUrl).hostname;
    return hostname === "example.supabase.co" || hostname.endsWith(".example.com");
  } catch {
    return true;
  }
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const store = JSON.parse(raw) as StoreData;
    if (!store || !Array.isArray(store.rooms)) {
      throw new Error("Le fichier local des salons est invalide.");
    }
    for (const room of store.rooms) room.revision ??= 0;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { rooms: [] };
  }
}

let writeQueue: Promise<void> = Promise.resolve();

async function updateStore(
  update: (store: StoreData) => void
): Promise<StoreData> {
  let result: StoreData = { rooms: [] };
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    update(store);
    const filePath = getStorePath();
    const directory = path.dirname(filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(temporaryPath, filePath);
    result = store;
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

export async function listLocalPrivateRoomsForAdmin() {
  return (await readStore()).rooms;
}

export async function listLocalPrivateRoomsForMember(userId: string) {
  return (await readStore()).rooms.filter((room) =>
    room.participants.some((participant) => participant.user_id === userId)
  );
}

export async function createLocalPrivateRoom(code: string, userId: string, pseudo: string) {
  let created: PrivateGameRoom | undefined;
  await updateStore((store) => {
    created = {
      id: randomBytes(16).toString("hex"),
      code,
      status: "waiting",
      created_at: new Date().toISOString(),
      created_by: userId,
      revision: 0,
      participants: [{
        room_id: "",
        user_id: userId,
        pseudo,
        role: "admin",
        joined_at: new Date().toISOString(),
      }],
    };
    created.participants[0].room_id = created.id;
    store.rooms.unshift(created);
  });
  if (!created) throw new Error("Le salon local n’a pas été créé.");
  return created;
}

export async function getLocalPrivateRoom(roomId: string) {
  return (await readStore()).rooms.find((room) => room.id === roomId) ?? null;
}

export async function updateLocalPrivateRoom(
  roomId: string,
  update: (room: PrivateGameRoom) => void
) {
  let updatedRoom: PrivateGameRoom | null = null;
  await updateStore((store) => {
    const room = store.rooms.find((entry) => entry.id === roomId);
    if (!room) return;
    update(room);
    room.revision = (room.revision ?? 0) + 1;
    updatedRoom = room;
  });
  return updatedRoom;
}

export async function getLocalPrivateRoomByCode(code: string) {
  return (await readStore()).rooms.find((room) => room.code === code) ?? null;
}

export async function joinLocalPrivateRoom(
  code: string,
  participant: Omit<PrivateGameParticipant, "room_id" | "joined_at">
) {
  let joinedRoom: PrivateGameRoom | undefined;
  await updateStore((store) => {
    const room = store.rooms.find((entry) => entry.code === code);
    if (!room || room.status !== "waiting") return;
    const existing = room.participants.find((entry) => entry.user_id === participant.user_id);
    if (existing) {
      existing.pseudo = participant.pseudo;
      existing.role = participant.role;
    } else {
      if (room.participants.length >= 10) return;
      room.participants.push({
        ...participant,
        room_id: room.id,
        joined_at: new Date().toISOString(),
      });
    }
    joinedRoom = room;
  });
  return joinedRoom ?? null;
}
