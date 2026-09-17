import type { Emote } from './types';

export const VOICE_MODEL = 'fal-ai/elevenlabs/tts/eleven-v3';
/** Stock character casting, not clones or impersonations of the people pictured. */
export const VOICE_CAST: Record<string, { voice:string; description:string }> = {
  dealer:{voice:'Daniel',description:'The house dealer · warm British storyteller'},
  juan:{voice:'Charlie',description:'Easygoing and confidently cheeky'},
  jack:{voice:'Brian',description:'Deep, warm, and entirely unruffled'},
  clive:{voice:'George',description:'Dry wit with a knowing smile'},
  doug:{voice:'Bill',description:'A friendly rasp and a good story'},
  nat:{voice:'Roger',description:'Polished delivery. Questionable decisions.'},
  tian:{voice:'Liam',description:'Relaxed, quietly mischievous'},
  humfrey:{voice:'Eric',description:'Smooth, measured, suspiciously calm'},
  diego:{voice:'Callum',description:'Expressive, theatrical confidence'},
};
export const PREVIEW_LINES: Record<Emote,string> = {
  bluff:'I definitely know what I’m doing. This is what confidence looks like.',
  cheers:'Big money. Big players. To questionable decisions!',
  stand:'Right. I’m off. Unless the river helps. Who wants a drink?',
  laugh:'Oh, this is going in the group chat. Absolutely calculated. Probably.',
  cry:'My beautiful, imaginary fortune. Tell my chips I loved them.',
  chips:'A little chip choreography.',
  'chip-roll':'Watch the fingers.',
  'chip-toss':'Nothing up my sleeve.',
  shush:'Quiet please. I’m doing important maths. Let the chips do the talking.',
};

export const INTRO='I’m Monty, your dealer. I’ll call the cards and settle the pots. You lot can supply the questionable decisions.';
