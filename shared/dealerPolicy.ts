import type { DealerMessage, RoomState } from "./types";

/** The server can settle an all-in immediately; speech follows its public presentation clock. */
export function dealerCueTiming(room: RoomState, message: DealerMessage) {
  const events = (room.tableEvents || []).filter(
    (e) => e.handNumber === message.handNumber,
  );
  const event =
    message.kind === "hand-start"
      ? events.find((e) => e.type === "hand-start")
      : message.kind === "street"
        ? events.find((e) => e.type === "street" && e.stage === message.stage)
        : ["hand-end", "result", "champion"].includes(message.kind || "") || message.afterAward
          ? events.find((e) => e.type === "award")
          : undefined;
  const notBefore = event?.presentAt ?? message.at;
  const next = events.find(
    (e) => e.type === "street" && (e.presentAt ?? e.at) > notBefore,
  );
  const lifetime =
    message.kind === "hand-start"
      ? 12000
      : message.kind === "street"
        ? 14000
        : message.kind === "all-in"
          ? 7000
          : 45000;
  const end =
    message.kind === "street" || message.kind === "hand-start"
      ? next?.presentAt
      : room.nextHandAt;
  return {
    notBefore,
    expiresAt: Math.min(notBefore + lifetime, end ?? Infinity),
    event,
  };
}
/** Future public streets may be prepared ahead of time, but are never played early. */
export function isCurrentDealerCue(
  room: RoomState,
  message: DealerMessage,
  now = Date.now(),
  started = false,
) {
  if (
    !message.kind ||
    message.kind === "log" ||
    room.paused ||
    !room.settings.dealerVoice ||
    message.handNumber !== room.handNumber
  )
    return false;
  const timing = dealerCueTiming(room, message);
  // Finish a spoken card sequence at clip boundaries; the next hand still cancels it.
  if (started && message.kind === "street") return now <= timing.notBefore + 22000;
  if (now > timing.expiresAt) return false;
  if (timing.event) return true;
  switch (message.kind) {
    case "hand-start":
      return room.stage === "preflop";
    case "street":
      return message.stage === room.stage;
    case "all-in":
      return ["preflop", "flop", "turn", "river"].includes(room.stage);
    case "hand-end":
    case "result":
      return room.stage === "showdown" || room.stage === "finished";
    case "champion":
      return room.stage === "finished";
  }
}
