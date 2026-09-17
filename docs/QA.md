# Frontend QA — 11 September 2026

## Current native-cartoon and gameplay-feedback pass

- Replaced the eight textured heads with native geometry faces and regenerated all eight picker portraits from the actual rigs. No active manifest or runtime source references a GLB head. Earlier generated assets are archived outside the public build.
- Twelve seated players plus Monty render in the complete table view. Local Chromium after warmup ran around 30–32 fps at the intentional 30 fps cadence. The 1000×750 full-table sample reported 1,364 draw calls including shadow passes and 1,008,936 triangles. A follow-camera sample culls much of the room and reports fewer draws; those figures are not a whole-scene polygon budget.
- Animation sampling observed 13 independently animated actors, blink closure to 0.055 scale, changing head yaw and expressive mouth openings. The follow-camera test changed focus between actors every five seconds. A real ElevenLabs preview visibly drove the native mouth in the crew view.
- In a real practice hand, browser audio instrumentation observed the 659.25/987.77 Hz own-turn chime and exactly one 880 Hz tick at 5, 4, 3, 2 and 1 seconds. Chip cues played for public betting. The five warning notes all belonged to the local actor, not opponents.
- The real DOM hand and community board use the same original SVG artwork as the 3D felt: standard pip counts, mirrored corners and two-ended courts. Players hold one pair of card backs; chip stacks remain after folding.
- At 390×844, the private cards, community cards, countdown and camera/audio controls had no horizontal document overflow. The 358×420 twelve-player inspection viewport also had no horizontal overflow; this is emulation, not a physical-phone performance certification.
- Production client on port 3001 loaded the native cast, enabled hosting after its realtime connection, exposed the configured dealer voice and produced no browser page errors. Native portraits and the homepage returned HTTP 200. Manual camera selections now cut directly to the chosen view; follow mode still interpolates between successive actors.
- Live pause/reload verification retained exactly 21 seconds, the same progress-ring offset and the same 14:43 blind clock before and after reload. All DOM images loaded; browser resource inspection found zero GLB requests.
- Added server pause timestamp to public snapshots so reconnecting into a pause retains the correct decision and blind clocks. Added a regression covering a two-minute paused absence, resume, deadline clamp, actors, spectators and stale turns.
- Automated suite: **55 tests across five files passed**. Production build passed. Tests include engine, privacy, socket/reconnect, voice authorization/queueing and the new deck/turn feedback cases; provider calls in tests are mocked.

## Earlier application checks retained below

The following records describe checks completed before the native-character pass. Historical GLB renderer measurements are labeled separately.

## Completed fixes

- `usePoker`: reconnect restores a seat before reporting table readiness; disconnect removes stale actions/turn IDs; failed recovery clears the stale table. A displaced tab handles `session-replaced` without deleting the replacement tab's private token.
- Client requests now have an immediate duplicate-click guard, private seat recovery after uncertain create/join acknowledgements, and the server's current `turnId` on betting commands. No mutating command is automatically retried after an uncertain acknowledgement.
- Leave clears the view only after confirmation. A seat retained by the engine during a live hand keeps its recovery token; a removed lobby seat loses its token.
- `useModal`: initial focus, Tab containment, Escape dismissal, scroll locking and focus restoration. Integrated with setup; App owner integrated help/invite.
- Setup uses lazy preference/settings initialization, storage failure fallback, valid avatar fallback, whitespace name validation, selected-section semantics and busy form semantics.
- Premium voice uses server-authorized event IDs, room code and private token; it never accepts arbitrary client text or uses browser speech synthesis. Generated clips play sequentially with parallel prefetch, cancellation on mute/leave, stale banter filtering, error/blocked status and explicit preview support.

## Verification performed

- TypeScript no-emit check passed after the final hook changes.
- Actual browser setup checks: initial name focus, valid display name, Tab wrap to close button, Escape dismissal and body scroll unlock passed. Focus restoration during server hot reload could not be verified reliably because the opener became disabled.
- A lightweight browser harness mounted the real voice hook with mocked network/audio, without loading 3D or spending provider credit. Passed: provider readiness, parallel clip prefetch, sequential playback, duplicate snapshot suppression, mute cancellation, explicit preview while muted, stale banter suppression, private payload shape and unmount cleanup. This verifies queue behaviour, not the audible quality of ElevenLabs output.
- Browser sessions used for these checks were closed.

