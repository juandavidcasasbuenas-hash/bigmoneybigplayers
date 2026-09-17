# Nat, Tian, Humfrey and Diego: exact head-reference prompts

Created with the built-in `image_gen` tool in default built-in mode, one call per character. No raster-generation API or CLI was used. Four calls ran concurrently. The source photos and Juan style image were visually inspected before generation, and every output was visually checked before copying into the project.

The actual person's photo is reference image 1 (identity). Juan's existing sculpt is reference image 2 (style only). The prompts deliberately separate likeness from style so future additions belong to the same game without inheriting Juan's face.

To add another character: inspect their photograph, use the same sculpt-style reference, preserve the shared framing/material requirements, and replace only the subject-specific likeness paragraph. Save the new output as `public/characters/<id>-reference.png`, then run `npx tsx scripts/generate-head.ts <id> public/characters/<id>-reference.png`. The 3D script writes a queue receipt and resumes that request on rerun; do not delete the receipt to retry an unfinished job.

These are generative references rather than exact deterministic outputs: the exact prompts and ordered inputs are retained below, but a rerun may vary.

## Nat

- Identity input (reference 1): `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/Avatars/Nat.jpg`
- Sculpt style input (reference 2): `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ed-993c-71a0-89d1-cc51c35cd72e/exec-e0f52207-48b6-40e9-8643-2d67d5b52c1e.png`
- Project output: `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/public/characters/nat-reference.png`
- Original built-in output: `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ee-3f8e-7920-a42f-c03de8afea31/exec-9925c430-1e29-49d2-8198-5ca80aa9f9df.png`

Exact prompt:

```text
Use case: stylized-concept. Asset: premium sculpt reference for a 3D comedy poker-game collectible character. Image 1 is the actual person and the ONLY identity reference. Image 2 is Juan, provided ONLY for sculpt style, realism level, studio lighting, and framing; do not copy Juan's facial identity, beard, or hairstyle. Make a single centered perfectly front-facing adult character HEAD ONLY, including both ears and a short neck that ends flat, floating isolated on a pure white background. The whole hair/head/ears/neck are fully visible with generous clean white margins. Match image 2's highly polished expressive organic 3D collectible sculpt: mildly caricatured adult proportions, detailed facial planes, eyelids, irises, nose, lips, subtle skin texture, carefully sculpted hair strands and appropriate facial hair. Recognisable likeness is essential. A small knowing comedic poker-face smile and alert direct eye contact, tasteful exaggeration rather than photorealism. No torso, no shoulders, no clothing below neck, no bust base, no props, no text, no multi-view, no watermark. Never a generic baby-shaped spherical head. Soft neutral studio lighting, no harsh cast shadow, square composition.
Subject is Nat. Preserve his distinct medium-brown skin, oval relatively narrow adult face, high forehead with a slightly receding hairline, swept-back dark hair with a very noticeable silver-white forelock/streak at the front and subtle greying, dark expressive almond eyes, arched brows, slender rounded nose, defined lips, and neat close-cropped dark stubble beard including moustache. His face and hair must look like photo 1, not Juan. Express calm dry wit with a very slight one-corner smile.
```

## Tian

- Identity input (reference 1): `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/Avatars/Tian.png`
- Sculpt style input (reference 2): `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ed-993c-71a0-89d1-cc51c35cd72e/exec-e0f52207-48b6-40e9-8643-2d67d5b52c1e.png`
- Project output: `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/public/characters/tian-reference.png`
- Original built-in output: `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ee-3f8e-7920-a42f-c03de8afea31/exec-3f9dcfcd-6e46-4c2a-bfab-b3574c745d59.png`

Exact prompt:

```text
Use case: stylized-concept. Asset: premium sculpt reference for a 3D comedy poker-game collectible character. Image 1 is the actual person and the ONLY identity reference. Image 2 is Juan, provided ONLY for sculpt style, realism level, studio lighting, and framing; do not copy Juan's facial identity, beard, or hairstyle. Make a single centered perfectly front-facing adult character HEAD ONLY, including both ears and a short neck that ends flat, floating isolated on a pure white background. The whole hair/head/ears/neck are fully visible with generous clean white margins. Match image 2's highly polished expressive organic 3D collectible sculpt: mildly caricatured adult proportions, detailed facial planes, eyelids, irises, nose, lips, subtle skin texture, carefully sculpted hair strands and appropriate facial hair. Recognisable likeness is essential. A small knowing comedic poker-face smile and alert direct eye contact, tasteful exaggeration rather than photorealism. No torso, no shoulders, no clothing below neck, no bust base, no props, no text, no multi-view, no watermark. Never a generic baby-shaped spherical head. Soft neutral studio lighting, no harsh cast shadow, square composition.
Subject is Tian. Preserve his black baseball cap worn with its curved visor forward and slightly lifted, short light-brown/dark-blond hair at the cap edge, fair skin, broad angular adult jaw and full cheeks, short straight nose, heavy relaxed eyelids, and short sparse dark goatee/chin stubble with light moustache. Use the actual man in photo 1; ignore the dog and body. Reorient him to a clean straight-on view, with both eyes open and a slightly unimpressed, puckish poker face. Retain adult facial proportions and cap silhouette; avoid copying Juan's dark thick swept quiff or full beard.
```

