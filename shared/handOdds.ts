import solver from "pokersolver";
const { Hand } = solver;
export interface HeadsUpResult {
  wins: [number, number];
  tie: number;
  samples: number;
  exact: boolean;
}
const deck = Array.from("23456789TJQKA").flatMap((rank) =>
  Array.from("shdc", (suit) => rank + suit),
);
export function describeHand(cards: string[]) {
  if (cards.length < 2) return "";
  const hand = Hand.solve(cards);
  const words: Record<string, string> = {
    A: "Ace",
    K: "King",
    Q: "Queen",
    J: "Jack",
    "10": "Ten",
    "9": "Nine",
    "8": "Eight",
    "7": "Seven",
    "6": "Six",
    "5": "Five",
    "4": "Four",
    "3": "Three",
    "2": "Two",
  };
  return hand.descr.replace(
    /\b(A|K|Q|J|10|[2-9]) High\b/g,
    (_: string, rank: string) => `${words[rank]} high`,
  );
}
/** Only publicly exposed contenders and the currently visible board; never the deck or hidden hands. */
export function showdownOdds(
  hands: string[][],
  board: string[],
  samples = 6000,
): ShowdownOdds {
  const known = [...hands.flat(), ...board];
  if (
    hands.length < 2 || hands.length > 12 ||
    hands.some((h) => h.length !== 2) ||
    ![0, 3, 4, 5].includes(board.length) ||
    known.some((c) => !deck.includes(c)) ||
    new Set(known).size !== known.length
  )
    throw new Error("Invalid exposed hands or board");
  const remaining = deck.filter((c) => !known.includes(c)),
    missing = 5 - board.length;
  const wins = hands.map(() => 0), equity = hands.map(() => 0);
  let ties = 0,
    total = 0;
  const evaluate = (runout: string[]) => {
    const community = [...board, ...runout];
    const solved = hands.map(hand => Hand.solve([...hand, ...community]));
    const winners = Hand.winners(solved);
    if (winners.length > 1) ties++;
    for (let i=0;i<solved.length;i++) if (winners.includes(solved[i])) {
      if (winners.length === 1) wins[i]++;
      equity[i] += 1 / winners.length;
    }
    total++;
  };
  if (missing === 0) evaluate([]);
  else if (missing === 1) for (const card of remaining) evaluate([card]);
  else if (missing === 2)
    for (let i = 0; i < remaining.length; i++)
      for (let j = i + 1; j < remaining.length; j++)
        evaluate([remaining[i], remaining[j]]);
  else {
    let seed = known
      .join("")
      .split("")
      .reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 87231);
    const random = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < samples; i++) {
      const pool = [...remaining];
      for (let j = 0; j < missing; j++) {
        const k = j + Math.floor(random() * (pool.length - j));
        [pool[j], pool[k]] = [pool[k], pool[j]];
      }
      evaluate(pool.slice(0, missing));
    }
  }
  return {
    wins: wins.map(n => n / total * 100),
    equity: equity.map(n => n / total * 100),
    tie: (ties / total) * 100,
    samples: total,
    exact: missing <= 2,
  };
}

export interface ShowdownOdds { wins:number[]; equity:number[]; tie:number; samples:number; exact:boolean }

export function headsUpOdds(hands:[string[],string[]], board:string[], samples=6000):HeadsUpResult {
  const result=showdownOdds(hands,board,samples);
  return {wins:[result.wins[0],result.wins[1]],tie:result.tie,samples:result.samples,exact:result.exact};
}
