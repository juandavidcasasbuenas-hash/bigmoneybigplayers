import { randomInt } from "node:crypto";

/** Authored, cacheable Monty lines. Personality at hand boundaries, quiet during decisions. */
export const DEALER_LINES = {
  newHand: [
    "New hand. Fresh cards, fresh delusions.",
    "New hand. Keep your hopes above the felt.",
    "New hand. Somebody is about to become unbearable.",
    "New hand. Same friends, entirely new excuses.",
    "New hand. The deck has no memory. Your mates do.",
    "New hand. Eyes down, eyebrows under control.",
    "New hand. An excellent time to pretend you have a plan.",
    "New hand. The chips are imaginary. The grudges are not.",
    "New hand. A fresh start for some very tired bluffs.",
    "New hand. Please leave your dignity beside your pint.",
    "New hand. Good luck. You will insist it was skill.",
    "New hand. Nobody mention the previous one.",
    "New hand. All reputations temporarily restored.",
    "New hand. The next bad decision is on the house.",
    "New hand. Two cards each. No refunds on optimism.",
    "New hand. Back to looking suspiciously confident.",
    "New hand. Keep the cards close and the stories short.",
    "New hand. There is still time to look clever.",
    "New hand. Let us find out who paid attention.",
    "New hand. A small investment in future group-chat material.",
    "New hand. Everybody gets another chance to overthink it.",
    "New hand. The felt is green. The advice is questionable.",
    "New hand. The button moves. The excuses stay.",
    "New hand. Cards ready. Poker faces, presumably, optional.",
  ],
  handEnd: [
    "Hand over. Chips coming home.",
    "Hand complete. Let us settle the argument.",
    "That is the hand. Time to collect.",
    "Hand over. We have a winner.",
    "Hand complete. The pot has found its person.",
    "That settles it. Chips on the move.",
    "Hand over. A little redistribution of confidence.",
    "Hand complete. Someone is looking very pleased.",
    "That is settled. Mind the victory speech.",
    "Hand over. An excellent result for somebody.",
    "Hand complete. The chips have chosen a side.",
    "Hand over. Please collect your imaginary fortune.",
  ],
  uncontested: [
    "Hand over. Everybody else has folded.",
    "Hand over. No showdown required.",
    "Hand over. An undisputed pot.",
    "Hand over. The table has politely declined.",
    "Hand over. Keep those cards a mystery.",
    "Hand over. Nobody fancied finding out.",
    "Hand over. That pot went unchallenged.",
    "Hand over. No evidence will be necessary.",
  ],
  split: [
    "Hand over. We are splitting the pot.",
    "A split pot. Shared glory, separate egos.",
    "Hand complete. There is more than one winner.",
    "Split pot. A diplomatic conclusion.",
    "Hand over. Sharing is compulsory this time.",
    "A tied hand. Let us divide the spoils.",
    "Hand complete. A rare outbreak of equality.",
    "Split pot. You may both look smug.",
  ],
  allIn: [
    "All in. Cards doing the talking now.",
    "All in. A statement has been made.",
    "All in. Every last chip.",
    "All in. Somebody means business.",
    "All in. That is a confident little pile.",
    "All in. The whole imaginary lot.",
    "All in. Quite the contribution.",
    "All in. No chips left behind.",
  ],
  flop: [
    "The flop.",
    "Here is your flop.",
    "Three cards for the table.",
    "Flop coming over.",
    "Your first three cards.",
    "The flop is down.",
    "Let us see the flop.",
    "A little more information.",
  ],
  turn: [
    "The turn.",
    "Fourth card.",
    "Here comes the turn.",
    "Your turn card.",
    "One more piece of the puzzle.",
    "Turn card coming over.",
    "The fourth community card.",
    "Here is card number four.",
  ],
  river: [
    "The river.",
    "Last card.",
    "Here comes the river.",
    "Your final card.",
    "Fifth and final.",
    "No more cards after this.",
    "The river is down.",
    "The last piece of the puzzle.",
  ],
  champion: [
    "Tournament over. We have our champion!",
    "That is the tournament. One very smug champion!",
    "Tournament complete. Bragging rights have been awarded!",
    "We have a champion. The group chat will never recover.",
    "Tournament over. An entirely imaginary fortune, secured!",
    "A champion at last. Somebody put the kettle on.",
    "Tournament complete. The trophy is mostly an attitude.",
    "That is our champion. Same time next week?",
  ],
  resultQuips: [
    "Try to collect them quietly. You will not.",
    "A brief moment of competence. Treasure it.",
    "That will buy precisely none of the drinks.",
    "The group chat has been notified. Emotionally.",
    "Look pleased. You have earned at least three seconds.",
    "The post-match analysis will be wildly inaccurate.",
    "Enough chips to develop an unnecessary swagger.",
    "A victory for confidence and selective memory.",
    "Enjoy the view from up there.",
    "I can hear the retelling getting longer already.",
    "That pint suddenly tastes rather better.",
    "A respectable addition to the biscuit fund.",
    "A lovely result. An insufferable story.",
    "Please keep the victory lap inside the pub.",
    "The pot is yours. The theory is still debatable.",
    "That is going straight into the autobiography.",
    "A small fortune in absolutely nothing.",
    "Try to remain approachable.",
    "The chair may no longer fit that ego.",
    "No need to explain the strategy. We were all here.",
    "The landlord accepts congratulations, not these chips.",
    "Save a little room for the next disappointment.",
    "A difficult moment for the table experts.",
    "That smile is becoming a health hazard.",
  ],
} as const;
export type DialogueCategory = keyof typeof DEALER_LINES;

/** Shuffle bags exhaust every line in a category before repeating; boundary repeats are avoided too. */
export class DealerDialogue {
  private bags = new Map<DialogueCategory, string[]>();
  private previous = new Map<DialogueCategory, string>();
  constructor(private random: (max: number) => number = randomInt) {}
  pick(category: DialogueCategory): string {
    let bag = this.bags.get(category);
    if (!bag?.length) {
      bag = [...DEALER_LINES[category]];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = this.random(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.at(-1) === this.previous.get(category))
        [bag[0], bag[bag.length - 1]] = [bag.at(-1)!, bag[0]];
      this.bags.set(category, bag);
    }
    const line = bag.pop()!;
    this.previous.set(category, line);
    return line;
  }
}
