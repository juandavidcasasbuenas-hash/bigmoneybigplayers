import type { RoomState, TableEvent } from "./types";
import { dealDuration, STREET } from "./dealTiming";

export type TableMotion = TableEvent & { startAt: number; duration: number };

/** A snapshot can arrive before the UI clock reaches its presentation timestamp.
 * Keep watching that gesture rather than briefly looking at the next player. */
export function presentationFocus(motions: TableMotion[], now: number) {
  const motion = motions.find(m => now < m.startAt + m.duration && !(m.type === 'bet' && m.forced));
  return {
    actorId: motion && ['bet', 'check', 'fold'].includes(motion.type) && 'playerId' in motion ? motion.playerId : undefined,
    table: !!motion && ['hand-start', 'street', 'all-in', 'showdown', 'award'].includes(motion.type),
  };
}
export const motionDuration = (e: TableEvent) =>
  e.type === "all-in"
    ? 4200
    : e.type === "showdown"
      ? 3600
    : e.type === "hand-start"
      ? dealDuration(e.playerIds.length)
      : e.type === "street"
        ? e.stage === "flop"
          ? e.runout
            ? 8000
            : 1700
          : e.runout
            ? 4600
            : 1400
        : e.type === "award"
          ? 2200
          : e.type === "bet"
            ? e.forced
              ? 650
              : e.action === "all-in"
                ? 2400
                : 1900
            : 1700;

/** An ordered public event stream preserves the flop/turn/river even in a single all-in snapshot. */
export function planTableMotions(
  events: TableEvent[],
  now: number,
  after = now,
): TableMotion[] {
  let cursor = Math.max(now, after),
    handStart = now;
  return events.map((event) => {
    if (event.type === "hand-start") {
      cursor = now;
      handStart = now;
    }
    const startAt =
      event.presentAt ??
      (event.type === "bet" && event.forced ? handStart + 250 : cursor);
    const duration = motionDuration(event);
    if (!(event.type === "bet" && event.forced)) cursor = startAt + duration;
    return { ...event, startAt, duration };
  });
}
export function settlementDelay(room: RoomState, at: number) {
  return burstDuration(room.tableEvents || [], room.handNumber, at);
}
export function burstDuration(events: TableEvent[], hand: number, at: number) {
  const burst = events.filter(
    (e) =>
      e.handNumber === hand &&
      e.at >= at - 100 &&
      e.at <= at &&
      e.type !== "award",
  );
  return burst.reduce(
    (sum, e) => sum + (e.type === "bet" && e.forced ? 0 : motionDuration(e)),
    0,
  );
}
export function publicBoardAt(
  board: string[],
  baseCount: number,
  motions: TableMotion[],
  now: number,
) {
  let count = baseCount;
  for (const e of motions) {
    if (e.type === "street") {
      const first = e.stage === "flop" ? 0 : e.stage === "turn" ? 3 : 4;
      for (let i = first; i < e.board.length; i++)
        if (
          now >=
          e.startAt +
            STREET.release +
            STREET.flight +
            (i - first) * STREET.interval
        )
          count = Math.max(count, i + 1);
    }
  }
  return board.slice(0, count);
}

/** Resume an in-flight runout even if a long hand has evicted its deal from history. */
export function initialBoardCount(boardLength: number, events: TableEvent[]) {
  return Math.min(boardLength, ...events.flatMap(event =>
    event.type === 'hand-start' ? [0] : event.type === 'street'
      ? [event.stage === 'flop' ? 0 : event.stage === 'turn' ? 3 : 4]
      : [],
  ));
}
