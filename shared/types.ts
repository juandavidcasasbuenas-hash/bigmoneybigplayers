import type { SpokenAction } from "./playerDialogue";
export type Card = string; // e.g. 'As', 'Td'; hidden cards are never serialized.
export type Stage =
  "lobby" | "preflop" | "flop" | "turn" | "river" | "showdown" | "finished";
export type RoomTheme = "turf" | "penthouse" | "basement";
export type PlayerStatus =
  "waiting" | "active" | "folded" | "all-in" | "out" | "spectator";
export type Emote =
  "bluff" | "laugh" | "stand" | "cry" | "cheers" | "shush" | "chips" | "chip-roll" | "chip-toss";
export interface BlindLevel {
  small: number;
  big: number;
  ante: number;
  minutes: number;
}
export interface GameSettings {
  name: string;
  startingStack: number;
  maxPlayers: number;
  turnSeconds: number;
  levels: BlindLevel[];
  rebuys: boolean;
  rebuyUntilLevel: number;
  maxRebuys: number;
  lateRegistration: boolean;
  lateRegistrationUntilLevel: number;
  allowSpectators: boolean;
  spectatorChat: "separate" | "table";
  autoNextHand: boolean;
  nextHandSeconds: number;
  roomTheme: RoomTheme;
  dealerVoice: boolean;
  banter: boolean;
  breakEveryLevels: number;
  breakMinutes: number;
}
export interface PublicPlayer {
  id: string;
  name: string;
  avatarId: string;
  seat: number;
  chips: number;
  status: PlayerStatus;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  bet: number;
  totalBet: number;
  holeCards: Card[];
  cardCount: number;
  lastAction: string;
  rebuyCount: number;
  emote: { type: Emote; at: number; text: string } | null;
}
export interface Pot {
  amount: number;
  eligible: string[];
}
export interface Winner {
  playerId: string;
  amount: number;
  hand: string;
}
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  channel: "table" | "spectators";
  at: number;
}
export type DealerCueKind =
  | "log"
  | "hand-start"
  | "street"
  | "hand-end"
  | "result"
  | "all-in"
  | "champion";
export interface DealerMessage {
  id: string;
  text: string;
  at: number;
  kind?: DealerCueKind;
  handNumber?: number;
  speech?: string;
  segments?: string[];
  /** Delay result-related log entries until the public pot award. */
  afterAward?: boolean;
  stage?: Stage;
}
export type TableEventData =
  | { type: "hand-start"; playerIds: string[] }
  | {
      type: "bet";
      playerId: string;
      amount: number;
      to: number;
      forced: boolean;
      action?: SpokenAction;
    }
  | { type: "check" | "fold"; playerId: string }
  | { type: "street"; stage: "flop" | "turn" | "river"; board: Card[]; runout?: boolean }
  | { type: "all-in"; players: {playerId:string; cards:Card[]}[]; board:Card[] }
  | { type: "award"; winners: Winner[]; pot: number };
export type TableEvent = TableEventData & {
  id: string;
  sequence: number;
  at: number;
  handNumber: number;
  presentAt?: number;
  speech?: string;
};
export interface AvailableActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaiseTo: number;
  maxRaiseTo: number;
}
export interface RoomState {
  code: string;
  settings: GameSettings;
  hostId: string;
  you: string;
  stage: Stage;
  players: PublicPlayer[];
  board: Card[];
  pot: number;
  pots: Pot[];
  currentBet: number;
  dealerId: string | null;
  smallBlindId: string | null;
  bigBlindId: string | null;
  turnPlayerId: string | null;
  turnId: string | null;
  turnStartsAt?: number | null;
  turnEndsAt: number | null;
  handNumber: number;
  levelIndex: number;
  currentLevel: BlindLevel;
  levelEndsAt: number | null;
  paused: boolean;
  pausedAt?: number | null;
  breakEndsAt: number | null;
  nextHandAt: number | null;
  tableEvents?: TableEvent[];
  winners: Winner[];
  dealerMessages: DealerMessage[];
  chat: ChatMessage[];
  actions: AvailableActions | null;
  canRebuy: boolean;
  startedAt: number | null;
}
export type PokerAction = (
  | { type: "fold" | "check" | "call" | "all-in" }
  | { type: "raise"; amount: number }
) & { turnId?: string };
export interface Ack {
  ok: boolean;
  error?: string;
  roomCode?: string;
  token?: string;
  playerId?: string;
}
export interface CreateRoomRequest {
  name: string;
  avatarId: string;
  settings?: Partial<GameSettings>;
}
export interface JoinRoomRequest {
  roomCode: string;
  name?: string;
  avatarId?: string;
  token?: string;
  spectator?: boolean;
}
export const DEFAULT_SETTINGS: GameSettings = {
  name: "The Friday Night Bluff",
  startingStack: 10000,
  maxPlayers: 12,
  turnSeconds: 30,
  levels: [
    { small: 25, big: 50, ante: 0, minutes: 15 },
    { small: 50, big: 100, ante: 0, minutes: 15 },
    { small: 75, big: 150, ante: 0, minutes: 15 },
    { small: 100, big: 200, ante: 25, minutes: 15 },
    { small: 150, big: 300, ante: 25, minutes: 15 },
    { small: 200, big: 400, ante: 50, minutes: 15 },
    { small: 300, big: 600, ante: 75, minutes: 15 },
    { small: 500, big: 1000, ante: 100, minutes: 15 },
    { small: 750, big: 1500, ante: 150, minutes: 15 },
    { small: 1000, big: 2000, ante: 200, minutes: 15 },
    { small: 1500, big: 3000, ante: 300, minutes: 15 },
    { small: 2500, big: 5000, ante: 500, minutes: 15 },
  ],
  rebuys: false,
  rebuyUntilLevel: 3,
  maxRebuys: 1,
  lateRegistration: true,
  lateRegistrationUntilLevel: 3,
  allowSpectators: true,
  spectatorChat: "separate",
  autoNextHand: true,
  nextHandSeconds: 8,
  roomTheme: "turf",
  dealerVoice: true,
  banter: true,
  breakEveryLevels: 0,
  breakMinutes: 5,
};
