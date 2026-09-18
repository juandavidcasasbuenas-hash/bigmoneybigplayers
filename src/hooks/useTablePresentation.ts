import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RoomState } from "../../shared/types";
import { STREET, dealReleaseAt } from "../../shared/dealTiming";
import { visiblePot } from "../../shared/potDisplay";
import {
  planTableMotions,
  initialBoardCount,
  publicBoardAt,
  presentationFocus,
  type TableMotion,
} from "../../shared/tableTimeline";
import { playTableSound, setTableSoundsEnabled } from "../audio/tableAudio";

type Presentation = {
  code: string;
  hand: number;
  baseBoard: number;
  motions: TableMotion[];
};
export function useTablePresentation(
  room: RoomState | null,
  now: number,
  sounds: boolean,
  connected: boolean,
) {
  const [view, setView] = useState<Presentation>({
    code: "",
    hand: 0,
    baseBoard: 0,
    motions: [],
  });
  const seen = useRef(0),
    currentCode = useRef(""),
    scheduled = useRef(new Set<string>());
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; at: number }>(),
  );
  const pauseStart = useRef<number | null>(null);
  const wasConnected = useRef(connected);
  const soundAllowed = sounds && connected && !room?.paused;
  useLayoutEffect(() => {
    setTableSoundsEnabled(soundAllowed);
    return () => setTableSoundsEnabled(false);
  }, [soundAllowed]);
  useLayoutEffect(() => {
    if (!room) {
      currentCode.current = "";
      seen.current = 0;
      setView({ code: "", hand: 0, baseBoard: 0, motions: [] });
      return;
    }
    const events = room.tableEvents || [];
    if (!connected) {
      wasConnected.current = false;
      return;
    }
    if (!wasConnected.current) {
      wasConnected.current = true;
      currentCode.current = "";
    }
    if (room.paused && !pauseStart.current) pauseStart.current = room.pausedAt ?? Date.now();
    if (!room.paused && pauseStart.current) {
      const delay = Date.now() - pauseStart.current;
      pauseStart.current = null;
      setView((previous) => ({
        ...previous,
        motions: previous.motions.map((m) => ({
          ...m,
          startAt: events.find(e => e.id === m.id)?.presentAt ?? m.startAt + delay,
        })),
      }));
    }
    if (currentCode.current !== room.code) {
      currentCode.current = room.code;
      seen.current = events.at(-1)?.sequence || 0;
      scheduled.current.clear();
      const current = events.filter(e => e.handNumber === room.handNumber && e.presentAt !== undefined);
      setView({
        code: room.code,
        hand: room.handNumber,
        baseBoard: initialBoardCount(room.board.length, current),
        motions: planTableMotions(current, Date.now()),
      });
      return;
    }
    const fresh = events.filter((e) => e.sequence > seen.current);
    seen.current = Math.max(seen.current, events.at(-1)?.sequence || 0);
    if (!fresh.length || !connected) return;
    setView((previous) => {
      const changed = previous.hand !== room.handNumber;
      const kept = changed ? [] : previous.motions;
      const liveFresh = fresh.filter((e) => e.handNumber === room.handNumber);
      const tail = Math.max(
        Date.now(),
        ...kept.map((e) => e.startAt + e.duration),
      );
      return {
        code: room.code,
        hand: room.handNumber,
        baseBoard: changed ? 0 : previous.baseBoard,
        motions: [
          ...kept,
          ...planTableMotions(liveFresh, Date.now(), tail),
        ].slice(-96),
      };
    });
  }, [room, connected]);
  useLayoutEffect(() => {
    if (!soundAllowed) {
      for (const { timer } of pending.current.values()) clearTimeout(timer);
      pending.current.clear();
      return;
    }
    const schedule = (
      key: string,
      at: number,
      sound: Parameters<typeof playTableSound>[0],
      volume = 1,
    ) => {
      if (scheduled.current.has(key) || at < Date.now() - 350) return;
      const existing = pending.current.get(key);
      if (existing?.at === at) return;
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(
        () => {
          pending.current.delete(key);
          scheduled.current.add(key);
          playTableSound(sound, { volume });
        },
        Math.max(0, at - Date.now()),
      );
      pending.current.set(key, { timer, at });
    };
    for (const motion of view.motions) {
      if (motion.type === "hand-start") {
        schedule(motion.id, motion.startAt, "shuffle", 0.7);
        for (let i = 0; i < motion.playerIds.length * 2; i++)
          schedule(
            `${motion.id}:${i}`,
            motion.startAt + dealReleaseAt(i),
            "card",
            0.48,
          );
      } else if (motion.type === "street") {
        const count = motion.stage === "flop" ? 3 : 1;
        for (let i = 0; i < count; i++) {
          schedule(
            `${motion.id}:slide:${i}`,
            motion.startAt + STREET.release + i * STREET.interval,
            "card",
            0.7,
          );
          schedule(
            `${motion.id}:flip:${i}`,
            motion.startAt + STREET.release - 70 + i * STREET.interval,
            "reveal",
            0.55,
          );
        }
      } else if (motion.type === 'all-in' || motion.type === 'showdown') {
        schedule(`${motion.id}:table-cards`, motion.startAt + 450, 'reveal', 0.45);
      } else if (motion.type === "bet")
        schedule(
          motion.id,
          motion.startAt + motion.duration * (motion.forced ? 0.25 : 0.33),
          "chips",
          motion.forced ? 0.45 : 0.85,
        );
      else if (motion.type === "check")
        schedule(motion.id, motion.startAt + 570, "check", 0.6);
      else if (motion.type === "fold")
        schedule(
          motion.id,
          motion.startAt + motion.duration * 0.43,
          "fold",
          0.7,
        );
      else if (motion.type === "award") {
        schedule(motion.id, motion.startAt + 150, "collect", 1);
        schedule(`${motion.id}:finish`, motion.startAt + 1250, "win", 0.48);
      }
    }
  }, [view.motions, soundAllowed]);
  useLayoutEffect(
    () => () => {
      for (const { timer } of pending.current.values()) clearTimeout(timer);
      pending.current.clear();
    },
    [room?.code],
  );
  const stateMatches =
    !!room && view.code === room.code && view.hand === room.handNumber;
  const motions = stateMatches ? view.motions : [];
  const award = [...motions].reverse().find((e) => e.type === "award");
  const active = [...motions]
    .reverse()
    .find(
      (e) =>
        now >= e.startAt &&
        now < e.startAt + e.duration &&
        ["hand-start", "street", "all-in", "showdown", "award"].includes(e.type),
    );
  const pendingAward = !!award && now < award.startAt;
  const latestAction = [...motions]
    .reverse()
    .find(
      (e) =>
        now >= e.startAt &&
        now < e.startAt + e.duration &&
        ["bet", "check", "fold"].includes(e.type) &&
        !(e.type === "bet" && e.forced),
    );
  const board = useMemo(
    () =>
      room
        ? publicBoardAt(
            room.board,
            stateMatches ? view.baseBoard : room.board.length,
            motions,
            now,
          )
        : [],
    [room?.board, view.baseBoard, stateMatches, motions, now],
  );
  const focus = presentationFocus(motions, now);
  return {
    motions,
    board,
    active,
    award,
    pendingAward,
    latestAction,
    focusActorId: focus.actorId,
    focusTable: focus.table || (!!room?.handReview && now >= room.handReview.startsAt),
    potVisible: room ? !room.winners.length || pendingAward : false,
    pot: room ? visiblePot(room.pot, motions, now) : 0,
    settled: !!room?.winners.length && !pendingAward,
  };
}
export type TablePresentation = ReturnType<typeof useTablePresentation>;
