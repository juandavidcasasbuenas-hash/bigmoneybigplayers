import { describe, it, expect } from "vitest";
import { PokerRoom } from "./engine.js";
import { clockwiseDistance, SEAT_PREFERENCE } from "../shared/seats.js";
import { seatPosition } from "../src/three/seating.js";

describe("clockwise physical seating", () => {
  it("places every consecutive seat clockwise, leaving the house dealer gap", () => {
    const angles = Array.from({ length: 12 }, (_, seat) => {
      const [x, , z] = seatPosition(seat, 12).position;
      return Math.atan2(z, x);
    });
    const steps = angles.map(
      (angle, i) =>
        (angles[(i + 1) % 12] - angle + Math.PI * 2) % (Math.PI * 2),
    );
    expect(steps.reduce((sum, n) => sum + n, 0)).toBeCloseTo(Math.PI * 2, 8);
    expect(Math.max(...steps)).toBeLessThan(Math.PI / 2);
  });
  for (const count of [2, 3, 6, 12])
    it(`deals and acts clockwise with ${count} players`, () => {
      const room = new PokerRoom("SEATS", {
        maxPlayers: count,
        autoNextHand: false,
      });
      const joined = Array.from({ length: count }, (_, i) =>
        room.addPlayer(`P${i}`, "juan"),
      );
      expect(joined.map((p) => p.seat)).toEqual(
        SEAT_PREFERENCE.slice(0, count),
      );
      room.start(joined[0].id);
      const button = room.player(room.dealerId!);
      const order = [...joined].sort(
        (a, b) =>
          clockwiseDistance(button.seat, a.seat) -
          clockwiseDistance(button.seat, b.seat),
      );
      const deal = room.tableEvents.find((e) => e.type === "hand-start");
      expect(deal?.type === "hand-start" && deal.playerIds).toEqual(
        order.map((p) => p.id),
      );
      const preflop: number[] = [];
      while (room.stage === "preflop") {
        const p = room.player(room.turnPlayerId!);
        preflop.push(p.seat);
        const actions = room.availableActions(p.id)!;
        room.act(p.id, { type: actions.canCheck ? "check" : "call" });
      }
      const big = room.player(room.bigBlindId!);
      expect(preflop).toEqual(
        [...joined]
          .sort(
            (a, b) =>
              clockwiseDistance(big.seat, a.seat) -
              clockwiseDistance(big.seat, b.seat),
          )
          .map((p) => p.seat),
      );
      const flop: number[] = [];
      while (room.stage === "flop") {
        const p = room.player(room.turnPlayerId!);
        flop.push(p.seat);
        room.act(p.id, { type: "check" });
      }
      expect(flop).toEqual(order.map((p) => p.seat));
    });
  it("preserves occupied seats across rule edits, joins, folds and spectator entry", () => {
    const room = new PokerRoom("STABLE", {
      maxPlayers: 6,
      autoNextHand: false,
    });
    const players = Array.from({ length: 4 }, (_, i) =>
      room.addPlayer(`P${i}`, "juan"),
    );
    const positions = players.map((p) => p.seat);
    room.updateSettings(players[0].id, { startingStack: 2000, maxPlayers: 12 });
    room.addPlayer("New", "doug");
    room.addPlayer("Rail", "jack", { spectator: true });
    expect(players.map((p) => p.seat)).toEqual(positions);
    room.start(players[0].id);
    const folded = room.player(room.turnPlayerId!);
    room.act(folded.id, { type: "fold" });
    let after = folded.seat;
    while (room.stage === "preflop") {
      const candidate = room.players
        .filter((p) => p.status === "active")
        .sort(
          (a, b) =>
            clockwiseDistance(after, a.seat) - clockwiseDistance(after, b.seat),
        )[0];
      expect(room.turnPlayerId).toBe(candidate.id);
      after = candidate.seat;
      const action = room.availableActions(candidate.id)!;
      room.act(candidate.id, { type: action.canCheck ? "check" : "call" });
    }
    expect(players.map((p) => p.seat)).toEqual(positions);
  });
});
