import { createHash } from 'node:crypto';
import { DEALER_LINES } from './dealerDialogue.js';
import { PLAYER_ACTION_LINES, PLAYER_EMOTES, EMOTE_DELIVERY } from '../shared/playerDialogue.js';
import { VOICE_CAST, VOICE_MODEL, PREVIEW_LINES, INTRO } from '../shared/voiceLines.js';

export const PLAIN_HAND_START = 'New hand. Shuffle up and deal.';
export const PLAIN_HAND_END = 'Hand over. Collecting the pot.';
export const SIDE_POT_END = 'Hand complete. Settling the main pot and side pots.';
export const RESULT_LINES = [
  'The pot is yours.', 'High card takes it.', 'One pair takes it.', 'Two pair takes it.',
  'Three of a kind takes it.', 'A straight takes it.', 'A flush takes it.',
  'A full house takes it.', 'Four of a kind takes it.', 'A straight flush takes it.',
  'A royal flush takes it.',
] as const;

export function voiceKey(speaker: string, text: string) {
  const cast = VOICE_CAST[speaker];
  if (!cast) throw new Error('Unknown voice.');
  return createHash('sha256').update(JSON.stringify([VOICE_MODEL, cast.voice, text, .5])).digest('hex');
}

/** The finite set of every spoken script the game can select. No player-supplied text. */
export const VOICE_CATALOG = (() => {
  const dealer = [...Object.values(DEALER_LINES).flat(), PLAIN_HAND_START, PLAIN_HAND_END, SIDE_POT_END, INTRO, ...RESULT_LINES];
  const ranks: Record<string,string> = {T:'ten',J:'jack',Q:'queen',K:'king',A:'ace'};
  for (const rank of '23456789TJQKA') for (const suit of ['spades','hearts','diamonds','clubs']) dealer.push(`${ranks[rank] || rank} of ${suit}.`);
  const entries = dealer.map(text => ({speaker:'dealer', text}));
  for (const speaker of Object.keys(VOICE_CAST).filter(id => id !== 'dealer')) {
    for (const text of Object.values(PLAYER_ACTION_LINES).flat()) entries.push({speaker, text});
    for (const [type, lines] of Object.entries(PLAYER_EMOTES)) {
      const kind = type as keyof typeof PLAYER_EMOTES;
      for (const text of [...lines, PREVIEW_LINES[kind]]) entries.push({speaker, text:`${EMOTE_DELIVERY[kind]} ${text}`});
    }
  }
  return [...new Map(entries.map(entry => [voiceKey(entry.speaker, entry.text), entry])).entries()]
    .map(([key, entry]) => ({key, ...entry, audioUrl:`/audio/voices/${key}.mp3`}));
})();

export const VOICE_LOOKUP = new Map(VOICE_CATALOG.map(entry => [entry.key, entry]));
