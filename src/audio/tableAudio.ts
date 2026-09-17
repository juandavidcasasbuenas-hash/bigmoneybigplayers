/** Generated card/chip foley, with small original synth cues for turns and warnings. */
export type TableSound =
  | "turn"
  | "warning"
  | "deal"
  | "chips"
  | "fold"
  | "win"
  | "shuffle"
  | "card"
  | "reveal"
  | "collect"
  | "trick"
  | "check";
let context: AudioContext | null = null;
let fxEnabled = true,
  fxBus: GainNode | null = null;
const samples = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;
const activeSources = new Set<AudioBufferSourceNode>();
const sampleFiles: Partial<Record<TableSound, string | string[]>> = {
  card: "card-slide",
  deal: "card-slide",
  reveal: "card-flip",
  fold: "card-slide",
  shuffle: "shuffle",
  chips: ["chip-bet-soft", "chip-bet-soft-2"],
  collect: "chip-gather-soft",
  trick: "chip-trick-soft",
  check: "table-tap",
};
export function setTableSoundsEnabled(enabled: boolean) {
  fxEnabled = enabled;
  if (fxBus && context)
    fxBus.gain.setTargetAtTime(enabled ? 1 : 0, context.currentTime, 0.025);
  if (!enabled)
    for (const source of activeSources) {
      try {
        source.stop();
      } catch {}
    }
}
async function preloadTableSounds() {
  if (loading || !context) return loading;
  const ctx = context;
  loading = Promise.all(
    [...new Set(Object.values(sampleFiles).flat())].map(async (file) => {
      try {
        const response = await fetch(`/audio/table/${file}.mp3`);
        if (!response.ok) return;
        samples.set(
          file,
          await ctx.decodeAudioData(await response.arrayBuffer()),
        );
      } catch {
        /* The synthesized fallback still makes the action audible. */
      }
    }),
  ).then(() => {});
  return loading;
}
export async function unlockTableAudio() {
  try {
    context ??= new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    if (!fxBus) {
      fxBus = context.createGain();
      fxBus.gain.value = fxEnabled ? 1 : 0;
      fxBus.connect(context.destination);
    }
    if (context.state === "suspended") await context.resume();
    void preloadTableSounds();
    return context.state === "running";
  } catch {
    return false;
  }
}
export function playTableSound(
  sound: TableSound,
  options: { volume?: number; pan?: number } = {},
) {
  if (!fxEnabled || !context || context.state !== "running" || !fxBus)
    return false;
  const level = options.volume ?? 1;
  const files = sampleFiles[sound];
  const filename = Array.isArray(files)
    ? files[Math.floor(Math.random() * files.length)]
    : files;
  const sample = samples.get(filename || "");
  if (sample) {
    if (activeSources.size >= 14) return true;
    const source = context.createBufferSource(),
      gain = context.createGain(),
      pan = context.createStereoPanner();
    source.buffer = sample;
    source.playbackRate.value = 0.98 + Math.random() * 0.04;
    gain.gain.value = level * (sound === "trick" ? 0.5 : 1);
    pan.pan.value = Math.max(-0.7, Math.min(0.7, options.pan ?? 0));
    source.connect(gain);
    gain.connect(pan);
    pan.connect(fxBus);
    activeSources.add(source);
    source.start();
    source.onended = () => {
      activeSources.delete(source);
      source.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    return true;
  }
  const ctx = context,
    t = ctx.currentTime;
  const note = (
    frequency: number,
    delay: number,
    length: number,
    volume: number,
    type: OscillatorType = "sine",
  ) => {
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, t + delay);
    gain.gain.setValueAtTime(0, t + delay);
    gain.gain.linearRampToValueAtTime(volume * level, t + delay + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + length);
    oscillator.connect(gain);
    gain.connect(fxBus!);
    oscillator.start(t + delay);
    oscillator.stop(t + delay + length + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  };
  const brush = (delay: number, length: number, frequency: number) => {
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * length),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.value = 0.16 * level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(fxBus!);
    source.start(t + delay);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  };
  if (sound === "turn") {
    note(659.25, 0, 0.32, 0.11);
    note(987.77, 0.16, 0.6, 0.1);
  }
  if (sound === "warning") note(880, 0, 0.13, 0.055, "triangle");
  if (["deal", "card", "reveal", "shuffle"].includes(sound)) {
    brush(0, 0.12, 2600);
    brush(0.12, 0.1, 3400);
  }
  if (["chips", "collect", "trick", "check"].includes(sound)) {
    [0, 0.05, 0.11].forEach((delay, i) => {
      note(330 + i * 43, delay, 0.043, 0.055, "triangle");
      brush(delay, 0.045, 750);
    });
  }
  if (sound === "fold") brush(0, 0.16, 1400);
  if (sound === "win")
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) =>
      note(frequency, i * 0.1, 0.5, 0.07),
    );
  return true;
}

let speech: {
  player: HTMLAudioElement;
  actor: string;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer>;
  source?: MediaElementAudioSourceNode;
} | null = null;
/** Face animation reads the live audio envelope, not a private poker hand. */
export function trackVoice(player: HTMLAudioElement, actor: string) {
  const next: NonNullable<typeof speech> = {
    player,
    actor,
    analyser: null,
    data: new Uint8Array(256),
  };
  if (context?.state === "running") {
    try {
      next.source = context.createMediaElementSource(player);
      next.analyser = context.createAnalyser();
      next.analyser.fftSize = 256;
      next.source.connect(next.analyser);
      next.analyser.connect(context.destination);
    } catch {
      /* Browsers may deny analysis; visible speech still follows playback time. */
    }
  }
  speech = next;
  return () => {
    if (speech === next) speech = null;
    next.source?.disconnect();
    next.analyser?.disconnect();
  };
}
export function voiceLevel(actor?: string) {
  if (
    !speech ||
    !actor ||
    speech.actor !== actor ||
    speech.player.paused ||
    speech.player.ended
  )
    return 0;
  if (!speech.analyser)
    return (
      0.12 +
      Math.abs(
        Math.sin(speech.player.currentTime * 15.7) *
          Math.cos(speech.player.currentTime * 8.3),
      ) *
        0.65
    );
  speech.analyser.getByteTimeDomainData(speech.data);
  let sum = 0;
  for (const value of speech.data) {
    const v = (value - 128) / 128;
    sum += v * v;
  }
  return Math.min(
    1,
    Math.max(0, Math.sqrt(sum / speech.data.length) * 5 - 0.025),
  );
}
