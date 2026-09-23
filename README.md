# Big Money Poker Club

A private, just-for-fun 3D no-limit Texas Hold’em game for 2–12 friends. Cartoon characters based on the eight supplied reference photos, prepared in Blender with generated heads and contact-driven body rigs, three rooms, six cameras, and entirely imaginary chips marked **big money big players**. There are no payments, real-money balances, deposits, withdrawals, or prizes.

## Run it

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite runs the website on 5173 and proxies Socket.IO to the authoritative server on 3001. The terminal also prints the computer’s LAN address: friends on the same Wi-Fi can open that address. Each player enters a display name and chooses a character; no account required.

**Host table** creates a lobby with configurable rules. Share its invitation link, add optional practice bots, then choose **Deal**. **Practice** creates your own table with five clearly labelled bots and starts immediately. Practice continues across hands until you leave or win the tournament.

## Features

- No-limit Texas Hold’em only; 2–12 seats. Cryptographic Fisher–Yates shuffle on the server, burn cards, legal minimum raises, short all-ins, betting-right reopening, heads-up order, uncalled-bet refunds, main/side pots and tied odd-chip payouts.
- Host setup: table name, starting chips, capacity, decision timer, editable small/big blinds, per-player antes and minutes for every level, scheduled breaks, freezeout or capped rebuys, registration/rebuy cutoffs, late registration, spectator access and chat policy, automatic next hand, dealer voice and banter.
- Blinds and scheduled breaks change between hands. At the decision deadline a player checks if free, otherwise folds. Hosts can pause/resume all game timers. The final blind level repeats.
- Per-seat reconnect tokens saved in the player’s browser; an old socket is replaced when the seat opens elsewhere. Actions carry a unique turn token so an old click cannot act on a later turn.
- Spectators and eliminated players receive only public cards, have no betting controls, and use a separate rail chat by default. Folded and unshown hands stay private. Rebuys and late entries wait until the next hand.
- The Turf (an affectionate Oxford pub interpretation, not an exact architectural recreation), The High Roller penthouse, and The Garden Shed.
- My view (the default: behind your own chair, so you are always at the bottom of the screen, as in a card-room client), follow action, in my seat, overhead, cinema and free-orbit cameras. Follow action holds on each action for 1.7–1.9 seconds before moving to the next actor, whose clock then starts; fullscreen includes the dock, betting, audio, log and table controls.
- 543 bundled voice clips, prepared with ElevenLabs Eleven v3. No runtime speech generation or provider credentials. Public cards and winning hand types are spoken; arbitrary names and amounts stay in the log. Eight distinct character voices for actions and voluntary banter, 116 varied dealer lines, quiet joins, recorded audio and separate dealer/player volume controls. See [the voice booth](docs/VOICE.md).
- A visible house dealer, Monty, with dealing gestures and speech animation. A countdown ring, gold seat/action highlight and two-note chime announce your turn; the final five seconds turn red and tick. Card, chip and win sounds have a separate mute control. Paused clocks survive reconnects.
- A viewport-filling game with broadcast-style nameplates on the rail at every seat (portrait, name, stack, dealer/blind badges, last action, a countdown ring for whoever is acting) and bet amounts on the felt, all timed to the table animation so nothing is announced before it is seen. A single top bar carries the table, hand, blinds and level clock; the bottom dock holds your hand and its current value, the board and pot, and the betting panel: pot-sized presets (Min, ½, ¾, Pot, All in; big-blind multiples preflop), a slider with steppers and exact entry, and Fold / Check-Call / Raise buttons with F, C and R shortcuts. Reactions live in one popover; chat shows an unread badge.
- All-in showdowns expose every live contender only after betting closes. The showdown panel names each player, shows their public cards and updates win percentages as the board arrives. A Web Worker estimates preflop odds from 6,000 samples, then enumerates flop/turn runouts exactly. Splits appear separately; side-pot tables label probabilities as main-pot odds. Hidden hands never enter the calculation.
- Dealer, small-blind and big-blind positions have distinct physical buttons and a persistent name strip. Cards travel from Monty and flip onto the felt; bets join a growing centre pot, which is collected in small chip cuts with recorded foley.
- After a hand, Show exposes your cards and Muck keeps them private; doing nothing defaults to muck. Contested winners and exposed all-in hands must remain public. The host configures the celebration window (at least eight seconds after collection), with reactions available throughout, including for newly eliminated players. Manual and automatic next hands respect this window.
- Three original, quiet Lyria 2 instrumentals crossfade in the background and duck during speech. Music, voices and table effects have independent controls.
- One original vector deck supplies both the private hand HUD and the 3D board: mirrored indices, standard pip arrangements and two-ended court art.
- Nine voluntary reactions: riffle, knuckle roll, toss-and-catch, bluff, cheers, stand up, laugh, despair and shush. Emotes are theatre, do not act on your hand, and are never triggered automatically by private hand strength.
- Eight cartoon characters with three-dimensional faces, blinks, glances, card peeks, animated expressions and audio-reactive mouths: Juan, Jack, Clive, Doug, Nat, Tian, Humfrey and Diego. The Fal/Blender workflow preserves the cartoon style while retaining the existing contact rig. See [adding characters](docs/CHARACTERS.md).
- Contact-aware limbs use Three.js IK and Rapier collision queries. Seated legs clear the cushions, feet plant on the floor, chairs slide back when standing, and card/chip gestures share their hand contact points. See [packages, contact conventions and the rigged-asset upgrade path](docs/CONTACT_RIG.md).

