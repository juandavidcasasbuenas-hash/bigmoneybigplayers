import { synthesizeVoice } from "./lib/voice-provider.js";
import { VOICE_CAST, PREVIEW_LINES } from "../shared/voiceLines.js";
import { DEALER_LINES } from "../server/dealerDialogue.js";
import {
  PLAYER_ACTION_LINES,
  PLAYER_EMOTES,
  EMOTE_DELIVERY,
} from "../shared/playerDialogue.js";
// Explicit preparation only. Cache hits are free; misses call ElevenLabs via fal.
const players = process.argv.includes("--players"),
  banter = process.argv.includes("--banter"), cards = process.argv.includes("--cards");
const lines = process.argv.includes("--dealer-bank")
  ? [
      ...DEALER_LINES.newHand,
      ...DEALER_LINES.handEnd,
      ...DEALER_LINES.uncontested,
      ...DEALER_LINES.split,
      ...DEALER_LINES.allIn,
    ]
  : [DEALER_LINES.newHand[0], DEALER_LINES.handEnd[0]];
const cardNames=Array.from('23456789TJQKA').flatMap(rank=>['spades','hearts','diamonds','clubs'].map(suit=>`${({T:'ten',J:'jack',Q:'queen',K:'king',A:'ace'} as Record<string,string>)[rank]||rank} of ${suit}.`));
const jobs = cards ? [...DEALER_LINES.flop,...DEALER_LINES.turn,...DEALER_LINES.river,...cardNames].map(text=>({speaker:'dealer',text})) : banter
  ? Object.keys(VOICE_CAST)
      .filter((s) => s !== "dealer")
      .flatMap((speaker) => [
        ...Object.entries(PLAYER_EMOTES)
          .flatMap(([kind, lines]) =>
            lines.map((text) => ({
              speaker,
              text: `${EMOTE_DELIVERY[kind as keyof typeof EMOTE_DELIVERY]} ${text}`,
            })),
          ),
        { speaker, text: `${EMOTE_DELIVERY.cheers} ${PREVIEW_LINES.cheers}` },
      ])
  : players
    ? Object.keys(VOICE_CAST)
        .filter((s) => s !== "dealer")
        .flatMap((speaker) =>
          Object.values(PLAYER_ACTION_LINES)
            .flat()
            .map((text) => ({ speaker, text })),
        )
    : [
        ...new Set([
          ...lines,
          "New hand. Shuffle up and deal.",
          "Hand over. Collecting the pot.",
        ]),
      ].map((text) => ({ speaker: "dealer", text }));
const total = jobs.length;
let completed = 0,
  failed = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (jobs.length) {
      const job = jobs.shift()!;
      try {
        await synthesizeVoice(job.text, job.speaker);
        completed++;
      } catch (error) {
        failed++;
        console.error(
          `${job.speaker}: ${error instanceof Error ? error.message : "generation failed"}`,
        );
      }
      if ((completed + failed) % 8 === 0)
        console.log(`${completed}/${total} voice cues cached`);
    }
  }),
);
console.log(`${completed} voice cues ready; ${failed} failures.`);
if (failed) process.exitCode = 1;