## Humfrey

- Identity input (reference 1): `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/Avatars/Humfrey.png`
- Sculpt style input (reference 2): `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ed-993c-71a0-89d1-cc51c35cd72e/exec-e0f52207-48b6-40e9-8643-2d67d5b52c1e.png`
- Project output: `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/public/characters/humfrey-reference.png`
- Original built-in output: `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ee-3f8e-7920-a42f-c03de8afea31/exec-39d7398b-7938-48c0-a5c3-b54562908f42.png`

Exact prompt:

```text
Use case: stylized-concept. Asset: premium sculpt reference for a 3D comedy poker-game collectible character. Image 1 is the actual person and the ONLY identity reference. Image 2 is Juan, provided ONLY for sculpt style, realism level, studio lighting, and framing; do not copy Juan's facial identity, beard, or hairstyle. Make a single centered perfectly front-facing adult character HEAD ONLY, including both ears and a short neck that ends flat, floating isolated on a pure white background. The whole hair/head/ears/neck are fully visible with generous clean white margins. Match image 2's highly polished expressive organic 3D collectible sculpt: mildly caricatured adult proportions, detailed facial planes, eyelids, irises, nose, lips, subtle skin texture, carefully sculpted hair strands and appropriate facial hair. Recognisable likeness is essential. A small knowing comedic poker-face smile and alert direct eye contact, tasteful exaggeration rather than photorealism. No torso, no shoulders, no clothing below neck, no bust base, no props, no text, no multi-view, no watermark. Never a generic baby-shaped spherical head. Soft neutral studio lighting, no harsh cast shadow, square composition.
Subject is Humfrey. Preserve the broad high forehead and very short buzz-cropped dark-brown hair with receded temples, blue-grey eyes, thick straight dark eyebrows, broad compact nose, prominently visible ears, rounded-square adult cheeks and jaw, neatly cropped brown jawline stubble and a fine moustache. His slight friendly closed-lip smile and face shape must strongly resemble photo 1. Very short buzz haircut, absolutely no quiff or voluminous hair and no thick Juan-style beard. Give him an amused confident poker expression.
```

## Diego

- Identity input (reference 1): `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/Avatars/diego.jpg`
- Sculpt style input (reference 2): `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ed-993c-71a0-89d1-cc51c35cd72e/exec-e0f52207-48b6-40e9-8643-2d67d5b52c1e.png`
- Project output: `/Users/juandavidcasasbuenas/Documents/ChatGPT/PokerWithFriends/public/characters/diego-reference.png`
- Original built-in output: `/Users/juandavidcasasbuenas/.codex/generated_images/01a090ee-3f8e-7920-a42f-c03de8afea31/exec-d91567dd-6e7e-4869-9a8e-0a650b28ceab.png`

Exact prompt:

```text
Use case: stylized-concept. Asset: premium sculpt reference for a 3D comedy poker-game collectible character. Image 1 is the actual person and the ONLY identity reference. Image 2 is Juan, provided ONLY for sculpt style, realism level, studio lighting, and framing; do not copy Juan's facial identity, beard, or hairstyle. Make a single centered perfectly front-facing adult character HEAD ONLY, including both ears and a short neck that ends flat, floating isolated on a pure white background. The whole hair/head/ears/neck are fully visible with generous clean white margins. Match image 2's highly polished expressive organic 3D collectible sculpt: mildly caricatured adult proportions, detailed facial planes, eyelids, irises, nose, lips, subtle skin texture, carefully sculpted hair strands and appropriate facial hair. Recognisable likeness is essential. A small knowing comedic poker-face smile and alert direct eye contact, tasteful exaggeration rather than photorealism. No torso, no shoulders, no clothing below neck, no bust base, no props, no text, no multi-view, no watermark. Never a generic baby-shaped spherical head. Soft neutral studio lighting, no harsh cast shadow, square composition.
Subject is Diego. Preserve his warm medium-tan skin, dark wavy glossy quiff with high faded sides and a defined side-part line, dark alert eyes, softly arched dark eyebrows, broad projecting ears, distinct full black moustache, tiny dark soul patch, and close-trimmed black beard tracing the jaw. Keep the wider smooth cheeks and broad rounded-square chin, and the recognisable friendly sly closed-mouth grin from photo 1. The moustache and tiny soul patch are key identity details; don't replace them with Juan's beard/hair. Mature adult face, gently caricatured.
```