## Additional completed application checks

- Real ElevenLabs v3 dealer preview generated through fal and played successfully in Chromium: 11.886-second MP3. All eight character cheers samples generated successfully. No credentials are shipped to the browser.
- A live practice table with five bots accepted call/check actions through a complete hand. Observed board 4♥ 2♠ 3♦ 5♣ 7♦, Juan's 6♥ J♥, and correct settlement of 810 chips for a seven-high straight. Contender hole cards appeared at showdown; private cards stayed hidden during the hand. Actual character banter and subsequent dealer clips played sequentially in Chromium.
- A separate browser joined the same table as a spectator. It had no betting controls or private cards. A unique rail-chat message appeared in the spectator browser and did not appear in the seated host's browser.
- Reload restored the same saved seat. Fixed a join dialog that could linger after successful token recovery; observed zero dialogs after restoration.
- Opened the same saved seat in another tab: the replacement restored the table, the original returned home with hosting available, and the shared recovery token remained intact.
- The practice bot loop now respects the selected seat cap and stops if a bot cannot be added. Display preferences use storage fallbacks. A late-entry waiting seat explains that it joins the next hand.
- Explicit voice preview remains available while automatic voices are muted.

- Final automated suite: 49 tests across four files passed, including randomized chip-conservation runs. Dependency audit reported zero vulnerabilities.
- Responsive gameplay layout at 390×844 had no document overflow.

- Final integration review fixed invitation focus-lock cleanup after losing a seat and restored automatic voice readiness after a successful retry preview.

- Voice queue regression verifies a real engine all-in burst through the champion announcement for two viewers, plus FIFO ordering, bounded overflow, expiry and recovery after provider failure. All provider calls in tests are mocked.

- Final production build passed. Built homepage, GLB asset, health endpoint and voice status returned successfully on port3001; Chromium loaded the built client with a working realtime connection and no page errors. Scanned browser source and production text bundles for configured secrets: zero matches. Direct development access to the credential file returned403.

## Historical textured-head renderer checks (superseded)

- At that earlier stage, all eight GLB heads were activated and visually fitted. They have since been archived and are not loaded by the current game. Their combined download size is 23,285,788 bytes (22.21 MiB), with 139,161 triangles across eight unique assets. Repeated avatars reuse geometry and textures.
- Twelve-seat desktop scene after warmup: 29.5–30 fps on the intentional 30 fps cap, 1,217 reported draw calls including shadow passes, and 860,046 rendered triangles. Browser error log was empty.
- A narrow 358×420 scene viewport retained all 12 heads after camera/label adjustments, at 29.5 fps in the same local Chromium environment. This is viewport emulation, not a physical-phone benchmark.
- Dev-only inspection entry: `/src/three/scene-qa.html`; query options include `camera`, `room`, `portrait` and `emote`. It is not part of the production entry bundle.

## Remaining scope limits

- Native face geometry animates blinks, gaze, expressions and an audio-reactive mouth. Mouth shapes are not phoneme-accurate lip sync.
- Autoplay policy differs by browser. The app exposes a deliberate voice preview and an error/blocked status; mobile Safari and every target browser have not been physically tested.
- Setup, help and invitation dialogs could all be mounted through programmatic state changes. The focus hook supports a stack; ordinary UI flows keep one active dialog.
- Docker and Render configuration is provided, but no container runtime is installed in this workspace, and no cloud deployment was performed.
- Game rooms live in one server process and do not survive restarts. There is no public deployment or cross-device internet-hosting certification yet.

These notes distinguish observed checks from code review; they do not claim an exhaustive browser/device or full-tournament certification.

## Dealer restraint and table choreography — 12 September 2026

This section supersedes the historical multi-character voice and synthetic-only foley notes above.

