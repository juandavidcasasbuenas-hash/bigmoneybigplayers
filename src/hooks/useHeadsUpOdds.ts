import { useEffect, useState } from "react";
import type { HeadsUpResult } from "../../shared/handOdds";
import type { TableMotion } from "../../shared/tableTimeline";
export function useHeadsUpOdds(
  motions: TableMotion[],
  board: string[],
  now: number,
) {
  const event = motions.find((m) => m.type === "all-in" && now >= m.startAt);
  const hands = event?.type === "all-in" ? event.players : undefined;
  const stableBoard = [0, 3, 4, 5].includes(board.length) ? board : [];
  const key = hands
    ? JSON.stringify({ hands: hands.map((p) => p.cards), board: stableBoard })
    : "";
  const [value, setValue] = useState<{
    key: string;
    result: HeadsUpResult;
  } | null>(null);
  useEffect(() => {
    if (!key) {
      setValue(null);
      return;
    }
    const worker = new Worker(
      new URL("../workers/odds.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e) => {
      if (e.data.ok) setValue({ key, result: e.data.result });
    };
    worker.postMessage(JSON.parse(key));
    return () => worker.terminate();
  }, [key]);
  return hands
    ? { players: hands, result: value?.key === key ? value.result : null }
    : null;
}
