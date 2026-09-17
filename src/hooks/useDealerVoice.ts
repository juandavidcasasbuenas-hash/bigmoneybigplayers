import { useCallback, useEffect, useRef, useState } from "react";
import type { DealerMessage, RoomState } from "../../shared/types";
import { readStored } from "./storage";
import { trackVoice } from "../audio/tableAudio";
import { nextReadyCue } from "../audio/voiceQueue";
import { dealerCueTiming, isCurrentDealerCue } from "../../shared/dealerPolicy";

type VoiceStatus = "ready" | "unavailable" | "loading" | "blocked" | "error";
type VoiceResponse = {
  ok: boolean;
  audioUrl?: string;
  text?: string;
  error?: string;
  clips?: { audioUrl: string; text: string }[];
};
type VoiceEvent = {
  id: string;
  at: number;
  message?: DealerMessage;
  actor: string;
  notBefore?: number;
  expiresAt?: number;
  payload: Record<string, unknown>;
};
type VoiceJob = {
  notBefore?: number;
  message?: DealerMessage;
  roomCode?: string;
  actor: string;
  generation: number;
  expiresAt: number;
  priority: number;
  result?: VoiceResponse;
  clipIndex?: number;
  done?: () => void;
};
const server = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");

export function useDealerVoice(
  room: RoomState | null,
  enabled: boolean,
  volumes = { dealer: 0.78, players: 0.88 },
) {
  const volumeRef = useRef(volumes);
  volumeRef.current = volumes;
  const [status, setStatus] = useState<VoiceStatus>("loading");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState<{
    actor: string;
    text: string;
  } | null>(null);
  const liveRoom = useRef(room);
  liveRoom.current = room;
  const lastHand = useRef(0);
  const wasPaused = useRef(false);
  const providerReady = useRef(false);
  const seen = useRef(new Set<string>());
  const currentRoom = useRef<string | null>(null);
  const generation = useRef(0);
  const queue = useRef<VoiceJob[]>([]);
  const running = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const finishAudio = useRef<(() => void) | null>(null);
  const requests = useRef(new Set<AbortController>());
  const alive = useRef(true);

  const stop = useCallback(() => {
    ++generation.current;
    queue.current.forEach((job) => job.done?.());
    queue.current = [];
    for (const request of requests.current) request.abort();
    requests.current.clear();
    audio.current?.pause();
    if (audio.current) audio.current.removeAttribute("src");
    finishAudio.current?.();
    finishAudio.current = null;
    audio.current = null;
    running.current = false;
    if (alive.current)
      setStatus((previous) =>
        previous === "loading"
          ? providerReady.current
            ? "ready"
            : "unavailable"
          : previous,
      );
  }, []);

  const loadVoice = useCallback(
    async (
      path: string,
      body?: Record<string, unknown>,
    ): Promise<VoiceResponse> => {
      const controller = new AbortController();
      requests.current.add(controller);
      // A stalled provider must not block every later announcement indefinitely.
      // Allow the bounded server queue plus provider generation and asset download.
      const timeout = window.setTimeout(() => controller.abort(), 100_000);
      try {
        const response = await fetch(`${server}${path}`, {
          signal: controller.signal,
          ...(body
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        });
        const result = (await response.json()) as VoiceResponse;
        if (!response.ok || !result.ok || !result.audioUrl)
          return {
            ok: false,
            error:
              result.error ||
              "The dealer voice is unavailable. Please try again.",
          };
        const normalize = (value: string) => {
          const url = new URL(value, server || window.location.origin);
          if (!["http:", "https:"].includes(url.protocol))
            throw new Error("Invalid audio URL");
          return url.href;
        };
        return {
          ...result,
          audioUrl: normalize(result.audioUrl),
          clips: result.clips?.map((clip) => ({
            ...clip,
            audioUrl: normalize(clip.audioUrl),
          })),
        };
      } catch {
        return {
          ok: false,
          error: controller.signal.aborted
            ? "The voice request was interrupted."
            : "Could not reach the voice service.",
        };
      } finally {
        window.clearTimeout(timeout);
        requests.current.delete(controller);
      }
    },
    [],
  );

  const playQueue = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const batch = generation.current;
    while (
      queue.current.length &&
      generation.current === batch &&
      alive.current
    ) {
      queue.current = queue.current.filter((job) => {
        const valid =
          job.generation === batch &&
          Date.now() <= job.expiresAt &&
          (!job.message ||
            (!!liveRoom.current &&
              liveRoom.current.code === job.roomCode &&
              isCurrentDealerCue(liveRoom.current, job.message, Date.now(), !!job.clipIndex)));
        if (!valid) job.done?.();
        return valid;
      });
      const index = nextReadyCue(queue.current, Date.now());
      if (index < 0) break;
      const job = queue.current.splice(index, 1)[0],
        result = job.result!;
      if (!result.ok || !result.audioUrl) {
        setStatus("error");
        setError(result.error || "The voice could not be generated.");
        job.done?.();
        continue;
      }
      if (job.message?.kind === 'street' && !job.clipIndex && liveRoom.current)
        job.expiresAt = dealerCueTiming(liveRoom.current,job.message).notBefore + 22000;
      const clips = result.clips || [
        { audioUrl: result.audioUrl, text: result.text || "" },
      ];
      const clip = clips[job.clipIndex || 0];
      setError("");
      const player = new Audio(clip.audioUrl);
      player.crossOrigin = "anonymous";
      player.preload = "auto";
      player.volume =
        job.actor === "dealer"
          ? volumeRef.current.dealer
          : volumeRef.current.players;
      audio.current = player;
      await new Promise<void>((resolve) => {
        let settled = false;
        let stopTracking: (() => void) | undefined;
        let playbackTimeout: number | undefined;
        const finish = () => {
          if (settled) return;
          settled = true;
          stopTracking?.();
          if (alive.current) setSpeaking(null);
          window.clearTimeout(playbackTimeout);
          player.onended = null;
          player.onerror = null;
          if (finishAudio.current === finish) finishAudio.current = null;
          if (audio.current === player) audio.current = null;
          resolve();
        };
        finishAudio.current = finish;
        player.onended = finish;
        player.onerror = () => {
          if (alive.current && generation.current === batch) {
            setStatus("error");
            setError("The generated voice could not be played.");
          }
          finish();
        };
        playbackTimeout = window.setTimeout(
          () => {
            player.pause();
            finish();
          },
          job.roomCode && job.actor !== "dealer"
            ? Math.max(300, job.expiresAt - Date.now() + 500)
            : 90_000,
        );
        void player
          .play()
          .then(() => {
            if (!settled && alive.current && generation.current === batch) {
              providerReady.current = true;
              stopTracking = trackVoice(player, job.actor);
              setSpeaking({ actor: job.actor, text: clip.text });
              setStatus("ready");
            }
          })
          .catch((cause: unknown) => {
            if (alive.current && generation.current === batch) {
              const blocked =
                cause instanceof DOMException &&
                cause.name === "NotAllowedError";
              setStatus(blocked ? "blocked" : "error");
              setError(
                blocked
                  ? "Your browser needs a click before playing voices. Open Audio settings and use Test audio."
                  : "The generated voice could not be played.",
              );
              // Do not repeatedly attempt queued autoplay while the browser has blocked audio.
              if (blocked) {
                queue.current.forEach((item) => item.done?.());
                queue.current = [];
              }
            }
            finish();
          });
      });
      job.clipIndex = (job.clipIndex || 0) + 1;
      if (job.clipIndex < clips.length && generation.current === batch)
        queue.current.unshift(job);
      else job.done?.();
    }
    if (generation.current === batch) running.current = false;
  }, []);

  const enqueue = useCallback(
    (job: VoiceJob, response: Promise<VoiceResponse>) => {
      queue.current.push(job);
      void response.then((result) => {
        if (alive.current && job.generation === generation.current) {
          job.result = result;
          void playQueue();
        }
      });
    },
    [playQueue],
  );
  useEffect(() => {
    const tick = window.setInterval(() => void playQueue(), 100);
    return () => clearInterval(tick);
  }, [playQueue]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      providerReady.current = false;
      setStatus("unavailable");
      setError("Could not reach the voice service.");
      controller.abort();
    }, 8000);
    void fetch(`${server}/api/voice/status`, { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as { enabled?: boolean };
        if (controller.signal.aborted) return;
        providerReady.current = response.ok && result.enabled === true;
        setStatus(providerReady.current ? "ready" : "unavailable");
        setError(
          providerReady.current
            ? ""
            : "The premium voice service has not been configured on this server.",
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        providerReady.current = false;
        setStatus("unavailable");
        setError("Could not reach the voice service.");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled]);

  useEffect(() => {
    stop();
    return stop;
  }, [room?.code, stop]);

  useEffect(() => {
    if (!enabled || room?.paused) stop();
  }, [enabled, room?.paused, stop]);

  useEffect(() => {
    if (!room) {
      currentRoom.current = null;
      seen.current.clear();
      return;
    }
    const events: VoiceEvent[] = room.dealerMessages.map((message) => ({
      id: `dealer:${message.id}`,
      at: message.at,
      actor: "dealer",
      message,
      payload: { kind: "dealer", messageId: message.id },
    }));
    for (const event of room.tableEvents || []) {
      if (
        !event.speech ||
        !("playerId" in event) ||
        (event.type === "bet" && event.forced)
      )
        continue;
      const at = event.presentAt ?? event.at;
      events.push({
        id: `action:${event.id}`,
        at: event.at,
        actor: event.playerId,
        notBefore: at + 100,
        expiresAt:
          at +
          (event.type === "bet" && event.action === "all-in" ? 2600 : 2100),
        payload: { kind: "action", eventId: event.id },
      });
    }
    for (const player of room.players)
      if (player.emote) {
        events.push({
          id: `emote:${player.id}:${player.emote.at}`,
          at: player.emote.at,
          actor: player.id,
          expiresAt: player.emote.at + 12000,
          payload: { kind: "emote", playerId: player.id, at: player.emote.at },
        });
      }
    events.sort((a, b) => a.at - b.at);
    if (currentRoom.current !== room.code) {
      currentRoom.current = room.code;
      lastHand.current = room.handNumber;
      seen.current = new Set(events.map((event) => event.id));
      return;
    }
    if (lastHand.current !== room.handNumber) {
      stop();
      lastHand.current = room.handNumber;
    }
    if (wasPaused.current && !room.paused) {
      for (const event of events) {
        const timing = event.message
          ? dealerCueTiming(room, event.message)
          : null;
        if (
          (timing?.expiresAt ?? event.expiresAt ?? 0) > Date.now() &&
          (timing?.notBefore ?? event.notBefore ?? event.at) >=
            Date.now() - 1000
        )
          seen.current.delete(event.id);
      }
    }
    wasPaused.current = room.paused;
    const fresh = events.filter((event) => !seen.current.has(event.id));
    for (const event of events) seen.current.add(event.id);
    // The server sends bounded history; allow a small overlap for duplicate snapshots.
    if (seen.current.size > 300)
      seen.current = new Set([...seen.current].slice(-200));
    if (
      !enabled ||
      room.paused ||
      !room.settings.dealerVoice ||
      !providerReady.current
    )
      return;
    const token = readStored(`bigmoney:${room.code}`);
    if (!token) return;
    for (const event of fresh) {
      if (event.message && !isCurrentDealerCue(room, event.message)) continue;
      const timing = event.message
        ? dealerCueTiming(room, event.message)
        : null;
      const expiresAt =
        timing?.expiresAt ?? event.expiresAt ?? event.at + 30000;
      if (Date.now() > expiresAt) continue;
      // Fetch starts immediately, including while the previous clip is still playing.
      enqueue(
        {
          actor: event.actor,
          message: event.message,
          roomCode: room.code,
          notBefore: timing?.notBefore ?? event.notBefore,
          priority:
            event.payload.kind === "emote"
              ? event.actor === room.you
                ? 4
                : 3
              : event.payload.kind === "action"
                ? 2
                : 1,
          generation: generation.current,
          expiresAt,
        },
        loadVoice("/api/voice", {
          roomCode: room.code,
          token,
          ...event.payload,
        }),
      );
    }
    if (queue.current.length) void playQueue();
  }, [room, enabled, loadVoice, playQueue, stop, enqueue]);

  useEffect(() => {
    if (audio.current && speaking)
      audio.current.volume =
        speaking.actor === "dealer" ? volumes.dealer : volumes.players;
  }, [volumes.dealer, volumes.players, speaking]);

  const preview = useCallback(
    async (speaker = "dealer", emote?: string): Promise<void> => {
      // A deliberate voice test is allowed even when automatic table speech is muted.
      stop();
      setStatus("loading");
      setError("");
      const query = emote ? `?emote=${encodeURIComponent(emote)}` : "";
      const path = `/api/voice/preview/${encodeURIComponent(speaker)}${query}`;
      await new Promise<void>((done) => {
        enqueue(
          {
            actor: speaker,
            generation: generation.current,
            expiresAt: Date.now() + 120000,
            priority: 4,
            done,
          },
          loadVoice(path),
        );
        void playQueue();
      });
    },
    [stop, loadVoice, playQueue, enqueue],
  );

  return { status, error, preview, speaking };
}
