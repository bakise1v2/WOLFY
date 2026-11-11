import "server-only";

import { randomInt } from "node:crypto";
import { getRoleConfiguration } from "@/lib/role-configuration";
import type { PrivateGameParticipant, PrivateGameState } from "@/lib/private-games-store";
import { isWolfRole, type Role } from "@/types/game";

export type PrivateGameAction =
  | { type: "wolf_vote"; targetSeat: number }
  | { type: "guard"; targetSeat: number | null }
  | { type: "witch"; save: boolean; poisonSeat: number | null }
  | { type: "seer"; targetSeat: number }
  | { type: "speech"; content: string }
  | { type: "vote"; targetSeat: number }
  | { type: "hunter"; targetSeat: number | null };

type RuntimePlayer = PrivateGameState["players"][number];

export function canStartPrivateGame(participants: PrivateGameParticipant[]) {
  return participants.length >= 5 && participants.length <= 10;
}

export function createPrivateGameState(participants: PrivateGameParticipant[]): PrivateGameState {
  if (!canStartPrivateGame(participants)) {
    throw new Error("Une partie nécessite entre 5 et 10 joueurs inscrits.");
  }
  const shuffledRoles = getRoleConfiguration(participants.length);
  for (let index = shuffledRoles.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffledRoles[index], shuffledRoles[swapIndex]] = [shuffledRoles[swapIndex], shuffledRoles[index]];
  }

  const players = [...participants]
    .sort((left, right) => left.joined_at.localeCompare(right.joined_at))
    .map((participant, seat) => ({
      ...participant,
      seat,
      game_role: shuffledRoles[seat],
      alive: true,
    }));

  return {
    day: 1,
    phase: "night_wolf",
    players,
    speechOrder: [],
    speechIndex: 0,
    speeches: [],
    votes: {},
    nightActions: {},
    seerHistory: {},
    witchHealUsed: false,
    witchPoisonUsed: false,
    lastGuardTarget: null,
    hunterTarget: null,
    winner: null,
  };
}

function requirePlayer(
  state: PrivateGameState,
  userId: string,
  allowEliminated = false
): RuntimePlayer {
  const player = state.players.find((entry) => entry.user_id === userId);
  if (!player) throw new Error("Tu ne fais pas partie de cette partie.");
  if (!player.alive && !allowEliminated) {
    throw new Error("Les joueurs éliminés ne peuvent pas effectuer cette action.");
  }
  return player;
}

function activePlayers(state: PrivateGameState) {
  return state.players.filter((player) => player.alive);
}

function isTargetSeatAvailable(state: PrivateGameState, seat: number) {
  return state.players.some((player) => player.seat === seat && player.alive);
}

function checkWinner(state: PrivateGameState): PrivateGameState {
  const wolves = activePlayers(state).filter((player) => isWolfRole(player.game_role));
  const villagers = activePlayers(state).filter((player) => !isWolfRole(player.game_role));
  if (wolves.length === 0) return { ...state, phase: "ended", winner: "village" };
  if (wolves.length >= villagers.length) return { ...state, phase: "ended", winner: "wolf" };
  return state;
}

function livingWithRole(state: PrivateGameState, role: Role) {
  return activePlayers(state).filter((player) => player.game_role === role);
}

function livingWolves(state: PrivateGameState) {
  return activePlayers(state).filter((player) => isWolfRole(player.game_role));
}

