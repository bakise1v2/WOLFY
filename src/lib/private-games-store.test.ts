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
import { applyPrivateGameAction, createPrivateGameState } from "./private-game-engine";

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

test("simultaneous player actions are applied to the latest room state", async () => {
  const room = await createLocalPrivateRoom("B1B2C3D4E5F60708", "admin-1", "Admin");
  for (let index = 1; index < 5; index += 1) {
    await joinLocalPrivateRoom(room.code, {
      user_id: `player-${index}`,
      pseudo: `Joueur ${index}`,
      role: "player",
    });
  }

  const participants = (await getLocalPrivateRoom(room.id))?.participants;
  assert.ok(participants);
  const game = { ...createPrivateGameState(participants), phase: "day_vote" as const };
  await updateLocalPrivateRoom(room.id, (current) => {
    current.status = "running";
    current.game_state = game;
  });

  const targets = game.players.filter((player) => player.user_id !== "admin-1" && player.user_id !== "player-1");
  await Promise.all(["admin-1", "player-1"].map((userId, index) =>
    updateLocalPrivateRoom(room.id, (current) => {
      assert.ok(current.game_state);
      current.game_state = applyPrivateGameAction(current.game_state, userId, {
        type: "vote",
        targetSeat: targets[index].seat,
      });
    })
  ));

  const finalRoom = await getLocalPrivateRoom(room.id);
  assert.equal(finalRoom?.game_state?.votes["admin-1"], targets[0].seat);
  assert.equal(finalRoom?.game_state?.votes["player-1"], targets[1].seat);
});
