import "dotenv/config";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";

// Intentional asset generation, never called by the browser or game startup.
const model = "fal-ai/elevenlabs/sound-effects/v2";
const cues: readonly (readonly [string, number, string])[] =
  process.argv.includes("--chips-v2")
    ? [
        [
          "chip-bet-soft",
          1.1,
          "Close microphone recording: a hand slides four thick compression moulded CLAY POKER CHIPS onto a padded felt poker table. A low dry rounded tok tok, then a soft felt scrape. Warm dull plastic-clay impacts with weight, very short decay. NOT coins, NOT keys, NO metal, glass, ceramic, bright ringing, rattle, music, speech or ambience. One small controlled bet.",
        ],
        [
          "chip-bet-soft-2",
          1.1,
          "One small stack of thick clay-composite poker chips is placed on green felt by a player. Two low dry flat clacks and a tiny fabric slide, soft padded tabletop underneath. The dull rounded sound of heavy plastic casino chips, isolated close foley. No metallic sounds, keys, coins, ringing, glass, speech, or music.",
        ],
        [
          "chip-gather-soft",
          2.2,
          "Slow close dry foley of a hand gathering thick clay-composite poker chips on padded felt. A soft brushing scrape under a rolling series of low hollow tok tok clacks, then two dull stack taps. Warm and weighty plastic chips, muffled short impacts, not a jangling rattle. NO metal, keys, coins, glass, ceramic, chimes, voices or music.",
        ],
        [
          "chip-trick-soft",
          1.8,
          "An expert slowly interleaves two stacks of six heavy clay-composite casino poker chips with their fingers. A short soft rippling prrrt of dry low plastic clacks followed by one dull tap as the stack is squared. Intimate damped tabletop recording, restrained pace. NO metal, keys, coins, ceramic, glass, ring, voices or music.",
        ],
      ]
    : ([
        [
          "card-slide",
          0.6,
          "A single playing card dealt briskly across a soft poker felt table. Close dry papery swish, then a light crisp slap. One isolated action starting immediately. No voices, music or ambience.",
        ],
        [
          "card-flip",
          0.6,
          "One stiff playing card turned face up on green felt. A crisp papery flick and a soft flat tap. Close isolated foley, immediate onset. No speech, music, chimes or background.",
        ],
        [
          "shuffle",
          2,
          "A dealer riffles a deck of playing cards once, bridges the deck and squares it with two crisp taps on poker felt. Dry close detailed paper flutter. No voices or music.",
        ],
        [
          "chip-bet",
          0.8,
          "A small stack of heavy clay poker chips is pushed forward across felt and lands with three crisp ceramic clacks. Dry intimate casino table foley, immediate onset. No voices, music or metallic bells.",
        ],
        [
          "chip-gather",
          1.8,
          "A player rakes a large loose pot of clay poker chips across felt towards them, then stacks them. A satisfying rolling cascade of ceramic clacks and soft felt scrape. Isolated, immediate onset, no speech or music.",
        ],
        [
          "chip-trick",
          1.7,
          "Two little stacks of clay poker chips are expertly shuffled together between fingers, lifted and clicked into one stack. Close dry rapid ceramic clicks. One isolated chip trick, no voices, music or metallic ringing.",
        ],
        [
          "table-tap",
          0.5,
          "Two short knuckle taps on a padded poker table, a quiet soft wooden double knock through felt. Immediate onset, isolated close foley. No speech, music or reverberation.",
        ],
      ] as const);
await mkdir("public/audio/table", { recursive: true });
await mkdir("docs/assets/foley", { recursive: true });
const headers = {
  Authorization: `Key ${process.env.FAL_KEY}`,
  "Content-Type": "application/json",
};
for (const [name, duration, text] of cues) {
  const output = `public/audio/table/${name}.mp3`,
    receiptPath = `docs/assets/foley/${name}.json`,
    raw = `docs/assets/foley/${name}-raw.mp3`;
  try {
    if ((await stat(output)).size > 100) {
      console.log(`${name}: already saved`);
      continue;
    }
  } catch {}
  if (!process.env.FAL_KEY)
    throw new Error("FAL_KEY is required in the private environment.");
  let receipt: { request_id: string; status_url: string; response_url: string };
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8")).receipt;
  } catch {
    const input = {
      text,
      duration_seconds: duration,
      prompt_influence: 0.8,
      output_format: "mp3_44100_128",
      loop: false,
    };
    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`${name}: submission failed (${response.status})`);
    receipt = (await response.json()) as typeof receipt;
    await writeFile(
      receiptPath,
      JSON.stringify({ model, input, receipt }, null, 2),
    );
  }
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await fetch(receipt.status_url, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(`${name}: queue status ${response.status}`);
    const status = (await response.json()) as { status: string };
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || attempt === 89)
      throw new Error(`${name}: generation incomplete; receipt retained`);
    await delay(2000);
  }
  const result = await fetch(receipt.response_url, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!result.ok) throw new Error(`${name}: result unavailable`);
  const data = (await result.json()) as { audio: { url: string } };
  const url = new URL(data.audio.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".fal.media"))
    throw new Error("Unexpected media host");
  const asset = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!asset.ok) throw new Error("Audio download failed");
  await writeFile(raw, Buffer.from(await asset.arrayBuffer()));
  // Trim generation lead-in and tame peaks so repeated small actions mix cleanly.
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    raw,
    "-af",
    "silenceremove=start_periods=1:start_duration=0.008:start_threshold=-44dB," +
      (name.includes("soft")
        ? "highpass=f=90,lowpass=f=3800,equalizer=f=2400:t=q:w=1:g=-4,loudnorm=I=-23:TP=-4:LRA=5,"
        : "loudnorm=I=-21:TP=-3:LRA=5,") +
      "afade=t=out:st=" +
      Math.max(0.15, duration - 0.12) +
      ":d=0.12",
    "-t",
    String(duration),
    "-ar",
    "44100",
    "-ac",
    "1",
    "-b:a",
    "128k",
    output,
  ]);
  console.log(`${name}: saved ${duration}s foley`);
}