- **60 tests across six files pass**; production TypeScript/Vite build passes. New checks cover the 116-line shuffle bags, silent joins/gestures, stale voice filtering, twelve-seat deal order, private-card exclusion from public events, all-in street ordering, result-display timing and holding credited stacks until the visible award. Voice route tests reject all character speech and silent logs. Provider synthesis is mocked in tests.
- Browser-tested the built client on port 3001. A live two-player all-in produced new-hand, flop, turn, river and tournament-result cues in order. The example settled 200 chips to Juan with two pair, tens and sevens. Network audit recorded only dealer voice requests: new hand, all-in, hand end, winner and champion. No join or emote speech request appeared.
- Web Audio instrumentation observed one shuffle, nine card slides (four hole cards plus five community cards), five card flips, four chip-bet clips and one pot-gather clip during that hand. Real mono MP3 buffers were decoded and started; all seven generated assets were checked with ffprobe. This is playback/sequence verification, not a claim of testing every speaker or audio device.
- A voluntary chip trick produced foley and zero character-voice requests. After muting table sounds, the buffer-start count stayed unchanged through another trick. Dealer and foley have independent controls.
- The dev scene harness supports `?choreography=1`, replay and freeze-frame controls. Twelve-seat telemetry observed flying cards, staggered flop progress, subsequent turn/river progress, bet/check/gather arm poses and riffle motion. Chip artwork is now shared and released when unused; the same twelve-seat inspection dropped from 325 to 64 active textures. This local Chromium observation is not a physical-phone performance benchmark.
- Public runouts keep eliminated avatars present and withhold credited stacks/champion labels until the award. All-in street captions explain that the board is running out. Multiple side-pot winners are described as pots being settled, not necessarily as a tied hand.
- Screenshots under ignored `artifacts/` include `production-new-hand.png`, `production-hand-result.png`, `table-choreography-full.png` and the mobile hand views. The latest production smoke check and phone-width review use the built application.
- Final phone viewport: 390×844, document scroll width exactly 390. New-hand banner, phase strip, pot, private hand and camera controls fit. The portrait table camera was brought inside the fog range; `mobile-table-final.png` shows the full table and readable card HUD. Chromium reported no page errors. Previously eliminated players stay on the rail during later runouts.

## Player voices, deliberate pace and character refinement — 12 September 2026

This pass supersedes the dealer-only speech policy in the preceding section.

- **65 tests across seven files pass**, plus the production TypeScript/Vite build. New tests cover live deal/action holds, full decision clocks after the hold, pause/resume during a gesture, ordered all-in settlement, blocking a premature next hand, separate character casting, authenticated action speech and private rail reactions. Real Socket.IO tests wait for legal action availability and reject clicks during the hold.
- Prepared 96 short player-action clips and 152 voluntary reaction/preview clips, all through the configured fal/ElevenLabs provider, with zero generation failures. Action clips have a median duration of about 0.99 seconds; the longest is 2.19 seconds. The stock cast has nine distinct voices including Monty. No reference-person voice cloning is involved.
- A live six-seat practice table on the development client recorded Daniel for Monty and Bill, Roger, Liam, Charlie, Brian and George for their respective actors. The browser played Monty at 0.58 and players at 0.88. During bet/raise gestures, telemetry showed the camera still focused on the actor, the next player identified, and that next clock inactive. The actor's mouth moved during speech. A production preview on port 3001 played Diego at 0.88 without an audio error.
- All four replacement chip samples loaded alongside card/shuffle/tap samples. Generated files were trimmed, normalized and filtered. The browser check confirms playback configuration and loading; perceived timbre remains a listening judgment, not a waveform-derived quality claim.
- Rebuilt the native hair/face/tailoring distinctions for Juan, Nat and Diego after inspecting their source photos, and added elbow/wrist/finger articulation to the common rig. Regenerated and inspected the 400×440 portrait assets; production portraits match the source assets.
- Twelve-seat table inspection: 13 rigs including Monty, about 32 FPS and 68 active textures in this local headless Chromium run. Follow close-ups sampled about 35–43 FPS. This is not a physical-device performance guarantee. No page errors were reported.
- Production phone viewport 390×844: no horizontal overflow, a 358×420 scene, visible dealer, camera controls and voice mixer. Screenshots in ignored `artifacts/` include `held-raise.png`, `crew-refined.png`, `mobile-refined.png` and `twelve-player-refined.png`.

