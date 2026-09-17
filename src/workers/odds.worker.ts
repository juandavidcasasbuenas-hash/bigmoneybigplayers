import { headsUpOdds } from "../../shared/handOdds";
self.onmessage = (
  event: MessageEvent<{ hands: [string[], string[]]; board: string[] }>,
) => {
  try {
    self.postMessage({
      ok: true,
      result: headsUpOdds(event.data.hands, event.data.board),
    });
  } catch {
    self.postMessage({ ok: false });
  }
};
