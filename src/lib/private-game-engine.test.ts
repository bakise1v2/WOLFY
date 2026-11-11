import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advancePrivateGameTestAIs,
  applyPrivateGameAction,
  canStartPrivateGame,
  createPrivateGameTestState,
  createPrivateGameState,
  createPublicPrivateGameSnapshot,
} from "./private-game-engine";
import type { PrivateGameParticipant } from "./private-games-store";
import { isWolfRole } from "@/types/game";

function makeParticipants(count: number): PrivateGameParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    room_id: "room-1",
    user_id: `player-${index + 1}`,
    pseudo: `Joueur ${index + 1}`,
    role: index === 0 ? "admin" : "player",
    joined_at: new Date(1_000 + index).toISOString(),
  }));
}

test("private game starts with 5-10 human participants and assigns one real player per seat", () => {
  assert.equal(canStartPrivateGame(makeParticipants(4)), false);
  assert.equal(canStartPrivateGame(makeParticipants(5)), true);
  assert.equal(canStartPrivateGame(makeParticipants(10)), true);
  assert.equal(canStartPrivateGame(makeParticipants(11)), false);

  const participants = makeParticipants(8);
  const state = createPrivateGameState(participants);
  assert.equal(state.players.length, 8);
  assert.equal(new Set(state.players.map((player) => player.user_id)).size, 8);
  assert.equal(state.players.filter((player) => isWolfRole(player.game_role)).length, 3);
  assert.equal(state.players.find((player) => player.user_id === "player-1")?.pseudo, "Joueur 1");

  for (const count of [5, 6, 7, 9, 10]) {
    const smallerGame = createPrivateGameState(makeParticipants(count));
    assert.equal(smallerGame.players.length, count);
    assert.equal(new Set(smallerGame.players.map((player) => player.game_role)).size > 0, true);
  }
});

test("night actions are private and proceed to a shared public speech round", () => {
  const state = createPrivateGameState(makeParticipants(8));
  const wolf = state.players.find((player) => isWolfRole(player.game_role));
  const target = state.players.find((player) => player.game_role === "Villager");
  const seer = state.players.find((player) => player.game_role === "Seer");
  const witch = state.players.find((player) => player.game_role === "Witch");
  assert.ok(wolf && target && seer && witch);

  const villagerView = createPublicPrivateGameSnapshot(state, target.user_id);
  assert.equal(villagerView.privateInfo.role, "Villager");
  assert.equal(villagerView.players.find((player) => player.user_id === wolf.user_id)?.role, undefined);
  assert.equal(createPublicPrivateGameSnapshot(state, wolf.user_id).privateInfo.wolfAllies.length, 2);

  let next = applyPrivateGameAction(state, wolf.user_id, {
    type: "wolf_vote",
    targetSeat: target.seat,
  });
  for (const otherWolf of state.players.filter((player) => isWolfRole(player.game_role) && player.user_id !== wolf.user_id)) {
    next = applyPrivateGameAction(next, otherWolf.user_id, {
      type: "wolf_vote",
      targetSeat: target.seat,
    });
  }
  assert.equal(next.phase, "night_witch");
  next = applyPrivateGameAction(next, witch.user_id, { type: "witch", save: false, poisonSeat: null });
  assert.equal(next.phase, "night_seer");
  next = applyPrivateGameAction(next, seer.user_id, { type: "seer", targetSeat: target.seat });
  assert.equal(next.phase, "day_speech");
  assert.equal(next.players.find((player) => player.user_id === target.user_id)?.alive, false);
  assert.deepEqual(next.seerHistory[seer.user_id]?.[0], {
    pseudo: target.pseudo,
    role: "Village",
    day: 1,
  });

  for (const speakerId of next.speechOrder) {
    next = applyPrivateGameAction(next, speakerId, {
      type: "speech",
      content: `Ma prise de parole par ${speakerId}`,
    });
  }
  assert.equal(next.phase, "day_vote");
  assert.equal(next.speeches.length, 7);
  assert.equal(createPublicPrivateGameSnapshot(next, seer.user_id).privateInfo.hasActed, false);
});

test("test mode fills a small room with simulated AIs and pauses for the human action", () => {
  const state = createPrivateGameTestState(makeParticipants(1));
  assert.equal(state.testMode, true);
  assert.equal(state.players.length, 5);
  assert.equal(state.players.filter((player) => player.user_id.startsWith("private-test-ai-")).length, 4);

  const players = state.players.map((player) => ({
    ...player,
    game_role: player.user_id === "player-1"
      ? "Seer"
      : player.user_id === "private-test-ai-1"
        ? "Werewolf"
        : player.user_id === "private-test-ai-2"
          ? "Witch"
          : "Villager",
  }));
  const game = advancePrivateGameTestAIs({ ...state, players });
  assert.equal(game.phase, "night_seer");
  assert.equal(typeof game.nightActions["private-test-ai-1"]?.target, "number");
  assert.equal(game.nightActions["private-test-ai-2"]?.save, false);
  assert.equal(game.nightActions["player-1"], undefined);

  const seerTarget = game.players.find((player) => player.alive && player.user_id !== "player-1");
  assert.ok(seerTarget);
  const afterVision = advancePrivateGameTestAIs(applyPrivateGameAction(game, "player-1", {
    type: "seer",
    targetSeat: seerTarget.seat,
  }));
  assert.equal(afterVision.phase, "day_speech");
  assert.equal(afterVision.speechOrder[afterVision.speechIndex], "player-1");

  const afterHumanSpeech = advancePrivateGameTestAIs(applyPrivateGameAction(afterVision, "player-1", {
    type: "speech",
    content: "Je teste la prise de parole.",
  }));
  assert.equal(afterHumanSpeech.phase, "day_vote");
  assert.ok(afterHumanSpeech.speeches.some((speech) => speech.user_id.startsWith("private-test-ai-")));
  assert.ok(Object.keys(afterHumanSpeech.votes).some((userId) => userId.startsWith("private-test-ai-")));
});