function finishNight(state: PrivateGameState): PrivateGameState {
  const wolfVotes = livingWolves(state)
    .map((wolf) => state.nightActions[wolf.user_id]?.target)
    .filter((target): target is number => typeof target === "number");
  let wolfTarget: number | null = null;
  if (wolfVotes.length > 0) {
    const counts = new Map<number, number>();
    for (const seat of wolfVotes) counts.set(seat, (counts.get(seat) ?? 0) + 1);
    const highest = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, count]) => count === highest).map(([seat]) => seat);
    if (leaders.length === 1) wolfTarget = leaders[0];
  }

  const guard = livingWithRole(state, "Guard")[0];
  const guardTarget = guard ? state.nightActions[guard.user_id]?.target ?? null : null;
  const witch = livingWithRole(state, "Witch")[0];
  const witchAction = witch ? state.nightActions[witch.user_id] : undefined;
  const witchSave = witchAction?.save === true && !state.witchHealUsed && wolfTarget !== null;
  const witchPoison = witchAction?.poison ?? null;
  const deadSeats = new Set<number>();
  if (wolfTarget !== null && wolfTarget !== guardTarget && !witchSave) deadSeats.add(wolfTarget);
  if (typeof witchPoison === "number") deadSeats.add(witchPoison);
  const deaths = [...deadSeats];

  let next: PrivateGameState = {
    ...state,
    players: state.players.map((player) => deadSeats.has(player.seat) ? { ...player, alive: false } : player),
    lastGuardTarget: guardTarget,
    witchHealUsed: state.witchHealUsed || witchSave,
    witchPoisonUsed: state.witchPoisonUsed || typeof witchPoison === "number",
    nightResult: { wolfTarget, guardTarget, witchSave, witchPoison, deaths },
    nightActions: {},
  };

  const killedHunter = [...deadSeats]
    .map((seat) => state.players.find((player) => player.seat === seat))
    .find((player) => player?.game_role === "Hunter");
  if (killedHunter) {
    next = { ...next, phase: "hunter", hunterTarget: null };
    return next;
  }

  next = checkWinner(next);
  if (next.phase === "ended") return next;
  const speechOrder = activePlayers(next).sort((left, right) => left.seat - right.seat).map((player) => player.user_id);
  return {
    ...next,
    day: state.day,
    phase: "day_speech",
    speechOrder,
    speechIndex: 0,
    votes: {},
  };
}

function advanceNightPhase(state: PrivateGameState): PrivateGameState {
  if (state.phase === "night_wolf") {
    const wolves = livingWolves(state);
    if (wolves.length && wolves.some((wolf) => !state.nightActions[wolf.user_id])) return state;
    const wolfVotes = wolves.map((wolf) => state.nightActions[wolf.user_id]?.target)
      .filter((target): target is number => typeof target === "number");
    const counts = new Map<number, number>();
    for (const seat of wolfVotes) counts.set(seat, (counts.get(seat) ?? 0) + 1);
    const highest = counts.size ? Math.max(...counts.values()) : 0;
    const leaders = [...counts.entries()].filter(([, count]) => count === highest).map(([seat]) => seat);
    return advanceNightPhase({
      ...state,
      phase: "night_guard",
      nightResult: {
        wolfTarget: leaders.length === 1 ? leaders[0] : null,
        guardTarget: null,
        witchSave: false,
        witchPoison: null,
        deaths: [],
      },
    });
  }
  if (state.phase === "night_guard") {
    const guard = livingWithRole(state, "Guard")[0];
    if (guard && !state.nightActions[guard.user_id]) return state;
    return advanceNightPhase({ ...state, phase: "night_witch" });
  }
  if (state.phase === "night_witch") {
    const witch = livingWithRole(state, "Witch")[0];
    if (witch && !state.nightActions[witch.user_id]) return state;
    return advanceNightPhase({ ...state, phase: "night_seer" });
  }
  if (state.phase === "night_seer") {
    const seer = livingWithRole(state, "Seer")[0];
    if (seer && !state.nightActions[seer.user_id]) return state;
    return finishNight(state);
  }
  return state;
}

