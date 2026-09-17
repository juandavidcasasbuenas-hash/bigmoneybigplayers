# Cartoon model sources and preparation

## Supplied Juan assets

The user supplied the visual style image named `ChatGPT Image Sep 17, 2026, 10_11_59 AM.png` and the existing `Downloads/model.glb` as the starting point for Juan. The style image is retained as `references/juan-style.png`; an untouched copy of the supplied GLB is kept locally as `source/juan-original.glb`.

This repository did not generate that original Juan GLB through its Fal command and does not have a Fal request receipt for it. Do not describe it as a newly submitted Fal job or assign it a fabricated generation provenance. Its supplied geometry and cartoon textures are preserved through the documented Blender adaptation.

## Generated cast

The other player references were generated using the supplied identity photos and Juan's cartoon style example. Monty's reference is an original fictional dealer design in the same style. PNGs and exact prompts are retained in `references/`.

The cast generation command uses Fal's `tripo3d/h3.1/image-to-3d` endpoint. Individual `jobs/<id>.json` receipts record the actual input hash, generation settings, service request, result and downloaded output hash. A receipt's state is the authority for whether a job was submitted, completed or downloaded. Untouched service outputs are preserved locally under `source/`; they are not served to browsers.

Blender preparation reduces geometry, retains the generated cartoon UV textures, fits the head to the game body, and adds facial expression shapes and eyelids. The generated artwork is distinct from the supplied identity photographs: the photographs are references, not face decals.

No CC0 or other asset-pack license is asserted for the supplied Juan model, identity photos, style reference, generated reference images or Fal outputs. Preserve their provenance and applicable source/service terms separately from the licensed base-body attribution below.

## Body and interaction rig

The live body uses adapted weighted topology from **Quaternius — Universal Base Characters, Standard**. Its downloaded pack includes a CC0 1.0 license, preserved unchanged at [`../blender/LICENSE-Quaternius.txt`](../blender/LICENSE-Quaternius.txt). Full pack/source details remain in [`../blender/NOTICE.md`](../blender/NOTICE.md).

The poker adaptation keeps this continuous weighted body and matching skeleton, adds Blender tailoring/materials, and drives it from the game's existing card/chip contact rig. In particular, Juan's supplied full-body sculpt includes fused hands and microphone geometry, so the runtime combines its prepared head with this separate rigged body. The Fal image-to-3D step is not credited with producing the runtime body rig or facial rig.

Editable prepared `.blend` files and optimized runtime GLBs are derivatives of the sources stated above. Do not remove the Quaternius notice when redistributing those adapted body assets, and do not extend its CC0 designation to unrelated generated or supplied assets.
