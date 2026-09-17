import { describe, it, expect } from "vitest";
import { PokerRoom } from "../../server/engine";
import { turnFeedback } from "./useTableFeedback";
import { cardPips, cardImageSource, cardLabel } from "../three/cardArtwork";

describe("player-facing turn feedback from authoritative snapshots", () => {
  function setup() {
    let now = 1_000_000;
    const room = new PokerRoom(
      "CUES42",
      { turnSeconds: 30, autoNextHand: false },
      { clock: () => now },
    );
    const host = room.addPlayer("Host", "juan"),
      guest = room.addPlayer("Guest", "jack"),
      rail = room.addPlayer("Rail", "nat", { spectator: true });
    room.start(host.id);
    return {
      room,
      host,
      guest,
      rail,
      advance: (ms: number) => (now += ms),
      now: () => now,
    };
  }
  it("shows a full clock only to the actor, then warns in the final five seconds", () => {
    const { room, host, guest, rail, advance, now } = setup();
    expect(turnFeedback(room.viewFor(host.id), now())).toMatchObject({
      myTurn: true,
      seconds: 30,
      progress: 1,
      urgent: false,
    });
    expect(turnFeedback(room.viewFor(guest.id), now()).myTurn).toBe(false);
    expect(turnFeedback(room.viewFor(rail.id), now()).myTurn).toBe(false);
    advance(25_100);
    expect(turnFeedback(room.viewFor(host.id), now())).toMatchObject({
      myTurn: true,
      seconds: 5,
      urgent: true,
    });
    advance(20_000);
    expect(turnFeedback(room.viewFor(host.id), now())).toMatchObject({
      seconds: 0,
      progress: 0,
    });
  });
  it("moves the cue with the real turn and removes the old viewer alarm on pause/disconnect", () => {
    const { room, host, guest, now } = setup();
    room.act(host.id, { type: "call" });
    expect(turnFeedback(room.viewFor(host.id), now()).myTurn).toBe(false);
    expect(turnFeedback(room.viewFor(guest.id), now()).myTurn).toBe(true);
    expect(turnFeedback(room.viewFor(guest.id), now(), false).myTurn).toBe(
      false,
    );
    room.pause(host.id, true);
    expect(turnFeedback(room.viewFor(guest.id), now())).toMatchObject({
      myTurn: false,
      paused: true,
    });
    room.pause(host.id, false);
    expect(turnFeedback(room.viewFor(guest.id), now()).myTurn).toBe(true);
  });
  it("restores the frozen clock from a paused server snapshot after rejoining", () => {
    const { room, host, advance, now } = setup();
    advance(12_000);
    room.pause(host.id, true);
    advance(120_000);
    expect(turnFeedback(room.viewFor(host.id), now())).toMatchObject({
      paused: true,
      myTurn: false,
      seconds: 18,
      progress: 0.6,
    });
    room.pause(host.id, false);
    expect(turnFeedback(room.viewFor(host.id), now())).toMatchObject({
      paused: false,
      myTurn: true,
      seconds: 18,
    });
    expect(turnFeedback(room.viewFor(host.id), now() - 60_000).seconds).toBe(
      30,
    );
  });
  it("has no active cue in a lobby or with a stale/disconnected turn token", () => {
    const { room, host, now } = setup(),
      view = room.viewFor(host.id);
    expect(turnFeedback(null, now()).live).toBe(false);
    expect(turnFeedback({ ...view, stage: "lobby" }, now()).live).toBe(false);
    expect(
      turnFeedback({ ...view, turnId: null, actions: null }, now()).myTurn,
    ).toBe(false);
  });
});

describe("one unambiguous deck for the HUD and 3D felt", () => {
  it("uses the correct pip count, corner identity and a distinct image for all 52 cards", () => {
    const ranks = "A23456789TJQK",
      images = new Set<string>();
    for (const suit of "shdc")
      for (const rank of ranks) {
        const card = rank + suit;
        images.add(cardImageSource(card));
        expect(cardLabel(card)).toContain(
          (
            { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as Record<
              string,
              string
            >
          )[suit],
        );
        if (!"JQK".includes(rank))
          expect(cardPips(rank)).toHaveLength(
            rank === "A" ? 1 : rank === "T" ? 10 : Number(rank),
          );
        expect(decodeURIComponent(cardImageSource(card))).toContain(
          "rotate(180)",
        );
      }
    expect(images.size).toBe(52);
    expect(cardLabel("Qs")).toBe("Queen of spades");
    expect(cardLabel("Th")).toBe("10 of hearts");
  });
  it("renders missing/invalid cards as a branded back instead of inventing a rank", () => {
    expect(cardLabel()).toBe("Face-down card");
    expect(cardLabel("Xs")).toBe("Face-down card");
    expect(cardImageSource("??")).toBe(cardImageSource());
    expect(decodeURIComponent(cardImageSource())).toContain("BIG PLAYERS");
  });
});