export function applyPrivateGameAction(
  state: PrivateGameState,
  userId: string,
  action: PrivateGameAction
): PrivateGameState {
  if (state.phase === "ended") throw new Error("Cette partie est terminée.");
  const actor = requirePlayer(state, userId, action.type === "hunter");

  if (action.type === "wolf_vote") {
    if (state.phase !== "night_wolf" || !isWolfRole(actor.game_role)) throw new Error("Ce n’est pas ton action.");
    const target = state.players.find((player) => player.seat === action.targetSeat);
    if (!target?.alive || isWolfRole(target.game_role)) throw new Error("Choisis un joueur vivant hors de ton équipe.");
    if (state.nightActions[userId]) throw new Error("Ton choix est déjà enregistré.");
    return advanceNightPhase({
      ...state,
      nightActions: { ...state.nightActions, [userId]: { target: action.targetSeat } },
    });
  }

  if (action.type === "guard") {
    if (state.phase !== "night_guard" || actor.game_role !== "Guard") throw new Error("Ce n’est pas ton action.");
    if (state.nightActions[userId]) throw new Error("Ton choix est déjà enregistré.");
    if (action.targetSeat !== null && !isTargetSeatAvailable(state, action.targetSeat)) throw new Error("Choisis un joueur vivant.");
    if (action.targetSeat !== null && action.targetSeat === state.lastGuardTarget) throw new Error("Le gardien ne peut pas protéger deux nuits de suite la même personne.");
    return advanceNightPhase({
      ...state,
      nightActions: { ...state.nightActions, [userId]: { target: action.targetSeat } },
    });
  }

  if (action.type === "witch") {
    if (state.phase !== "night_witch" || actor.game_role !== "Witch") throw new Error("Ce n’est pas ton action.");
    if (state.nightActions[userId]) throw new Error("Ton choix est déjà enregistré.");
    if (action.save && (state.witchHealUsed || state.nightResult?.wolfTarget === null || state.nightResult?.wolfTarget === undefined)) {
      throw new Error("La potion de vie ne peut pas être utilisée.");
    }
    if (action.poisonSeat !== null && state.witchPoisonUsed) throw new Error("La potion de mort a déjà été utilisée.");
    if (action.poisonSeat !== null && !isTargetSeatAvailable(state, action.poisonSeat)) throw new Error("Choisis un joueur vivant.");
    if (action.save && action.poisonSeat !== null) throw new Error("Une seule potion peut être utilisée par nuit.");
    return advanceNightPhase({
      ...state,
      nightActions: {
        ...state.nightActions,
        [userId]: { target: action.poisonSeat, save: action.save, poison: action.poisonSeat },
      },
    });
  }

  if (action.type === "seer") {
    if (state.phase !== "night_seer" || actor.game_role !== "Seer") throw new Error("Ce n’est pas ton action.");
    if (state.nightActions[userId]) throw new Error("Ton choix est déjà enregistré.");
    const target = state.players.find((player) => player.seat === action.targetSeat);
    if (!target?.alive || target.user_id === userId) throw new Error("Choisis un autre joueur vivant.");
    const seerHistory = {
      ...state.seerHistory,
      [userId]: [
        ...(state.seerHistory[userId] ?? []),
        { pseudo: target.pseudo, role: isWolfRole(target.game_role) ? "Loup" : "Village", day: state.day },
      ],
    };
    return advanceNightPhase({
      ...state,
      seerHistory,
      nightActions: { ...state.nightActions, [userId]: { target: action.targetSeat } },
    });
  }

  if (action.type === "speech") {
    if (state.phase !== "day_speech" || state.speechOrder[state.speechIndex] !== userId) {
      throw new Error("Ce n’est pas ton tour de parler.");
    }
    const content = action.content.trim();
    if (!content || content.length > 1000) throw new Error("Le message doit contenir de 1 à 1000 caractères.");
    const speeches = [...state.speeches, {
      user_id: userId,
      pseudo: actor.pseudo,
      content,
      day: state.day,
      created_at: new Date().toISOString(),
    }];
    const speechIndex = state.speechIndex + 1;
    if (speechIndex < state.speechOrder.length) return { ...state, speeches, speechIndex };
    return { ...state, speeches, speechIndex, phase: "day_vote", votes: {} };
  }

  if (action.type === "vote") {
    if (state.phase !== "day_vote") throw new Error("Le vote n’est pas ouvert.");
    if (typeof state.votes[userId] === "number") throw new Error("Tu as déjà voté.");
    const target = state.players.find((player) => player.seat === action.targetSeat);
    if (!target?.alive || target.user_id === userId) throw new Error("Choisis un autre joueur vivant.");
    const votes = { ...state.votes, [userId]: action.targetSeat };
    if (activePlayers(state).some((player) => typeof votes[player.user_id] !== "number")) {
      return { ...state, votes };
    }
    const counts = new Map<number, number>();
    Object.values(votes).forEach((seat) => counts.set(seat, (counts.get(seat) ?? 0) + 1));
    const highest = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, count]) => count === highest).map(([seat]) => seat);
    const executedSeat = leaders.length === 1 ? leaders[0] : null;
    let next: PrivateGameState = {
      ...state,
      votes,
      players: state.players.map((player) => player.seat === executedSeat ? { ...player, alive: false } : player),
    };
    const hunter = executedSeat === null ? null : state.players.find((player) => player.seat === executedSeat && player.game_role === "Hunter");
    if (hunter) return { ...next, phase: "hunter", hunterTarget: null };
    next = checkWinner(next);
    if (next.phase === "ended") return next;
    return { ...next, day: state.day + 1, phase: "night_wolf", nightActions: {}, votes: {} };
  }

  if (action.type === "hunter") {
    if (state.phase !== "hunter" || actor.game_role !== "Hunter") throw new Error("Ce n’est pas ton action.");
    if (state.hunterTarget !== null) throw new Error("Ton tir est déjà enregistré.");
    if (action.targetSeat !== null && !isTargetSeatAvailable(state, action.targetSeat)) throw new Error("Choisis un joueur vivant.");
    let next: PrivateGameState = {
      ...state,
      players: action.targetSeat === null
        ? state.players
        : state.players.map((player) => player.seat === action.targetSeat ? { ...player, alive: false } : player),
      hunterTarget: action.targetSeat,
    };
    next = checkWinner(next);
    if (next.phase === "ended") return next;
    const fromVote = Object.keys(state.votes).length > 0;
    return {
      ...next,
      day: fromVote ? state.day + 1 : state.day + 1,
      phase: fromVote ? "night_wolf" : "day_speech",
      speechOrder: fromVote ? [] : activePlayers(next).sort((left, right) => left.seat - right.seat).map((player) => player.user_id),
      speechIndex: 0,
      nightActions: {},
      votes: {},
      hunterTarget: null,
    };
  }

  throw new Error("Action inconnue.");
}

