import { describe, expect, it } from "vitest";
import { PokerRoom } from "./engine";
import { motionDuration, planTableMotions } from "../shared/tableTimeline";
import { turnFeedback } from "../src/hooks/useTableFeedback";

function setup() {
  let now = 100000;
  const room = new PokerRoom(
    "PACE42",
    { autoNextHand: true, nextHandSeconds: 3, rebuys: true },
    { paced: true, clock: () => now },
  );
  const host = room.addPlayer("Juan", "juan"),
    guest = room.addPlayer("Nat", "nat");
  room.start(host.id);
  const ready = () => {
    now = room.turnStartsAt!;
    room.tick();
  };
  return {
    room,
    host,
    guest,
    ready,
    time: () => now,
    advance: (ms: number) => (now += ms),
  };
}
describe("live table pacing", () => {
  it("finishes the deal and each action before opening the next full turn clock", () => {
    const { room, host, guest, ready, time, advance } = setup();
    expect(room.availableActions(host.id)).toBeNull();
    expect(turnFeedback(room.viewFor(host.id), time()).live).toBe(false);
    expect(() => room.act(host.id, { type: "call" })).toThrow("not your turn");
    ready();
    expect(turnFeedback(room.viewFor(host.id), time())).toMatchObject({
      myTurn: true,
      seconds: 30,
    });
    room.act(host.id, { type: "call" });
    const action = room.tableEvents.at(-1)!;
    expect(room.turnStartsAt).toBe(time() + motionDuration(action));
    expect(room.turnEndsAt! - room.turnStartsAt!).toBe(30000);
    expect(room.availableActions(guest.id)).toBeNull();
    advance(1000);
    expect(room.tick()).toBe(false);
    expect(() => room.act(guest.id, { type: "check" })).toThrow(
      "not your turn",
    );
    ready();
    expect(room.availableActions(guest.id)?.canCheck).toBe(true);
  });
  it("preserves the remaining gesture and full next clock through a pause", () => {
    const { room, host, guest, ready, advance, time } = setup();
    ready();
    room.act(host.id, { type: "call" });
    advance(600);
    const starts = room.turnStartsAt!,
      eventTime = room.tableEvents.at(-1)!.presentAt!;
    room.pause(host.id, true);
    advance(15000);
    room.pause(host.id, false);
    expect(room.turnStartsAt).toBe(starts + 15000);
    expect(room.tableEvents.at(-1)!.presentAt).toBe(eventTime + 15000);
    expect(turnFeedback(room.viewFor(guest.id), time()).live).toBe(false);
    ready();
    expect(turnFeedback(room.viewFor(guest.id), time()).seconds).toBe(30);
  });
  it("orders the last action, public runout, award and next hand without a host fast-forward", () => {
    const { room, host, ready, time, advance } = setup();
    ready();
    room.act(room.turnPlayerId!, { type: "all-in" });
    ready();
    room.act(room.turnPlayerId!, { type: "call" });
    const burst = room.tableEvents.filter(
      (e) => e.at === time() && !(e.type === "bet" && e.forced),
    );
    const motions = planTableMotions(burst, time() + 200);
    expect(motions.map((e) => e.type)).toEqual([
      "bet",
      "all-in",
      "street",
      "street",
      "street",
      "showdown",
      "award",
    ]);
    for (let i = 1; i < motions.length; i++)
      expect(motions[i].startAt).toBe(
        motions[i - 1].startAt + motions[i - 1].duration,
      );
    const award = motions.at(-1)!;
    expect(room.nextHandAt).toBe(award.startAt + award.duration + 8000);
    expect(() => room.startHand()).toThrow("chips settle");
    advance(award.startAt + award.duration - time());
    const busted = room.players.find((p) => room.canRebuy(p.id));
    if (busted) room.rebuy(busted.id);
    expect(() => room.startHand()).toThrow("show or muck");
    advance(8000);
    expect(() => room.startHand()).not.toThrow();
    expect(room.handNumber).toBe(2);
    expect(
      room.viewFor(host.id).tableEvents?.some((e) => "holeCards" in e),
    ).toBe(false);
  });
});
