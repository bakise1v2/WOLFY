export type UserRole = "player" | "admin";

export type GameRole =
  | "loup-garou"
  | "voyante"
  | "sorciere"
  | "chasseur"
  | "cupidon"
  | "villageois"
  | "salvateur"
  | "grand-mechant-loup";

export type GamePhase = "waiting" | "night" | "day" | "voting" | "ended";

export type GameStatus = "lobby" | "running" | "finished";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  disabled: boolean;
  lastLogin?: string;
}

export interface GamePlayer {
  uid: string;
  displayName: string;
  role?: GameRole; // only visible to self or admin
  isAlive: boolean;
  isReady: boolean;
  team?: "village" | "wolves" | "lovers";
}

export interface NightAction {
  actorUid: string;
  targetUid?: string;
  actionType: "kill" | "see" | "heal" | "protect" | "link" | "poison" | "save";
  resolved: boolean;
  nightNumber: number;
}

export interface Vote {
  voterUid: string;
  targetUid: string;
  dayNumber: number;
}

export interface GameConfig {
  roles: Partial<Record<GameRole, number>>;
  maxPlayers: number;
  minPlayers: number;
}

export interface Game {
  id: string;
  name: string;
  code: string; // private room code
  status: GameStatus;
  phase: GamePhase;
  createdBy: string;
  createdAt: string;
  players: Record<string, GamePlayer>;
  config: GameConfig;
  nightNumber: number;
  dayNumber: number;
  currentNightActions?: NightAction[];
  votes?: Vote[];
  eliminated: string[];
  winners?: "village" | "wolves" | "lovers" | null;
  history: GameEvent[];
  adminNotes?: string;
}

export interface GameEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  visibleTo: "all" | "admin" | "wolves" | string; // uid or group
}

export interface SecretCard {
  uid: string;
  role: GameRole;
  gameId: string;
}

// Default role distribution for 8-10 players
export const DEFAULT_ROLE_CONFIG: Partial<Record<GameRole, number>> = {
  "loup-garou": 2,
  "grand-mechant-loup": 0,
  voyante: 1,
  sorciere: 1,
  chasseur: 1,
  cupidon: 1,
  salvateur: 0,
  villageois: 3,
};

export const ROLE_LABELS: Record<GameRole, string> = {
  "loup-garou": "Loup-Garou",
  voyante: "Voyante",
  sorciere: "Sorcière",
  chasseur: "Chasseur",
  cupidon: "Cupidon",
  villageois: "Villageois",
  salvateur: "Salvateur",
  "grand-mechant-loup": "Grand Méchant Loup",
};

export const ROLE_DESCRIPTIONS: Record<GameRole, string> = {
  "loup-garou": "Chaque nuit, les loups se concertent pour dévorer un villageois.",
  voyante: "Chaque nuit, la Voyante peut découvrir le rôle d'un joueur.",
  sorciere: "Possède une potion de vie et une potion de mort. Une seule utilisation chacune.",
  chasseur: "S'il meurt, il peut emporter un joueur avec lui dans la tombe.",
  cupidon: "Au début de la partie, désigne deux amoureux. S'ils meurent, l'autre meurt aussi.",
  villageois: "Simple habitant du village. Vote le jour pour éliminer les loups.",
  salvateur: "Chaque nuit, peut protéger un joueur des attaques des loups.",
  "grand-mechant-loup": "Loup ultra puissant qui peut tuer deux personnes certaines nuits.",
};
