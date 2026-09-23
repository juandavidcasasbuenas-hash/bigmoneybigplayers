import { describe, expect, it } from "vitest";
import { seatHudAt } from "./seatHud";
import type { TableMotion } from "./tableTimeline";
import type { PublicPlayer, RoomState } from "./types";

const player = (id: string, over: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id, name: id, avatarId: "juan", seat: 0, chips: 1000, status: "active", connected: true,
  isBot: false, isHost: false, bet: 0, totalBet: 0, holeCards: [], cardCount: 2,
  lastAction: "", rebuyCount: 0, emote: null, ...over,
});
const room = (players: PublicPlayer[], over: Partial<RoomState> = {}) => ({
  players, stage: "preflop", dealerId: "a", smallBlindId: "b", bigBlindId: "c", winners: [], ...over,
}) as RoomState;
let seq = 0;
const motion = (startAt: number, data: Record<string, unknown>): TableMotion => ({
  id: `m${++seq}`, sequence: seq, at: startAt, handNumber: 1, startAt, duration: 1000, ...data,
}) as TableMotion;

describe("seat nameplates follow the visible table", () => {
  const deal = motion(0, { type: "hand-start", playerIds: ["a", "b", "c"] });
  const blinds = [
    motion(250, { type: "bet", playerId: "b", amount: 25, to: 25, forced: true }),
    motion(250, { type: "bet", playerId: "c", amount: 50, to: 50, forced: true }),
  ];

  it("does not reveal a fold or raise before its gesture starts", () => {
    const fold = motion(5000, { type: "fold", playerId: "a" });
    const raise = motion(7000, { type: "bet", playerId: "b", amount: 125, to: 150, forced: false, action: "raise" });
    const snapshot = room([
      player("a", { status: "folded" }),
      player("b", { bet: 150, totalBet: 150, chips: 850 }),
      player("c", { bet: 50, totalBet: 50, chips: 950 }),
    ]);
    const motions = [deal, ...blinds, fold, raise];
    const early = seatHudAt(snapshot, motions, 4000, false);
    expect(early.a.folded).toBe(false);
    expect(early.a.tag).toBeNull();
    expect(early.b).toMatchObject({ bet: 25, stack: 975 });
    const later = seatHudAt(snapshot, motions, 7500, false);
    expect(later.a).toMatchObject({ folded: true, tag: { text: "Folded" } });
    expect(later.b).toMatchObject({ bet: 150, stack: 850, tag: { text: "Raise", tone: "raise" } });
    expect(later.c).toMatchObject({ bet: 50, tag: null, bigBlind: true });
  });

  it("clears bets and action tags when the next street is dealt", () => {
    const call = motion(3000, { type: "bet", playerId: "a", amount: 50, to: 50, forced: false, action: "call" });
    const flop = motion(6000, { type: "street", stage: "flop", board: ["As", "Kd", "2c"] });
    const snapshot = room([player("a"), player("b"), player("c")], { stage: "flop" });
    const motions = [deal, ...blinds, call, flop];
    expect(seatHudAt(snapshot, motions, 4000, false).a).toMatchObject({ bet: 50, tag: { text: "Call" } });
    expect(seatHudAt(snapshot, motions, 6100, false).a).toMatchObject({ bet: 0, tag: null });
  });

  it("names winners only once the hand is settled", () => {
    const snapshot = room([player("a"), player("b")], { winners: [{ playerId: "a", amount: 300, hand: "Pair" }] });
    expect(seatHudAt(snapshot, [], 0, false).a.tag).toBeNull();
    expect(seatHudAt(snapshot, [], 0, true).a.tag).toEqual({ text: "Wins 300", tone: "win" });
  });
});
