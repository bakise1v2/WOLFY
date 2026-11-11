import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { getNetlifyDatabasePool } from "@/lib/netlify-database";

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
  testMode?: boolean;
};

type StoreData = { rooms: PrivateGameRoom[] };

function getStorePath() {
  const directory = process.env.PRIVATE_ACCESS_DATA_DIR || path.join(process.cwd(), ".private-access");
  return path.join(directory, "private-games.json");
}

export function shouldUseLocalPrivateGameStorage() {
  return process.env.NODE_ENV !== "production";
}

async function getDatabaseRoom(roomId: string): Promise<PrivateGameRoom | null> {
  const pool = getNetlifyDatabasePool();
  const { rows: roomRows } = await pool.query<Omit<PrivateGameRoom, "participants">>(
    `select id, code, status, created_at, created_by, game_state, revision
     from private_game_rooms
     where id = $1`,
    [roomId],
  );
  const room = roomRows[0];
  if (!room) return null;
  const { rows: participants } = await pool.query<PrivateGameParticipant>(
    `select room_id, user_id, pseudo, role, joined_at
     from private_game_participants
     where room_id = $1
     order by joined_at`,
    [roomId],
  );
  return { ...room, participants };
}

async function listDatabaseRooms(where?: { userId: string }): Promise<PrivateGameRoom[]> {
  const pool = getNetlifyDatabasePool();
  const { rows: rooms } = where
    ? await pool.query<Omit<PrivateGameRoom, "participants">>(
        `select r.id, r.code, r.status, r.created_at, r.created_by, r.game_state, r.revision
         from private_game_rooms r
         where exists (
           select 1 from private_game_participants p
           where p.room_id = r.id and p.user_id = $1
         )
         order by r.created_at desc`,
        [where.userId],
      )
    : await pool.query<Omit<PrivateGameRoom, "participants">>(
        `select id, code, status, created_at, created_by, game_state, revision
         from private_game_rooms
         order by created_at desc`,
      );
  if (!rooms.length) return [];
  const { rows: participants } = await pool.query<PrivateGameParticipant>(
    `select room_id, user_id, pseudo, role, joined_at
     from private_game_participants
     where room_id = any($1::text[])
     order by joined_at`,
    [rooms.map((room) => room.id)],
  );
  const byRoom = new Map<string, PrivateGameParticipant[]>();
  for (const participant of participants) {
    const list = byRoom.get(participant.room_id) ?? [];
    list.push(participant);
    byRoom.set(participant.room_id, list);
  }
  return rooms.map((room) => ({ ...room, participants: byRoom.get(room.id) ?? [] }));
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
  if (!shouldUseLocalPrivateGameStorage()) return listDatabaseRooms();
  return (await readStore()).rooms;
}

export async function listLocalPrivateRoomsForMember(userId: string) {
  if (!shouldUseLocalPrivateGameStorage()) return listDatabaseRooms({ userId });
  return (await readStore()).rooms.filter((room) =>
    room.participants.some((participant) => participant.user_id === userId)
  );
}

export async function createLocalPrivateRoom(code: string, userId: string, pseudo: string) {
  if (!shouldUseLocalPrivateGameStorage()) {
    const pool = getNetlifyDatabasePool();
    const client = await pool.connect();
    const id = randomBytes(16).toString("hex");
    const joinedAt = new Date().toISOString();
    try {
      await client.query("begin");
      await client.query(
        `insert into private_game_rooms (id, code, created_by)
         values ($1, $2, $3)`,
        [id, code, userId],
      );
      await client.query(
        `insert into private_game_participants (room_id, user_id, pseudo, role, joined_at)
         values ($1, $2, $3, 'admin', $4)`,
        [id, userId, pseudo, joinedAt],
      );
      await client.query("commit");
      return {
        id,
        code,
        status: "waiting" as const,
        created_at: new Date().toISOString(),
        created_by: userId,
        revision: 0,
        participants: [{ room_id: id, user_id: userId, pseudo, role: "admin" as const, joined_at: joinedAt }],
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

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
  if (!shouldUseLocalPrivateGameStorage()) return getDatabaseRoom(roomId);
  return (await readStore()).rooms.find((room) => room.id === roomId) ?? null;
}

export async function updateLocalPrivateRoom(
  roomId: string,
  update: (room: PrivateGameRoom) => void
) {
  if (!shouldUseLocalPrivateGameStorage()) {
    const pool = getNetlifyDatabasePool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<Omit<PrivateGameRoom, "participants">>(
        `select id, code, status, created_at, created_by, game_state, revision
         from private_game_rooms
         where id = $1
         for update`,
        [roomId],
      );
      const existing = rows[0];
      if (!existing) {
        await client.query("commit");
        return null;
      }
      const { rows: participants } = await client.query<PrivateGameParticipant>(
        `select room_id, user_id, pseudo, role, joined_at
         from private_game_participants
         where room_id = $1
         order by joined_at`,
        [roomId],
      );
      const room: PrivateGameRoom = { ...existing, participants };
      update(room);
      room.revision = (room.revision ?? 0) + 1;
      const { rows: updated } = await client.query<Omit<PrivateGameRoom, "participants">>(
        `update private_game_rooms
         set status = $2, game_state = $3, revision = $4
         where id = $1
         returning id, code, status, created_at, created_by, game_state, revision`,
        [roomId, room.status, room.game_state ?? null, room.revision],
      );
      await client.query("commit");
      return { ...updated[0], participants };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

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
  if (!shouldUseLocalPrivateGameStorage()) {
    const pool = getNetlifyDatabasePool();
    const { rows } = await pool.query<{ id: string }>(
      `select id from private_game_rooms where code = $1`,
      [code],
    );
    return rows[0] ? getDatabaseRoom(rows[0].id) : null;
  }
  return (await readStore()).rooms.find((room) => room.code === code) ?? null;
}

export async function joinLocalPrivateRoom(
  code: string,
  participant: Omit<PrivateGameParticipant, "room_id" | "joined_at">
) {
  if (!shouldUseLocalPrivateGameStorage()) {
    const pool = getNetlifyDatabasePool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ id: string; status: string }>(
        `select id, status from private_game_rooms where code = $1 for update`,
        [code],
      );
      const room = rows[0];
      if (!room || room.status !== "waiting") {
        await client.query("commit");
        return null;
      }
      const { rows: existing } = await client.query(
        `select user_id from private_game_participants
         where room_id = $1 and user_id = $2`,
        [room.id, participant.user_id],
      );
      if (!existing.length) {
        const { rows: countRows } = await client.query<{ count: string }>(
          `select count(*)::text as count from private_game_participants where room_id = $1`,
          [room.id],
        );
        if (Number(countRows[0]?.count ?? 0) >= 10) {
          await client.query("commit");
          return null;
        }
      }
      await client.query(
        `insert into private_game_participants (room_id, user_id, pseudo, role)
         values ($1, $2, $3, $4)
         on conflict (room_id, user_id)
         do update set pseudo = excluded.pseudo, role = excluded.role`,
        [room.id, participant.user_id, participant.pseudo, participant.role],
      );
      await client.query("update private_game_rooms set revision = revision + 1 where id = $1", [room.id]);
      await client.query("commit");
      return getDatabaseRoom(room.id);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

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
