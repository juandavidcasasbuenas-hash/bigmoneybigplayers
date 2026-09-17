# Character contact and reusable packages

## What the game uses

- **Three.js `CCDIKSolver`**, already supplied by Three, solves the shoulder/elbow/wrist and hip/knee/ankle chains. `limbIK.ts` adapts the library to our contact targets, supplies the bend plane and caches solutions by limb length and reach. A near-straight knee gets additional convergence passes so feet remain planted. No additional IK npm package is needed. [Three documentation](https://threejs.org/docs/pages/CCDIKSolver.html)
- **`@dimforge/rapier3d-compat` 0.19.3** supplies collision queries against the actual padded-rail mesh and a convex felt collider. One lazy-loaded WASM world is shared by the scene. The rig tries elbow positions and chooses one with clearance. Rapier also checks leg capsules against the chair cushion in the contact regression. This is collision-aware animation, not a full rigid-body simulation of characters or poker rules. [Rapier shapes and contact queries](https://rapier.rs/javascript3d/classes/Shape.html)
- Existing **React Three Fiber / Drei** own the renderer, frame loop, cameras and scene objects. High-frequency transforms remain in refs and Three objects; React state does not update for every limb on every frame.

The physics module adds approximately 836 kB compressed to this build and loads asynchronously. An analytic rail-clearance fallback is available while WASM loads. The physics engine does not decide bets, cards, timing or chip balances.

## Why not just add gravity?

A seated character must intentionally reach a card, plant a foot and avoid a chair. A dynamic body can fall onto furniture, but that alone does not create those actions. The standard approach combines a rigged character, animation clips, inverse kinematics for precise contact, and collision queries. Rapier explicitly distinguishes controlled kinematic bodies from bodies affected by forces. [Rigid body types](https://rapier.rs/docs/user_guides/javascript/rigid_body_type/), [two-bone limb example](https://guillaumeblanc.github.io/ozz-animation/samples/two_bone_ik/)

## Contact contract

- Seat-local +Z points toward the table, +Y points upward. Stable seat positions face the oval's inward normal. `workZ()` keeps each player's card/chip lane inside the rail.
- The chair cushion top is 0.7342 units high; the seated hip is 0.895. Thighs and shins have fixed lengths. Standing draws the feet in, shifts the hips forward and slides the chair back before extending the knees. Shoe soles meet the floor at approximately Y=0.003.
- `ContactPose` represents the palm/grip. `wristJoint()` gives the separate cuff attachment. The hand does not independently wave away from its held object.
- Every physical card uses `CARD_SCALE`. Dealt cards follow Monty's right-hand grip, travel to the felt and stay there until pickup. At pickup, the same transform transfers ownership to the player's hand. A fold retains that ownership until release, then follows a decelerating flat slide to the muck.
- Shared `dealTiming.ts` drives both server holds and client gestures/foley. A six-player deal takes 5.15 seconds, a twelve-player deal 8.51 seconds. The decision clock starts after the last pickup. Community cards leave the dealer face up and the HUD reveals each card when it lands.
- Betting uses a four-chip visual cut. Fingers approach the stack, push with it, then recover. Visual chip counts are symbolic; the server owns the numerical amount.
- Riffle, knuckle roll and toss are distinct contact sequences. Riffle slots separate before interleaving; the tossed chip follows an independent ballistic arc and rejoins the grip at the catch. These trajectories are authored, not a nondeterministic rigid-body pile simulation.

## Blender assets

The rendered body is now a weighted Blender GLB adapted from Quaternius's free Standard humanoid topology. Shoulders, elbows, hips and knees bend as one continuous surface. `blenderRig.ts` transfers the same constrained endpoints to its bones, so replacing the model does not change card ownership or chip contact. Each character has an independent skeleton; geometry is shared. Hands and fingers retain the articulated contact geometry.

The native Blender heads contain expression shape keys and fitted hair/accessories. The `assets/blender/` folder includes compact editable `.blend` files, provenance and the pack's supplied CC0 license. See [the authoring and rebuild workflow](CHARACTER_PIPELINE.md).

Mixamo remains an option for reusable body clips; it was not needed for this contact-driven seated rig. There is no ragdoll or cloth simulation in this pass. Controlled posing keeps the card grips and planted feet stable.

## Physical seats and camera

`shared/seats.ts` assigns stable physical seat IDs, filling opposite sides first. `seatPosition()` renders those IDs clockwise around thirteen rail positions, leaving one position for Monty. Joining, leaving for the rail, folding and changing lobby rules do not reorder occupied chairs. The engine uses clockwise distance for blinds, action, dealing and odd-chip ordering. Heads-up retains the button/small-blind exception.

Drei's CameraControls supplies critically damped shot transitions and manual orbit. Mode changes ease rather than cut; angular normalization chooses the short route across the 180-degree boundary. The public-action presentation hold remains in place before focus moves to the next actor. Tests cover transition continuity, the angular wrap and timing at 30/60 fps.

## Inspect and verify

Run `npm run dev`, then open:

- `/src/three/scene-qa.html?rig=1&action=idle&view=side&avatar=juan&seat=0`
- `/src/three/scene-qa.html?rig=1&action=fold&p=0.43&view=hand`
- `/src/three/scene-qa.html?rig=1&action=stand&p=1&view=side`
- `/src/three/scene-qa.html?rig=1&action=chip-toss&p=0.56&view=front`
- `/src/three/scene-qa.html?camera=table&choreography=1&frame=4200`

The isolated view has action, camera, character and progress controls. Omit `frame` to play the complete twelve-seat choreography. These inspection entries are excluded from the production entry bundle. `window.__pokerSceneStats` exposes solver readiness, contact error, rail clearance, planted ankles, action and frame-rate measurements without adding text to the game.

`src/three/contactMotion.test.ts` checks fixed bone lengths, singular targets, the full sit/stand path, chair clearance, all twelve seats' action reaches, card ownership continuity, flat fold release, chip catch continuity and nonintersecting riffle slots. Run `npm test` and `npm run build` before a visual review of the served game.