Rooms remain process-local and are lost on a development server restart. No public deployment was performed in this pass.

## Game interface, ambient music and heads-up odds — 12 September 2026

This pass supersedes the earlier captions, seven-reaction dock, dealer-only policy and 58% dealer-volume default.

- **77 tests across ten files pass**, including hand evaluation, exact and sampled win probabilities, tie handling, public all-in disclosure, separate rail speech, paced runouts and nonblocking voice selection. A targeted queue regression also verifies that a started card sequence can finish while a pause or new hand cancels it. The TypeScript/Vite production build passes; odds run in a separate approximately 29 kB worker.
- Removed player nameplates and speech bubbles from the scene. The game fills the viewport with one active-player indicator, a bottom action/reaction dock, and optional Players, Log and Audio panels. Setup and invitation dialogs remain inside the fullscreen element. The table has no marketing heading, promotional footer, dealer-preview banner or progress-strip captions.
- Chromium checks at 1440×900 and 390×844 found no horizontal document overflow. Entered fullscreen, clicked a knuckle roll, and observed the actor's voiced quip plus a `chip-roll` pose. The same session observed distinct `chip-riffle` and `chip-toss` poses. Submitted a chat message successfully through the integrated log.
- Generated all three Lyria 2 tracks and prepared 76 card/introduction clips plus 224 reaction/preview clips with zero generation failures. The browser played all three music tracks, paused music when its checkbox was cleared, and kept voice playback independent. Monty played at 0.78; player clips played at 0.88. Six-seat follow-camera telemetry sampled about 35 FPS in this local headless run.
- Live heads-up verification recorded Juan's preflop estimated win chance at 40.8%, a turn change to 93.2%, and a river result of 0.0%, with Diego at 100.0%. The display changed only with the visible board and reported ties separately. The worker's first result appeared roughly 210 ms after the exposed-hand panel. The final hand label and 20,000-chip award agreed with the server result. These numbers describe that particular random test hand, not fixed fixtures.
- The initial live check caught a final flop card being discarded at the next street boundary. All-in streets now hold for 8.0/4.6/4.6 seconds and a started card announcement finishes at clip boundaries. New-hand and pause cancellation remain enforced.
- Screenshots from this pass are in ignored `artifacts/`: the initial game view, live table, phone log, heads-up panel and production checks. Viewport emulation is not a physical-device or exhaustive browser certification.

- Final production run: all 14 expected voice clips played, including every individual board card, both player all-ins, hand end, result and champion. Production fullscreen kept the reaction dock visible and played a voluntary toss quip in Charlie’s voice. Mobile navigation, odds and controls fit at 390×844 with no page errors. Final twelve-seat scene: 13 rigs, 33.1 FPS, 65 textures and zero floating player/dealer labels in local headless Chromium.
- A regression also keeps elimination log messages behind the visible award, preventing the log from spoiling a pending runout. Multiple side-pot winners use a neutral “win” label instead of implying a split.

## Body contact, library IK and collision queries — 12 September 2026

