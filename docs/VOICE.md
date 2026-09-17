# Voices around the table

Monty uses Daniel; each character has their own stock [ElevenLabs Eleven v3 voice through fal](https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3/api). These are character castings, not clones of the people in the reference photos.

| Character | Voice |
| --- | --- |
| Monty | Daniel |
| Juan | Charlie |
| Jack | Brian |
| Clive | George |
| Doug | Bill |
| Nat | Roger |
| Tian | Liam |
| Humfrey | Eric |
| Diego | Callum |

Players say short checks, calls, bets, raises, folds and all-ins during their own gestures. Two versions of each action across eight voices give **96 cached action clips**. Voluntary banter buttons also use the actor's voice; all three manual chip tricks have spoken quips too. Spectator reactions respect the separate rail. Joining, leaving, pausing and other log updates stay quiet. Monty no longer repeats a player's all-in declaration.

Monty announces new hands, public streets, hand endings, results and champions. `server/dealerDialogue.ts` holds 116 authored lines in shuffle bags; the all-in category is retained for authoring but no longer automatically spoken. Essential dealer cues remain plain when banter is disabled. Quips accompany every third result. The dealer starts at **78% volume**, players at **88%**. **Audio settings** controls both independently and saves this browser's preference. Voices, cards/chips and music can each be muted.

## Preparation and playback

- `npm run voices:warm`: cache the dealer bank. Cache hits make no provider call.
- `npx tsx scripts/warm-voices.ts --players`: cache all 96 short action clips.
- `npx tsx scripts/warm-voices.ts --banter`: cache all 216 voluntary spoken reactions plus eight character previews (224 clips, prepared locally).
- `npx tsx scripts/warm-voices.ts --cards`: cache 52 card names and 24 street introductions (76 clips, prepared locally).

These are explicit generation commands; missing clips use the configured fal account. Card calls are composed from the prepared introduction and individual card clips; dynamic winner names and amounts are generated on demand and cached. The client prefetches new cues, plays one voice at a time and drops stale speech. Pending generation does not block ready speech. Manual reactions have priority at clip boundaries; a started card sequence is allowed to finish. Future all-in streets are prepared immediately and played on the public presentation clock. A new hand, pause, mute, disconnection or leaving cancels old playback; unmuting does not replay history. A deliberate **Test audio** or **Hear [character]** preview works while automatic speech is muted. Mouth movement follows the actual audio envelope, without phoneme-level lip sync.

## Pace and foley

Live server rooms give bets **1.9 seconds**, all-ins **2.4 seconds**, and checks/folds **1.7 seconds** for anticipation, reach, release and recovery. Follow turn keeps the camera on that actor throughout. The next turn opens afterwards with its full configured decision time. Bots then take their own thinking time. `presentAt` timestamps keep gestures, voices and foley on the same public schedule; pauses shift that schedule and the timers together. Headless `PokerRoom` simulations can omit the `paced` option; the live Socket.IO server always enables it.

The initial deal takes at least 2.8 seconds, flop 1.7 seconds, turn/river 1.4 seconds each and pot collection 2.2 seconds. Heads-up all-ins add a 2.2-second exposed-hand beat. All-in runouts hold the flop for 8 seconds and turn/river for 4.6 seconds each, retaining complete card calls and time to read the odds. The configured result display starts after the runout and collection. A host cannot start another hand before the chips settle.

Paper card sounds and the table tap remain. The chip foley was replaced with four [ElevenLabs Sound Effects v2](https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2/api) generations: two small bets, a pot gather and a finger riffle. Prompts specify dull clay-composite impacts on padded felt. A low-pass filter and upper-mid cut reduce bright ringing, with restrained normalization. Bets alternate randomly between two clips; idle tricks are quieter and rotate between seats. Generated samples, prompts and receipts live in `public/audio/table/` and `docs/assets/foley/`.

`npx tsx scripts/generate-table-foley.ts --chips-v2` prepares the replacement bank; the original files and receipts remain for comparison. Gameplay spends no credits on foley playback. Own-turn chimes, countdown warnings and result cues use local synthesis. A short dry fallback covers unavailable samples.

## Ambient music

Three original instrumentals were generated through [fal Lyria 2](https://fal.ai/models/fal-ai/lyria2/api): After Hours, On the Button and Last Orders. They use sparse piano/guitar, upright bass and brushed percussion, without vocals. Playback crossfades over 1.8 seconds, starts at 16% and ducks to one fifth of that gain during speech. Music pauses while the tab is hidden or the music switch is off.

`npx tsx scripts/generate-music.ts` generates missing tracks using the private fal credential; existing files are reused. MP3s live in `public/audio/music/`; prompts, receipts and original WAVs live in `docs/assets/music/`. Normal gameplay uses these local files without generation calls.

## Configuration and boundaries

Set `FAL_KEY` in the server's private `.env` or host environment, never a `VITE_` variable. Credentials and runtime cache are excluded from Git and Docker. Use persistent storage for `VOICE_CACHE_DIR` (default `voice-cache`) on deployment. `VOICE_DAILY_CHAR_LIMIT` defaults to 50,000 newly generated characters per process/day; it is a process guard, not an account billing cap.

Authenticated requests identify an existing dealer message, accepted action or visible recent emote. Clients cannot provide arbitrary scripts or voice overrides. Forced blinds and silent logs cannot be voiced. Private cards and hidden rail reactions never reach the voice script. Identical requests from viewers share one generation; the queue is bounded to five active and 48 waiting jobs, with sanitized errors. Tests inject a synthesizer and never use paid credits.

Browser autoplay requires a click or key press. The table log remains available if audio is unavailable; there is no automatic browser-speech fallback. Actions that arrive too late to accompany their gesture are skipped rather than narrating an old decision.
