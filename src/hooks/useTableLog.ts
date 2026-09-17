import {dealerCueTiming} from '../../shared/dealerPolicy';
import { useEffect, useState } from "react";
import type { RoomState } from "../../shared/types";
type Entry = {
  id: string;
  at: number;
  text: string;
  kind: "event" | "chat" | "reaction" | "system";
  name?: string;
};
export function useTableLog(
  room: RoomState | null,
  now: number,
  voiceError: string,
) {
  const [history, setHistory] = useState<{ code: string; entries: Entry[] }>({
    code: "",
    entries: [],
  });
  useEffect(() => {
    if (!room) {
      setHistory({ code: "", entries: [] });
      return;
    }
    const entries: Entry[] = [];
    const events = room.tableEvents || [];
    const name = (id: string) =>
      room.players.find((p) => p.id === id)?.name || "Player";
    for (const m of room.dealerMessages) {
      entries.push({
        id: m.id,
        at: dealerCueTiming(room,m).notBefore,
        text: m.text,
        kind: "event",
      });
    }
    for (const e of events) {
      if (e.type === "check" || e.type === "fold")
        entries.push({
          id: e.id,
          at: e.presentAt ?? e.at,
          text: e.type === "check" ? "checks." : "folds.",
          name: name(e.playerId),
          kind: "event",
        });
      if (e.type === "bet")
        entries.push({
          id: e.id,
          at: e.presentAt ?? e.at,
          text: `${e.forced ? "posts" : e.action === "raise" ? "raises to" : e.action === "all-in" ? "is all in for" : e.action === "call" ? "calls" : "bets"} ${(e.action === "raise" ? e.to : e.amount).toLocaleString("en-GB")}.`,
          name: name(e.playerId),
          kind: "event",
        });
    }
    for (const m of room.chat)
      entries.push({
        ...m,
        kind: "chat",
        name: m.channel === "spectators" ? `${m.name} · rail` : m.name,
      });
    for (const p of room.players)
      if (p.emote)
        entries.push({
          id: `emote:${p.id}:${p.emote.at}`,
          at: p.emote.at,
          name: p.name,
          text: p.emote.text,
          kind: "reaction",
        });
    if (voiceError)
      entries.push({
        id: `voice:${voiceError}`,
        at: Date.now(),
        text: voiceError,
        kind: "system",
      });
    setHistory((previous) => {
      const map = new Map(
        (previous.code === room.code ? previous.entries : []).map((e) => [
          e.id,
          e,
        ]),
      );
      for (const e of entries)
        if (e.kind !== "system" || !map.has(e.id)) map.set(e.id, e);
      return {
        code: room.code,
        entries: [...map.values()].sort((a, b) => a.at - b.at).slice(-300),
      };
    });
  }, [room, voiceError]);
  return history.code === room?.code
    ? history.entries.filter((e) => e.at <= now)
    : [];
}
