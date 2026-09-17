import { describe, it, expect } from "vitest";
import { headsUpOdds, describeHand } from "./handOdds";

describe("visible hand evaluation and heads-up win probabilities", () => {
  it("names the actual best five cards, including pairs before a flop and the wheel", () => {
    expect(describeHand(["As", "Ad"])).toContain("Pair");
    expect(describeHand(["As", "Kd"])).toBe("Ace high");
    expect(describeHand(["As", "2d", "3c", "4h", "5s", "Kd", "Kh"])).toContain(
      "Straight",
    );
    expect(describeHand(["As", "Ad", "Ah", "Ks", "Kd", "2c", "3d"])).toContain(
      "Full House",
    );
  });
  it("enumerates every remaining turn card and separates ties from wins", () => {
    const result = headsUpOdds(
      [
        ["As", "Ad"],
        ["Ks", "Kd"],
      ],
      ["2c", "3c", "7h", "9h"],
    );
    expect(result).toEqual({
      wins: [(42 / 44) * 100, (2 / 44) * 100],
      tie: 0,
      samples: 44,
      exact: true,
    });
  });
  it("recognises a shared royal flush as a guaranteed split, regardless of hole cards", () => {
    expect(
      headsUpOdds(
        [
          ["2c", "3d"],
          ["4h", "5d"],
        ],
        ["As", "Ks", "Qs", "Js", "Ts"],
      ),
    ).toEqual({ wins: [0, 0], tie: 100, samples: 1, exact: true });
  });
  it("exhaustively enumerates 990 flop runouts without replacing cards", () => {
    const result = headsUpOdds(
      [
        ["As", "Ad"],
        ["Ks", "Kd"],
      ],
      ["2c", "3c", "7h"],
    );
    expect(result.samples).toBe(990);
    expect(result.exact).toBe(true);
    expect(result.wins[0]).toBeGreaterThan(89);
    expect(result.wins[0]).toBeLessThan(93);
    expect(result.wins[0] + result.wins[1] + result.tie).toBeCloseTo(100, 8);
  });
  it("gives reproducible preflop estimates from exposed cards alone", () => {
    const result = headsUpOdds(
      [
        ["As", "Ad"],
        ["Ks", "Kd"],
      ],
      [],
    );
    expect(result.exact).toBe(false);
    expect(result.samples).toBe(6000);
    expect(result.wins[0]).toBeGreaterThan(79);
    expect(result.wins[0]).toBeLessThan(85);
    expect(result).toEqual(
      headsUpOdds(
        [
          ["As", "Ad"],
          ["Ks", "Kd"],
        ],
        [],
      ),
    );
  });
  it("rejects duplicate, incomplete, and non-card inputs", () => {
    for (const [hands, board] of [
      [
        [
          ["As", "Ad"],
          ["As", "Kd"],
        ],
        [],
      ],
      [[["As"], ["Ks", "Kd"]], []],
      [
        [
          ["As", "Ad"],
          ["Ks", "Kd"],
        ],
        ["2c"],
      ],
    ])
      expect(() =>
        headsUpOdds(hands as [string[], string[]], board as string[]),
      ).toThrow();
  });
});
