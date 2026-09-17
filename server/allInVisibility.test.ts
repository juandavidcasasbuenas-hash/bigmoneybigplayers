import { describe, it, expect } from "vitest";
import { PokerRoom } from "./engine";

describe("heads-up all-in public disclosure", () => {
  it("reveals both contenders only once no call or fold decision remains", () => {
    const room = new PokerRoom("ODDS42", { autoNextHand: false });
    const a = room.addPlayer("A", "juan"),
      b = room.addPlayer("B", "nat"),
      rail = room.addPlayer("Rail", "diego", { spectator: true });
    room.start(a.id);
    room.act(a.id, { type: "all-in" });
    expect(room.tableEvents.some((e) => e.type === "all-in")).toBe(false);
    expect(
      room.viewFor(b.id).players.find((p) => p.id === a.id)?.holeCards,
    ).toEqual([]);
    expect(
      room.viewFor(rail.id).players.every((p) => p.holeCards.length === 0),
    ).toBe(true);
    room.act(b.id, { type: "call" });
    const event = room
      .viewFor(rail.id)
      .tableEvents?.find((e) => e.type === "all-in");
    expect(event?.type).toBe("all-in");
    if (event?.type !== "all-in") throw new Error("Missing exposure");
    expect(event.players).toEqual([
      { playerId: a.id, cards: a.holeCards },
      { playerId: b.id, cards: b.holeCards },
    ]);
    expect(event.board).toEqual([]);
    expect(room.tableEvents.filter((e) => e.type === "all-in")).toHaveLength(1);
  });
  it("does not expose a folded hand or create a two-player odds event for a three-way pot", () => {
    const room = new PokerRoom("ODDS43", { autoNextHand: false });
    const p = [
      room.addPlayer("A", "juan"),
      room.addPlayer("B", "nat"),
      room.addPlayer("C", "diego"),
    ];
    room.start(p[0].id);
    room.act(p[0].id, { type: "all-in" });
    room.act(room.turnPlayerId!, { type: "call" });
    room.act(room.turnPlayerId!, { type: "call" });
    expect(room.tableEvents.some((e) => e.type === "all-in")).toBe(false);
    const other = new PokerRoom("ODDS44", { autoNextHand: false });
    const q = [
      other.addPlayer("A", "juan"),
      other.addPlayer("B", "nat"),
      other.addPlayer("C", "diego"),
    ];
    other.start(q[0].id);
    other.act(q[0].id, { type: "fold" });
    other.act(other.turnPlayerId!, { type: "all-in" });
    other.act(other.turnPlayerId!, { type: "call" });
    const event = other.tableEvents.find((e) => e.type === "all-in");
    expect(
      event?.type === "all-in" && event.players.map((p) => p.playerId),
    ).toEqual([q[1].id, q[2].id]);
    expect(
      other.viewFor(q[1].id).players.find((p) => p.id === q[0].id)?.holeCards,
    ).toEqual([]);
  });
});
