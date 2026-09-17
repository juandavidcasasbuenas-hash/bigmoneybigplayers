# Adding a cartoon character

Juan, Jack, Clive, Doug, Nat, Tian, Humfrey and Diego use the same cartoon art direction: large rounded heads, large white eyes with small black pupils, simplified facial anatomy, matte skin, sculpted hair and compact bodies. Monty is the house dealer. The supplied Juan example in `assets/tripo/references/juan-style.png` is the style reference for the whole cast.

The [character pipeline](CHARACTER_PIPELINE.md) explains generation, Blender preparation, body rigging, source attribution and recovery of a saved Fal job. A character is not ready for the game merely because a generation API returned a GLB.

1. Add the identity photo to `public/avatars/` and an entry with a unique lowercase ID to `CHARACTERS` in `src/data/characters.ts`. Record name, clothing colours, complexion and distinctive features. Photos guide likeness; they are not superimposed on the character's face.
2. Create one clean full-body cartoon reference using both the identity photo and Juan's style image. Use a front-facing neutral A-pose, empty separated hands and separated legs, with no scenery or handheld props. Save the reviewed PNG as `assets/tripo/references/<id>.png` and its exact prompt beside it as `<id>-prompt.txt`.
3. Run `scripts/generate-tripo-character.ts` first with `--dry-run`, then submit the reviewed PNG. It uses Fal's `tripo3d/h3.1/image-to-3d` endpoint. Keep the receipt and untouched original. Rerun the same command to resume; use `--version v2` for an intentional new generation, not a silent retry.
4. Inspect and prepare the model in Blender with `scripts/prepare-tripo-cast.py -- --character <id> --inspect`. Review and refine its entry in `assets/tripo/head-landmarks.json`; preserve the cartoon head and its UVs while reducing geometry, fitting the neck and authoring compatible facial expressions, eyelids and gaze. Juan uses its own calibrated preparation scripts. Inspect every generated face and accessory independently.
5. Keep the continuous weighted body, skeleton conventions and contact-driven hands. Tailor clothing and materials to the reference, exporting a separate body GLB only when required. Set `model.head` and, optionally, `model.body` in the manifest to the prepared `/models/tripo/` files. Without overrides the loader uses the shared `/models/club/` assets. Reference-image generation, head preparation and body rigging are separate steps.
6. Inspect `/src/three/scene-qa.html?portrait=<id>` and `?rig=1&avatar=<id>&view=side`. Compare silhouettes, full blink, speech, laughter, glasses/headwear fit, neck/collar contact, chair clearance and hands during betting/folding. Check all three chip tricks. Capture a clean 400×440 runtime portrait as `public/portraits/<id>.png` and set its URL in the manifest.
7. Configure a distinct stock voice in `server/voice.ts`, warm the action/banter clips, and add the ID to bot choices when appropriate. Voice and likeness are independent. Reactions must use the existing public event path, never private card strength.
8. Run `npm test` and `npm run build`. Validate a live practice hand, twelve-player rendering, fullscreen controls and a narrow viewport before making the model the default. Preserve the established turn order, camera smoothing and action pacing.

Identity cues to retain across refinements:

| Character | Defining appearance |
| --- | --- |
| Juan | Dense dark curls with grey at the sides, full dark beard, navy shirt. |
| Jack | Bald crown, full beard with grey, dark teal clothing. |
| Clive | Spiky brown hair, rectangular glasses, clean-shaven face, pale shirt. |
| Doug | Fitted white cycling helmet with `1000` panel and straps, glasses, greying beard, grey hoodie. |
| Nat | Higher forehead, slicked-back dark hair with central silver sweep, close beard, navy suit and lapel pin. |
| Tian | Forward-facing dark cap, light-brown hair, sparse goatee/stubble, muted blue-grey clothing. |
| Humfrey | Very short receding buzzcut, broad cheeks/jaw, light stubble, light-blue shirt. |
| Diego | Wider face, dark side-parted hair, moustache/goatee and close beard, grey suit. |

Do not replace the continuous body with a generated full-body mesh without checking deformation and grip positions. The current hybrid design deliberately keeps the existing card/chip interactions while improving the face and silhouette. The original procedural Blender heads remain available as fallbacks; the old photographic-face experiments are not the current appearance.
