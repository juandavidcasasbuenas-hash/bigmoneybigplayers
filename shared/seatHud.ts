import type { RoomState } from "./types";
import type { TableMotion } from "./tableTimeline";

export type SeatTagTone = "fold" | "check" | "call" | "raise" | "all-in" | "win";
export interface SeatHud {
  /** Chips behind, excluding bets whose push has not been shown yet. */
  stack: number;
  /** Chips committed on the visible street. */
  bet: number;
  tag: { text: string; tone: SeatTagTone } | null;
  folded: boolean;
  allIn: boolean;
  dealer: boolean;
  smallBlind: boolean;
  bigBlind: boolean;
  away: boolean;
}

const ACTION_TEXT: Record<string, string> = {
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  "all-in": "All in",
};

/**
 * Nameplate state follows the table animation, not the server snapshot.
 * The snapshot can already contain a fold or raise whose gesture has not been
 * shown yet; a plate must never announce it early.
 */
export function seatHudAt(
  room: RoomState,
  motions: TableMotion[],
  now: number,
  settled: boolean,
): Record<string, SeatHud> {
  const started = motions.filter((m) => m.startAt <= now);
  const streetStart = [...started]
    .reverse()
    .find((m) => m.type === "street" || m.type === "hand-start");
  const streetFrom = streetStart?.startAt ?? -Infinity;
  const onStreet = started.filter(
    (m) => m.startAt >= streetFrom && m !== streetStart,
  );
  const award = [...started].reverse().find((m) => m.type === "award");
  const handStart = motions.find((m) => m.type === "hand-start");
  const out: Record<string, SeatHud> = {};
  for (const p of room.players) {
    const own = (m: TableMotion) => "playerId" in m && m.playerId === p.id;
    const pending = motions.filter((m) => m.startAt > now && own(m));
    const pendingFold = pending.some((m) => m.type === "fold");
    const pendingBet = pending.some((m) => m.type === "bet");
    const shown = onStreet.filter(own);
    const lastShown = shown.at(-1);
    const lastBet = [...shown]
      .reverse()
      .find((m) => m.type === "bet");
    // Chips move into the pot at each street and at the award. Blinds are
    // bet motions too, so the last visible bet is authoritative; the snapshot
    // is only trusted when no timeline exists (a fresh reconnect).
    const bet =
      settled || award || room.stage === "showdown"
        ? 0
        : lastBet?.type === "bet"
          ? lastBet.to
          : streetStart
            ? 0
            : p.bet;
    const folded =
      (p.status === "folded" && !pendingFold) ||
      started.some((m) => m.type === "fold" && own(m));
    const allIn =
      !folded &&
      (lastBet?.type === "bet" && lastBet.action === "all-in"
        ? true
        : p.status === "all-in" && !pendingBet);
    const winner = settled
      ? room.winners.find((w) => w.playerId === p.id)
      : undefined;
    let tag: SeatHud["tag"] = null;
    if (winner)
      tag = { text: `Wins ${winner.amount.toLocaleString("en-GB")}`, tone: "win" };
    else if (folded) tag = { text: "Folded", tone: "fold" };
    else if (allIn) tag = { text: "All in", tone: "all-in" };
    else if (lastShown?.type === "check") tag = { text: "Check", tone: "check" };
    else if (lastShown?.type === "bet" && !lastShown.forced) {
      const action = lastShown.action || "bet";
      const tone: SeatTagTone =
        action === "call" ? "call" : action === "all-in" ? "all-in" : "raise";
      // The amount lives in the bet pill; the tag names the action only.
      tag = { text: ACTION_TEXT[action] || "Bet", tone };
    }
    // Rebuild the stack from the start of the hand so a snapshot that is
    // ahead of the animation cannot show chips already gone.
    const shownCommitted = started.reduce(
      (sum, m) => sum + (m.type === "bet" && own(m) ? m.amount : 0),
      0,
    );
    const stack =
      settled || !handStart || room.stage === "lobby"
        ? p.chips
        : Math.max(0, p.chips + p.totalBet - shownCommitted);
    out[p.id] = {
      stack,
      bet,
      tag,
      folded,
      allIn,
      dealer: room.dealerId === p.id,
      smallBlind: room.smallBlindId === p.id,
      bigBlind: room.bigBlindId === p.id,
      away: !p.connected && !p.isBot,
    };
  }
  return out;
}