## Play across the internet

**Supabase is not required.** One reachable Node server serves both the built website and realtime game. Static-only hosting is insufficient for this Socket.IO implementation.

```sh
npm run build
npm start
```

The production website is at port 3001 (or `PORT`). Use HTTPS for internet hosting. A [Render Blueprint](render.yaml) and [Dockerfile](Dockerfile) are included. GitHub stores the project; the game needs a running Node service for online play.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/juandavidcasasbuenas-hash/bigmoneybigplayers)

To test with friends:

1. Use **Deploy to Render** above, or create a Render Blueprint from this repository.
2. Voices, music and effects ship with the game. No Fal or ElevenLabs key is needed on Render.
3. When deployment is healthy, open the service's HTTPS URL, choose **Host table**, and share the invitation link with friends. They enter their names, choose characters and join; the host starts with **Deal**.

The Blueprint installs build and runtime tools explicitly, including under `NODE_ENV=production`. It uses one server for the website and Socket.IO, so no separate frontend URL or Supabase configuration is needed.

```sh
docker build -t big-money-poker .
docker run --rm -p 3001:3001 big-money-poker
```

The Docker image and Render build include all recorded voices in `dist/audio/voices`. Playback needs no provider key, persistent cache or generation step.


**Operational limits:** game rooms are in memory. A server restart or free-host recycle ends existing games; a reconnect token cannot recover a room after restart. Run one server instance, keep it awake for the game night, and use a persistent/always-on host if uninterrupted sessions matter. A future persistence layer needs to store private state server-side, never in public realtime broadcasts. Do not run multiple replicas without a shared authoritative room owner.

Invites are bearer-style room codes, not password-protected identities. Names and avatars are deliberately self-selected. Share links within your friend group. Public spectators receive a live public table rather than a delayed stream; a separate chat cannot prevent friends communicating outside the game. Native rig portraits are used in the picker. Original web-sized photo references remain in the assets: use this as a private friend-group application unless those pictured are comfortable with public hosting.

## Check it

```sh
npm test
npm run build
npm audit
```

Tests exercise 12-player dealing/chip conservation, heads-up order, side pots, short all-ins, odd ties, timers, pauses, blind progression, breaks, late entry, rebuys, host permissions, socket reconnect and replacement, stale turns, spectator payload filtering and hidden-card isolation, odds calculations, public all-in disclosure and ready-voice scheduling. Browser verification covers table creation, practice play, invitation joining, camera/room controls and responsive rendering.

## Structure

- `server/engine.ts`: server-owned tournament/hand state machine, using the MIT [pokersolver](https://github.com/goldfire/pokersolver) evaluator.
- `server/index.ts`: validated Socket.IO events, per-viewer broadcasts, room lifecycle and production static server.
- `shared/types.ts`: public protocol and default house rules. Never contains a deck or other players’ private state.
- `src/components/PokerScene.tsx`: Three.js table, visible dealer, rooms and cameras.
- `assets/tripo/`: reviewed cartoon references, exact prompts, Fal job receipts and editable Blender preparations; optimized generated heads are served from `public/models/tripo/`. See [the character workflow](docs/CHARACTER_PIPELINE.md).
- `assets/blender/`: editable shared body and fallback heads adapted from the Quaternius Standard base, with its supplied license and attribution.
- `src/three/BlenderCharacter.tsx` and `blenderRig.ts`: shared GLB geometry, independent skeletons, native facial shape animation and contact-driven body poses.
- `shared/seats.ts`: stable clockwise physical seat IDs used for action and dealing.
- `src/three/ContactRig.tsx`: body posture, jointed hands and held props; `contactMotion.ts` supplies shared grip/release choreography, `limbIK.ts` adapts Three's solver and `contactPhysics.ts` owns Rapier queries.
- `shared/dealTiming.ts`: synchronized dealer release, flight, pickup, sound and turn-start timings.
- `src/three/cardArtwork.ts`: shared SVG playing-card artwork.
- `src/three/textures.ts`: original procedural felt, labels, 3D card textures and chip art.
- `src/audio/tableAudio.ts`: table cues and the active speaker’s audio envelope.
- `src/data/characters.ts`: the expandable photo-to-character manifest.
- `src/hooks`: realtime connection, local voice and modal accessibility.
- [Research and sources](docs/RESEARCH.md): PKR features, graphics references, hosting alternatives and tournament decisions.

The interface and poker-specific adaptations are inspired by social poker games rather than copied PKR assets. Character sources include the user-supplied Juan model, Fal-generated cartoon heads and the licensed Quaternius body; see [asset provenance](assets/tripo/NOTICE.md). Faces blink and emote; speaking mouths follow the ElevenLabs audio envelope, without phoneme-level lip sync. Cartoon textures belong to the generated sculpts, while earlier photographic-face experiments are archived outside the public build. Voice chat, cross-server persistence, and a public deployment are not included.
