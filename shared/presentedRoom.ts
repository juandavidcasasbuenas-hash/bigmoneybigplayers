import type { RoomState } from "./types";

/** Hold result labels and credited stacks until the visible runout reaches the award. */
export function presentRoom(
  room: RoomState | null,
  pendingAward: boolean,
  visibleBoardCount: number,
): RoomState | null {
  if (!room || !pendingAward) return room;
  const credits = new Map(room.winners.map((w) => [w.playerId, w.amount]));
  return {
    ...room,
    stage:
      visibleBoardCount >= 5
        ? "river"
        : visibleBoardCount === 4
          ? "turn"
          : visibleBoardCount >= 3
            ? "flop"
            : "preflop",
    players: room.players.map((p) => ({
      ...p,
      chips: p.chips - (credits.get(p.id) || 0),
      status: p.status === "out" && p.cardCount > 0 ? "all-in" : p.status,
    })),
  };
}
