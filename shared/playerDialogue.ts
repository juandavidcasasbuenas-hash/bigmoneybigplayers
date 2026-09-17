import type { Emote } from "./types";
export const PLAYER_ACTION_LINES = {
  check: ["Check.", "I check."],
  call: ["Call.", "I’ll call."],
  bet: ["Bet.", "I’ll bet."],
  raise: ["Raise.", "I’ll raise."],
  fold: ["Fold.", "I’m out."],
  "all-in": ["All in.", "I’m all in."],
} as const;
export type SpokenAction = keyof typeof PLAYER_ACTION_LINES;
export function actionSpeech(action: SpokenAction, variant: number) {
  const lines = PLAYER_ACTION_LINES[action];
  return lines[Math.abs(variant) % lines.length];
}

export const PLAYER_EMOTES: Record<Emote, string[]> = {
  bluff: [
    "I definitely know what I’m doing.",
    "This is what confidence looks like.",
    "I can smell your fear. Or the crisps.",
  ],
  laugh: [
    "That’s one way to donate chips.",
    "Absolutely calculated. Probably.",
    "Oh, this is going in the group chat.",
  ],
  stand: [
    "I’m just stretching. Nothing to see here.",
    "Right. Who wants a drink?",
    "Suddenly I have somewhere to be.",
  ],
  cry: [
    "My beautiful, imaginary fortune.",
    "Tell my chips I loved them.",
    "That river was a personal attack.",
  ],
  cheers: [
    "Big money. Big players.",
    "To questionable decisions!",
    "Cheers, you magnificent bluffers.",
  ],
  chips: [
    "Purely decorative confidence.",
    "A little chip choreography.",
    "Practising the only skill I have.",
  ],
  "chip-roll": ["Watch the fingers.", "Steady hands. Shaky strategy.", "The chips are on a roll."],
  "chip-toss": ["And the crowd goes mild.", "Nothing up my sleeve.", "A little air time."],
  shush: [
    "Quiet please. I’m doing important maths.",
    "Let the chips do the talking.",
    "I’m trying to look mysterious.",
  ],
};
export const EMOTE_DELIVERY: Record<Emote, string> = {
  chips: "[playful]",
  "chip-roll": "[playful]",
  "chip-toss": "[playful]",
  bluff: "[confident]",
  cheers: "[excited]",
  stand: "[sighs]",
  laugh: "[chuckles]",
  cry: "[dramatic]",
  shush: "[whispers]",
};