export function createPublicPrivateGameSnapshot(state: PrivateGameState, viewerId: string) {
  const viewer = state.players.find((player) => player.user_id === viewerId);
  if (!viewer) throw new Error("Tu ne fais pas partie de cette partie.");
  const wolfTarget = state.phase === "day_speech" || state.phase === "day_vote" || state.phase === "hunter" || state.phase === "ended"
    ? state.nightResult?.wolfTarget ?? null
    : isWolfRole(viewer.game_role)
      ? state.nightResult?.wolfTarget ?? null
      : null;

  return {
    day: state.day,
    phase: state.phase,
    players: state.players.map((player) => ({
      user_id: player.user_id,
      pseudo: player.pseudo,
      seat: player.seat,
      alive: player.alive,
      role: !player.alive || player.user_id === viewerId || state.phase === "ended" ? player.game_role : undefined,
    })),
    speeches: state.speeches,
    speechTurnUserId: state.speechOrder[state.speechIndex] ?? null,
    votes: state.phase === "day_vote" && Object.keys(state.votes).length < activePlayers(state).length
      ? {}
      : state.votes,
    voteCount: Object.keys(state.votes).length,
    nightResult: state.phase === "day_speech" || state.phase === "day_vote" || state.phase === "hunter" || state.phase === "ended"
      ? state.nightResult
        ? {
            deaths: state.nightResult.deaths,
            wolfTarget: state.nightResult.wolfTarget,
          }
        : null
      : null,
    privateInfo: {
      role: viewer.game_role,
      seerHistory: state.seerHistory[viewerId] ?? [],
      wolfAllies: isWolfRole(viewer.game_role)
        ? livingWolves(state).filter((player) => player.user_id !== viewerId).map((player) => player.pseudo)
        : [],
      wolfTarget,
      potionStatus: viewer.game_role === "Witch"
        ? { healUsed: state.witchHealUsed, poisonUsed: state.witchPoisonUsed, victimSeat: state.nightResult?.wolfTarget ?? null }
        : null,
      hasActed: state.phase === "day_speech"
        ? state.speeches.some((speech) => speech.user_id === viewerId && speech.day === state.day)
        : state.phase === "day_vote"
          ? typeof state.votes[viewerId] === "number"
          : state.phase.startsWith("night_")
            ? Boolean(state.nightActions[viewerId])
            : state.phase === "hunter"
              ? state.hunterTarget !== null
              : false,
    },
    winner: state.winner,
  };
}
