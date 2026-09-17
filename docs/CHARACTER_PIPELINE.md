# Cartoon characters: Fal and Blender

The visual target is the supplied Juan cartoon: oversized rounded heads, large white eyes with small dark pupils, simplified noses and brows, matte skin, sculpted hair and compact bodies. Reference photographs establish identity; the generated cartoon reference establishes the art style. The runtime uses actual three-dimensional head geometry and its cartoon texture, not a photograph pasted onto a face.

Juan's starting model is the user-supplied `Downloads/model.glb`, preserved locally as `assets/tripo/source/juan-original.glb`. The remaining cast is generated from consistent reference images with Fal's **`tripo3d/h3.1/image-to-3d`** endpoint. Model source attribution is recorded separately in [the generated-asset notice](../assets/tripo/NOTICE.md) and [the Quaternius notice](../assets/blender/NOTICE.md).

## Why the game uses a hybrid character

Generated heads supply the cartoon likeness, hair, facial detail and headwear. Blender prepares their geometry, materials and expressions. The body retains the continuous, weighted Quaternius-derived surface and the game's established skeleton. Juan's supplied full-body model has hands and a microphone fused into the shirt; putting that mesh directly onto the contact rig would introduce holes, bent props and incorrect hand positions. Keeping its head and tailoring the proven body preserves both appearance and interaction.

This is not an automatic Fal body-rigging workflow. `src/three/blenderRig.ts` drives the Blender skeleton from the existing shoulder, elbow, wrist, hip, knee and ankle targets. `ContactRig.tsx` retains the articulated hands, fingers, shoes and shared card/chip grip transforms. A generated full-body asset is an authoring input, not a drop-in runtime rig.

The physical seat order, camera smoothing, action holds, dealing timings, sound and game rules are independent of this asset pipeline. Replacing a head must not bypass those systems.

## Files and provenance

| Location | Purpose |
| --- | --- |
| `public/avatars/` | Supplied identity photographs; not runtime face textures. |
| `assets/tripo/references/juan-style.png` | Supplied visual style reference. |
| `assets/tripo/references/<id>.png` | Reviewed full-body cartoon reference used for generation. |
| `assets/tripo/references/<id>-prompt.txt` | Exact reference-image prompt. |
| `assets/tripo/jobs/<id>.json` | Fal endpoint, input hash, parameters, request ID, status, result and downloaded-file hash. |
| `assets/tripo/head-landmarks.json` | Per-character orientation, eye/mouth/brow landmarks, neck cut, head scale and complexion sample. |
| `assets/tripo/source/<id>-original.glb` | Untouched source model; excluded from version control and the web build. |
| `assets/tripo/*-head.blend`, `*-body.blend` | Editable Blender-prepared assets. |
| `public/models/tripo/` | Prepared GLBs served to the browser. |
| `assets/blender/club-body.blend` | Continuous weighted base used by the contact rig. |
| `public/models/club/` | Shared body and legacy/fallback Blender heads. |
| `src/data/characters.ts` | Identity, colours, portrait and optional `model.head` / `model.body` asset URLs. |

The loader selects the model URLs in the manifest. Omitting `model.head` uses `/models/club/<id>.glb`; omitting `model.body` uses `/models/club/body.glb`. Changing only a photo or an old procedural face parameter does not regenerate a prepared head.

## Make a consistent reference

Use the supplied photo as the identity reference and Juan's example as the style reference. Generate one character per image, then inspect the result before submitting it to Fal. The saved prompts provide the current cast's starting specifications.

- Keep a single centered, front-facing full body against a plain light background, with the whole silhouette visible.
- Use a neutral A-pose with straight arms separated from the torso, empty hands and a clear gap between the legs. Avoid microphones, drinks, cards and other props that can become fused geometry.
- Preserve distinguishing features: hairline and shape, beard, face width, complexion, glasses, cap or helmet. Keep all faces in the same cartoon style.
- Check accessory continuity carefully. Doug's helmet shell, number panel and straps must attach; Clive's glasses must meet the bridge and temples. A clean reference helps, but the generated mesh still needs inspection.
- Save the selected PNG and exact prompt. Preserve an existing submitted reference; use a new version for a replacement.

The September 2026 cast references were generated with the built-in image-generation tool. Different background or hand details in a reference do not justify skipping model review.

## Generate and resume a Fal model

