import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../../shared/types";
import { playTableSound, unlockTableAudio } from "../audio/tableAudio";

export function turnFeedback(
  room: RoomState | null,
  now: number,
  connected = true,
) {
  const player = room?.players.find((p) => p.id === room.turnPlayerId);
  const live =
    !!room &&
    !!player &&
    !!room.turnId &&
    !!room.turnEndsAt &&
    (room.turnStartsAt == null ||
      (room.paused ? (room.pausedAt ?? now) : now) >= room.turnStartsAt) &&
    ["preflop", "flop", "turn", "river"].includes(room.stage);
  const effectiveNow = room?.paused ? (room.pausedAt ?? now) : now;
  const remainingMs = live
    ? Math.min(
        room.settings.turnSeconds * 1000,
        Math.max(0, room.turnEndsAt! - effectiveNow),
      )
    : 0;
  const seconds = Math.ceil(remainingMs / 1000),
    progress = live
      ? Math.min(1, remainingMs / (room.settings.turnSeconds * 1000))
      : 0;
  const myTurn =
    live &&
    connected &&
    !room.paused &&
    player.id === room.you &&
    !!room.actions;
  return {
    live,
    seconds,
    progress,
    myTurn,
    player,
    urgent: myTurn && seconds <= 5,
    paused: !!room?.paused,
    connected,
  };
}
export type TurnFeedback = ReturnType<typeof turnFeedback>;
export function useTableFeedback(
  room: RoomState | null,
  enabled: boolean,
  connected: boolean,
) {
  const [now, setNow] = useState(Date.now),
    [audioReady, setAudioReady] = useState(false);
  const lastTurn = useRef(""),
    lastWarning = useRef("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const unlock = () => {
      void unlockTableAudio().then(setAudioReady);
    };
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
  const cue = turnFeedback(room, now, connected);
  useEffect(() => {
    if (!room) {
      lastTurn.current = "";
      lastWarning.current = "";
      return;
    }
    if (!enabled || !cue.myTurn || !audioReady) return;
    const key = `${room.code}:${room.turnId}`;
    if (lastTurn.current !== key && playTableSound("turn")) {
      lastTurn.current = key;
      return;
    }
    if (
      cue.seconds > 0 &&
      cue.seconds <= 5 &&
      lastWarning.current !== `${key}:${cue.seconds}`
    ) {
      if (playTableSound("warning"))
        lastWarning.current = `${key}:${cue.seconds}`;
    }
  }, [room?.code, room?.turnId, cue.myTurn, cue.seconds, enabled, audioReady]);
  useEffect(() => {
    document.title = cue.myTurn
      ? "Your turn — Big Money Poker"
      : "Big Money — Poker with your people";
    return () => {
      document.title = "Big Money — Poker with your people";
    };
  }, [cue.myTurn]);
  return { ...cue, audioReady, now };
}
