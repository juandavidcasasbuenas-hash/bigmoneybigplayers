import { describe, it, expect } from "vitest";
import { presentRoom } from "./presentedRoom";
import { PokerRoom } from "../server/engine";
import { DEALER_LINES, DealerDialogue } from "../server/dealerDialogue";
import { isCurrentDealerCue } from "./dealerPolicy";
import {
  motionDuration,
  planTableMotions,
  initialBoardCount,
  publicBoardAt,
  settlementDelay,
} from "./tableTimeline";
import type { TableEvent } from "./types";
import { STREET, dealDuration } from "./dealTiming";

const setup = (count = 2) => {
  let time = Date.now();
  const room = new PokerRoom(
    "CUES42",
    { autoNextHand: true, nextHandSeconds: 3, rebuys: true },
    { clock: () => time },
  );
  const players = Array.from({ length: count }, (_, i) =>
    room.addPlayer(`Mate ${i}`, "juan"),
  );
  room.start(players[0].id);
  return {
    room,
    players,
    advance: (ms: number) => {
      time += ms;
      return time;
    },
  };
};
describe("dealer restraint and variety", () => {
  it("exhausts all 116 authored lines without repetition inside each category or across bag boundaries", () => {
    expect(Object.values(DEALER_LINES).flat()).toHaveLength(116);
    const dealer = new DealerDialogue((max) => max - 1);
    for (const category of Object.keys(
      DEALER_LINES,
    ) as (keyof typeof DEALER_LINES)[]) {
      const batch = Array.from({ length: DEALER_LINES[category].length }, () =>
        dealer.pick(category),
      );
      expect(new Set(batch).size).toBe(batch.length);
      expect(dealer.pick(category)).not.toBe(batch.at(-1));
    }
  });
  it("announces the new hand, leaves joins silent, and discards speech after the hand or street has moved on", () => {
    const { room, players, advance } = setup();
    const state = room.viewFor(players[0].id),
      start = state.dealerMessages.find((m) => m.kind === "hand-start")!;
    expect(start.speech).toMatch(/^New hand\./);
    expect(isCurrentDealerCue(state, start)).toBe(true);
    for (const log of state.dealerMessages.filter((m) => m.kind === "log"))
      expect(isCurrentDealerCue(state, log)).toBe(false);
    expect(isCurrentDealerCue({ ...state, paused: true }, start)).toBe(false);
    expect(
      isCurrentDealerCue(
        { ...state, settings: { ...state.settings, dealerVoice: false } },
        start,
      ),
    ).toBe(false);
    expect(isCurrentDealerCue({ ...state, handNumber: 2 }, start)).toBe(false);
    expect(isCurrentDealerCue(state, start, advance(14000))).toBe(false);
    const street = {
      ...start,
      kind: "street" as const,
      stage: "flop" as const,
    };
    expect(
      isCurrentDealerCue({ ...state, stage: "flop" }, street, start.at + 1000),
    ).toBe(true);
    expect(
      isCurrentDealerCue({ ...state, stage: "river" }, street, start.at + 1000),
    ).toBe(false);
  });
});
describe("public, ordered table choreography", () => {
  it('resumes a runout without flashing unreleased cards, even with truncated hand history', () => {
    const turn: TableEvent = {type:'street',stage:'turn',board:['2c','3d','7h','8s'],id:'turn',sequence:120,at:1000,presentAt:9000,handNumber:1};
    const river: TableEvent = {...turn,id:'river',sequence:121,stage:'river',board:[...turn.board,'9c'],presentAt:13600};
    const motions = planTableMotions([turn,river],10000);
    const base = initialBoardCount(5,[turn,river]);
    expect(base).toBe(3);
    expect(publicBoardAt(river.board,base,motions,8500)).toEqual(['2c','3d','7h']);
    expect(publicBoardAt(river.board,base,motions,12000)).toEqual(turn.board);
    expect(initialBoardCount(5,[])).toBe(5);
  });
  it("deals to 12 seats clockwise in two rounds, with no private cards in the event stream", () => {
    const { room, players } = setup(12),
      events = room.viewFor(players[0].id).tableEvents!;
    const deal = events.find((e) => e.type === "hand-start")!;
    expect(deal.type).toBe("hand-start");
    if (deal.type !== "hand-start") return;
    expect(deal.playerIds).toEqual(
      [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5].map(
        (seat) => players.find((p) => p.seat === seat)!.id,
      ),
    );
    expect(new Set(deal.playerIds).size).toBe(12);
    expect(motionDuration(deal)).toBeGreaterThanOrEqual(dealDuration(12));
    expect(JSON.stringify(events)).not.toMatch(/holeCards|deck|token/);
    expect(events.filter((e) => e.type === "bet" && e.forced)).toHaveLength(2);
    const motions = planTableMotions(events, 1000);
    expect(motions[0].startAt).toBe(1000);
    expect(
      motions.filter((e) => e.type === "bet").every((e) => e.startAt === 1250),
    ).toBe(true);
  });
  it("retains every all-in street in one snapshot and gives the result time to be seen before the next deal", () => {
    const { room, players, advance } = setup();
    advance(5000);
    const previous = room.tableEvents.at(-1)!.sequence;
    room.act(room.turnPlayerId!, { type: "all-in" });
    room.act(room.turnPlayerId!, { type: "call" });
    const state = room.viewFor(players[0].id),
      fresh = state.tableEvents!.filter((e) => e.sequence > previous);
    const streets = fresh.filter((e) => e.type === "street");
    expect(streets.map((e) => e.type === "street" && e.stage)).toEqual([
      "flop",
      "turn",
      "river",
    ]);
    expect(streets.map((e) => e.type === "street" && e.board.length)).toEqual([
      3, 4, 5,
    ]);
    expect(fresh.at(-1)?.type).toBe("award");
    const now = state.tableEvents!.at(-1)!.at,
      motions = planTableMotions(fresh, now),
      award = motions.at(-1)!;
    expect(award.startAt).toBe(now + settlementDelay(state, now));
    expect(room.nextHandAt).toBeGreaterThanOrEqual(
      award.startAt + award.duration + 3000,
    );
    expect(publicBoardAt(state.board, 0, motions, now)).toHaveLength(0);
    const flop = motions.find((e) => e.type === "street")!;
    expect(
      publicBoardAt(
        state.board,
        0,
        motions,
        flop.startAt + STREET.release + STREET.flight - 1,
      ),
    ).toHaveLength(0);
    expect(
      publicBoardAt(
        state.board,
        0,
        motions,
        flop.startAt + STREET.release + STREET.flight,
      ),
    ).toHaveLength(1);
    expect(
      publicBoardAt(
        state.board,
        0,
        motions,
        flop.startAt + STREET.release + STREET.flight + 2 * STREET.interval,
      ),
    ).toHaveLength(3);
    expect(publicBoardAt(state.board, 0, motions, award.startAt)).toHaveLength(
      5,
    );
    // Public history is a defensive copy, never an engine-state reference.
    state.tableEvents!.length = 0;
    expect(room.tableEvents.length).toBeGreaterThan(0);
  });
  it("continues a pending deal before later actions and keeps reconnect hydration static", () => {
    const { room } = setup();
    const original = planTableMotions(room.tableEvents, 1000);
    const end = Math.max(...original.map((e) => e.startAt + e.duration));
    const bet: TableEvent = {
      id: "new",
      sequence: 100,
      handNumber: 1,
      at: 1200,
      type: "bet",
      playerId: "one",
      amount: 100,
      to: 100,
      forced: false,
    };
    const [motion] = planTableMotions([bet], 1200, end);
    expect(motion.startAt).toBe(end);
    expect(publicBoardAt(["As", "Kd", "Qh"], 3, [], 2000)).toEqual([
      "As",
      "Kd",
      "Qh",
    ]);
  });
});

it("holds credited stacks and champion labels until the visible award without changing server state", () => {
  const { room, players, advance } = setup();
  advance(5000);
  room.act(room.turnPlayerId!, { type: "all-in" });
  room.act(room.turnPlayerId!, { type: "call" });
  const state = room.viewFor(players[0].id),
    before = JSON.stringify(state),
    shown = presentRoom(state, true, 3)!;
  expect(shown.stage).toBe("flop");
  expect(shown.players.every((p) => p.chips === 0)).toBe(true);
  expect(shown.players.some((p) => p.status === "out")).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
  expect(presentRoom(state, false, 5)).toBe(state);
  state.players.push({
    ...state.players[0],
    id: "previously-out",
    chips: 0,
    cardCount: 0,
    holeCards: [],
    status: "out",
  });
  expect(presentRoom(state, true, 3)!.players.at(-1)!.status).toBe("out");
});