`scripts/generate-tripo-character.ts` is an offline authoring command. It reads `FAL_KEY` from the process environment or the ignored repository `.env`; it is never imported into the browser. The endpoint schema is [Fal's Tripo H3.1 image-to-3D API](https://fal.ai/models/tripo3d/h3.1/image-to-3d/api).

Inspect the job without writes, network calls or charges:

```sh
npx tsx scripts/generate-tripo-character.ts jack assets/tripo/references/jack.png --dry-run
```

Submit a reviewed reference, or resume the same saved request:

```sh
npx tsx scripts/generate-tripo-character.ts jack assets/tripo/references/jack.png
```

The command requests 60,000 faces, detailed geometry and textures, PBR, original-image texture alignment, and stable character-derived geometry/texture seeds. `auto_size` and `quad` are disabled. These settings are archived in the receipt. Seeds and receipts make inputs traceable; they do not promise byte-identical results from a future hosted model run.

Rerunning the same command resumes its request rather than creating another paid job. A completed local original is validated against its SHA-256 hash without a network request. Queue timeouts retain the receipt. A changed image or parameter set is rejected if it conflicts with an existing job.

A deliberately new paid attempt needs a separate version:

```sh
npx tsx scripts/generate-tripo-character.ts jack path/to/revised-jack.png --version v2
```

This creates `jack-v2.png`, `jobs/jack-v2.json` and `source/jack-v2-original.glb`, preserving the first attempt. Do not delete receipts or `.submission` markers to force a retry. If submission was interrupted before its request ID was saved, recover that existing ID from Fal's dashboard:

```sh
npx tsx scripts/generate-tripo-character.ts jack assets/tripo/references/jack.png --request-id EXISTING_REQUEST_ID
```

The script validates GLB headers/chunks, saves the original atomically without overwriting different bytes, and records its final hash. Downloaded model URLs receive no Fal authorization header. Preview renders returned by the service are not downloaded by this script.

## Prepare Juan in Blender

Blender 5.2 was used. Juan's decimation and head-preparation scripts are specifically calibrated to the supplied model, including its orientation and facial coordinates. The body command without a character option also prepares Juan:

```sh
blender --background --python-exit-code 1 --python scripts/decimate-tripo.py
blender --background --python-exit-code 1 --python scripts/prepare-tripo-head.py
blender --background --python-exit-code 1 --python scripts/prepare-tripo-body.py
```

On macOS, the installed executable can be `/Applications/Blender.app/Contents/MacOS/Blender` instead of `blender`. Run the commands from the repository with the archived Juan original present. `--python-exit-code 1` makes a Blender script error return a failing process exit code; keep it in automated builds.

The decimation step reduces the approximately 1.49-million-face source to a 60,000-face full-body authoring mesh before extracting the head. It retains UVs and packed textures. Head preparation cuts and closes the neck below the visible collar, places the head in the runtime coordinate system, smooths the surface and tempers the generated normal map to preserve matte cartoon shading. The final exported head is only part of the decimated source; the source budget is not the final head's triangle count. Localized facial refinement in the prepared Juan asset produces 41,904 total triangles, below its 45,000-triangle head budget, while its embedded source texture bytes remain unchanged.

Facial shape keys are authored on the supplied sculpt: `Smile`, `JawOpen`, `BrowUp`, `Frown`, `LookLeft`, `LookRight` and `LookDown`. `Blink` recesses protruding pupils while separately authored, surface-fitted lids close over the white eyes. The generated topology has no reliable eyelid edge loops, so blindly folding its vertices would crush the brows. Every expression exports at zero weight; diagnostic renders exercise rest, full blink, speech and laughter.

The body preparation samples Juan's navy garment colour and applies it to the continuous weighted body, with fitted collar pieces and buttons. It exports `juan-body.glb` with the established skeleton and rest lengths. `juan-head.blend` and `juan-body.blend` remain editable. Preserve manual variations separately before running a script that recreates them.

## Prepare the other cast heads

Use the reusable cast script for a downloaded non-Juan original:

```sh
blender --background --python-exit-code 1 --python scripts/prepare-tripo-cast.py -- --character diego --inspect
```

It accepts one character ID per invocation. `--inspect` adds a normalized full-body source render; omit it for normal preparation. `--no-render` skips diagnostics. Outputs are `assets/tripo/<id>-head.blend`, `public/models/tripo/<id>-head.glb` and diagnostic images under `artifacts/tripo/<id>/`.

The script normalizes the source to a full-body height of one, feet at Blender Z=0 and the face looking along -Y, then applies a maximum 60,000-triangle full-source budget before extracting the head. It preserves the source UVs and cartoon texture. White-eye regions provide initial eye locations; the neck profile provides an initial cut. These are starting estimates to inspect, not proof of correct rigging.

The prepared cast uses smaller derived texture maps for browser delivery: colour up to 2048 pixels and normals up to 1024 pixels, with JPEG export. Source GLBs remain untouched. Imported custom normals are cleared, UV seam positions are welded before the neck cut and original surface winding is preserved; globally recalculating normals on disconnected generated UV islands can turn parts of a head inside out. Exported tangents support consistent normal-map shading.

`scripts/tripo-fringe-cleanup.py` repairs coloured reference-edge fragments on Diego, Clive, Jack and Monty. It selects anomalous colours within reviewed source-coordinate regions and includes tightly bounded neutral-coloured carrier geometry where a false strand extends beyond those texels. It projects protruding vertices toward nearby valid scalp/ear surfaces and recolours the affected UV triangles from nearby valid texture samples. It preserves topology, UV coordinates and the single face material rather than deleting patches and filling visible holes. Repair counts and displacement metadata are retained with the prepared assets. The helper does not change the untouched source GLBs.

`assets/tripo/head-landmarks.json` records each character's orientation, eye centers/radii, mouth and brow positions, head cut/height and sampled skin colour. Revise a character's landmarks after checking the source and extreme expressions, then rerun its preparation command. If the script cannot confidently find eye whites, inspect `white-regions.json` in that character's diagnostics and supply explicit eye landmarks. Glasses and white helmet patches need particular care. The script authors the same expression names and surface-fitted eyelids as the Juan workflow while retaining each generated head's actual identity geometry.

Run head preparations sequentially because they update the shared landmark file. This Blender work has no Fal generation charge and never rewrites the archived source GLB. Versioned Fal attempts remain separately archived; the cast script currently reads `<id>-original.glb`, so promoting a new version requires an explicit source-selection adaptation and revalidation rather than overwriting the first original.

## Prepare cast bodies

The body builder accepts one or more character IDs after Blender's `--` argument separator:

```sh
blender --background --python-exit-code 1 --python scripts/prepare-tripo-body.py -- --character jack clive doug nat tian humfrey diego dealer
```

Add `--no-render` to skip diagnostic renders. Omitting `--character` rebuilds Juan only. Each character produces `assets/tripo/<id>-body.blend` and `public/models/tripo/<id>-body.glb`, using the same continuous weighted surface, skeleton and contact targets.

The fitted Blender wardrobe follows the reviewed references: Jack's teal shirt; Clive's white shirt and belt; Humfrey's light-blue shirt and belt; Doug's grey hoodie, blue inset, zipper and drawstrings; Nat's navy suit, pale shirt and lapel pin; Diego's grey suit and white shirt; Tian's short-sleeve blue tee, exposed forearms and denim trousers; and Monty's wine waistcoat, pale sleeves and bow tie. These bodies are prepared rigged assets, not the unrigged full-body geometry returned by image-to-3D.

## Runtime motion and validation

`BlenderCharacter.tsx` clones each body skeleton independently and uses the head's morph targets for public expressions. Live voice amplitude drives the speaking character's mouth. This is audio-reactive cartoon speech, not phoneme-accurate lip sync. Private hand strength never drives visible tells.

Card pickup/release and chips retain their shared contact points, reach/contact/recovery phases and collision queries. This is controlled animation, not a cloth or ragdoll simulation; see [contact conventions](CONTACT_RIG.md).

Before enabling a newly prepared model, compare its front, side and three-quarter appearance with its approved reference. Inspect full blink and speech for white-eye leaks, stretched brows, floating glasses or moving helmet parts. Check the neck/collar while seated, standing and turning. Test betting, folding, card peeking, all three chip tricks and pot collection in the actual scene.

Useful development views are `/src/three/scene-qa.html?portrait=juan` and `?rig=1&avatar=juan&view=side`. Contact actions include `action=stand`, `action=bet&p=.55` and `action=chip-roll`. Use `?camera=follow&cycle=1` to inspect twelve seats. Capture picker portraits from the runtime model at 400×440 into `public/portraits/<id>.png`.

Run `npm test` and `npm run build`, then inspect a live practice hand and the full table. Asset tests check the actual exported files, expression keys, geometry budgets and body joint alignment. Check browser geometry, draw calls and frame rate; a 60,000-face API request alone does not establish acceptable twelve-player performance.

## Rebuild the shared body or legacy models

`npm run characters:build` is the earlier procedural Blender pipeline, not the Fal generation command. It refreshes `assets/blender/characters.json` from the manifest and rebuilds assets under `public/models/club/`:

```sh
npm run characters:build -- body
npm run characters:build -- doug
```

It requires the original Quaternius Standard pack extracted under `assets/blender/vendor/`, preserving its `.gltf`, `.bin` and texture hierarchy. `BLENDER_BIN` can override the wrapper's executable. Existing prepared GLBs run without Blender, Fal credentials or downloaded vendor files.
