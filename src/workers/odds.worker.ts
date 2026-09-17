import { showdownOdds } from "../../shared/handOdds";
self.onmessage = (
  event: MessageEvent<{ hands: string[][]; board: string[] }>,
) => {
  try {
    self.postMessage({
      ok: true,
      result: showdownOdds(event.data.hands, event.data.board),
    });
  } catch {
    self.postMessage({ ok: false });
  }
};
