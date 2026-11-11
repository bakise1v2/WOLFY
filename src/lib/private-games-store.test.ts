import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createLocalPrivateRoom,
  getLocalPrivateRoom,
  joinLocalPrivateRoom,
  updateLocalPrivateRoom,
} from "./private-games-store";

let storageDirectory: string;
const previousStorageDirectory = process.env.PRIVATE_ACCESS_DATA_DIR;

before(async () => {
  storageDirectory = await mkdtemp(path.join(os.tmpdir(), "wolfcha-private-games-"));
  process.env.PRIVATE_ACCESS_DATA_DIR = storageDirectory;
});

after(async () => {
  if (previousStorageDirectory === undefined) {
    delete process.env.PRIVATE_ACCESS_DATA_DIR;
  } else {
    process.env.PRIVATE_ACCESS_DATA_DIR = previousStorageDirectory;
  }
  await rm(storageDirectory, { recursive: true, force: true });
});

test("private rooms and participants persist in the local development store", async () => {
  const room = await createLocalPrivateRoom("A1B2C3D4E5F60708", "admin-1", "Admin");
  assert.equal(room.participants.length, 1);

  const joined = await joinLocalPrivateRoom(room.code, {
    user_id: "player-1",
    pseudo: "Lou",
    role: "player",
  });
  assert.equal(joined?.participants.length, 2);

  const updated = await updateLocalPrivateRoom(room.id, (current) => {
    current.status = "running";
  });
  assert.equal(updated?.revision, 1);
  assert.equal((await getLocalPrivateRoom(room.id))?.status, "running");
});