- **83 tests across eleven files pass**, and the TypeScript/Vite production build passes. Six new contact regressions cover fixed limb lengths and singular goals, 101 sitting/standing poses with floor and cushion clearance, all twelve seats' action targets, dealer-to-felt-to-hand continuity, flat fold release, chip catches and nonintersecting riffle stacks. Chair and table tests use the installed Rapier WASM library; IK tests use Three's `CCDIKSolver`.
- Side, front and hand close-ups exposed and corrected floating elbows, a disconnected cuff attachment, excessive torso lean, low fold recovery and an over-bent standing knee. Final screenshots show the seated thighs above the cushion, calves in front, soles at the floor, fingers at card edges and the betting stack. The chair slides back during standing. A tailored continuous torso joins the shoulders to the body.
- A frozen twelve-seat deal at 4,200 ms contained 13 active rigs including Monty and 14 visible dealt cards. All rigs reported Rapier readiness; the largest wrist target error was approximately 0.000115 scene units and the smallest measured rail gap was 0.00867. Local Chromium held approximately 29–31 fps at the scene's intentional 30 fps cadence. This is a local browser observation, not a physical-phone benchmark.
- The deal, fold and chip-trick inspection views use the real production components. Cards retain one scale and grip through release, landing and pickup. A tossed chip leaves the wrist and returns at the catch; riffle columns separate before interleaving. Community cards turn face up in Monty's hand and land before the HUD/odds advance.
- Rebuilt client on port 3001 completed a live heads-up practice hand: Contact QA moved all in, the bot called, all five board cards ran out, and the result awarded 1,000 chips for jacks and sixes. The river odds showed 100% / 0% before settlement. The browser loaded the separate Rapier chunk, made 14 voice requests and reported zero JavaScript errors. This pass verifies request/render timing, not a new assessment of voice timbre.
- Entered fullscreen and triggered the stand reaction in the built client. A 390×844 viewport retained the controls and had a document scroll width of exactly 390. Browser console contained Rapier's internal deprecated-initialization warning; there were no page errors.
- New screenshots in ignored `artifacts/`: `contact-bet-finished.png`, `contact-fold-release.png`, `contact-stand-finished.png`, `contact-chip-toss.png`, `contact-deal-twelve.png`, `contact-community-deal.png`, `contact-production-game.png`, `contact-production-runout.png`, `contact-production-result.png`, `contact-production-stand.png` and `contact-production-phone.png`.
- These are controlled, collision-aware rigs with authored prop trajectories. Rendered bodies are still procedural geometry; fully weighted skinned bodies, imported Mixamo clips and cloth simulation are not implemented. Reusable package choices and the next asset migration are documented in [CONTACT_RIG.md](CONTACT_RIG.md). The physics chunk is loaded asynchronously and is approximately 836 kB compressed in this build.

## Blender models, physical seats and camera smoothing — 13 September 2026

- **103 tests across fourteen files pass.** The new suites load the shipped GLBs and check independent facial morphs, non-white complexion colours, wrist/knee alignment in transformed seats, and the helmet label's fitted surface. Physical-order tests cover 2/3/6/12 players, heads-up exceptions, fold skipping and stable seats. Camera tests cover continuous transitions, the shortest route across the angular wrap, and consistent timing at 30/60 fps.
- Rebuilt all eight players and Monty in Blender 5.2 using an adapted Quaternius Standard weighted base. Imported UV seams are welded before smoothing; shoulders, elbows, hips and knees now deform as a continuous skin. Inspection also corrected the neck/collar boundary, fitted clothing details and Doug's shell, straps and curved number panel. Compact editable `.blend` files and a reproducible build wrapper are included with the source license.
- Inspected actual seated/standing bodies from the front and side, card grips, chip motions and a frozen twelve-player deal. The final 1280×800 full-table sample contained 13 rigs, about 29.7 fps, 2,198 draw calls including shadows and 1,489,756 rendered triangles. Maximum wrist-target error was approximately 0.000119 scene units, with positive sampled rail clearance. Follow-camera samples ran around 48–53 fps on the same local Chromium system. These are local observations, not a physical-phone certification.
- A fresh six-player practice table advanced through preflop, flop, turn, river and later hands. Telemetry showed clockwise postflop focus (for example Nat → Jack → Tian), while a completed action remained in focus for its presentation hold before the next player's clock became live. Player speech drove the new facial jaw shape.
- Free orbit responded to dragging. Overhead and cinema views were exercised from fullscreen, where the reaction dock and betting controls remained present. At 390×844 the document scroll width was exactly 390; camera controls and the dock remained visible. Browser page-error logs were empty.
- Regenerated all eight picker portraits from the new runtime models. Production build passes and both port 5173 and the built client on port 3001 serve the new GLBs. The existing in-app preview was recovered from its stale connection-error page and is ready to host or practice.
- New screenshots in ignored `artifacts/` include `blender-twelve-final.png`, `doug-fitted-side.png`, `free-camera-check.png`, `overhead-fullscreen.png`, `cinema-fullscreen.png` and `blender-phone-final.png`.
- This pass uses weighted body skinning and facial shape animation. Hands/fingers retain the contact rig's articulated meshes; props follow controlled interaction trajectories. It does not introduce ragdoll, soft-body or cloth simulation. The Rapier chunk remains approximately 836 kB compressed and still triggers Vite's existing large-chunk advisory.
