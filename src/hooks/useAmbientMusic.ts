import { useEffect, useRef } from "react";
const tracks = ["after-hours", "on-the-button", "last-orders"];
/** Two decks crossfade the original instrumentals; speech always sits above the music. */
export function useAmbientMusic(
  enabled: boolean,
  volume: number,
  speaking: boolean,
) {
  const settings = useRef({ enabled, volume, speaking });
  settings.current = { enabled, volume, speaking };
  useEffect(() => {
    const decks = [new Audio(), new Audio()];
    let current = 0,
      track = 0,
      transition = false,
      started = false,
      alive = true;
    for (const deck of decks) {
      deck.preload = "auto";
      deck.volume = 0;
    }
    decks[0].src = `/audio/music/${tracks[0]}.mp3`;
    const start = () => {
      if (!alive || !settings.current.enabled || document.hidden) return;
      void decks[current]
        .play()
        .then(() => {
          started = true;
        })
        .catch(() => {});
    };
    document.addEventListener("pointerdown", start, { capture: true });
    document.addEventListener("keydown", start, { capture: true });
    const tick = window.setInterval(() => {
      const state = settings.current,
        active = state.enabled && !document.hidden;
      if (!active) {
        for (const deck of decks) deck.pause();
        return;
      }
      if (!started) return;
      const deck = decks[current],
        other = decks[1 - current];
      if (deck.paused && !deck.ended) void deck.play().catch(() => {});
      if (transition && other.paused) void other.play().catch(() => {});
      const remaining = deck.duration - deck.currentTime;
      if (Number.isFinite(remaining) && remaining < 1.8 && !transition) {
        transition = true;
        track = (track + 1) % tracks.length;
        other.src = `/audio/music/${tracks[track]}.mp3`;
        other.volume = 0;
        void other.play().catch(() => {
          transition = false;
        });
      }
      const mix = transition
        ? Math.max(0, Math.min(1, 1 - remaining / 1.8))
        : 0;
      const gain = state.volume * (state.speaking ? 0.2 : 1);
      deck.volume += ((1 - mix) * gain - deck.volume) * 0.4;
      other.volume += (mix * gain - other.volume) * 0.4;
      if (transition && (deck.ended || remaining < 0.08)) {
        deck.pause();
        deck.currentTime = 0;
        current = 1 - current;
        transition = false;
      }
    }, 100);
    return () => {
      alive = false;
      clearInterval(tick);
      document.removeEventListener("pointerdown", start, true);
      document.removeEventListener("keydown", start, true);
      for (const d of decks) {
        d.pause();
        d.removeAttribute("src");
        d.load();
      }
    };
  }, []);
}
