export type QueuedCue = {
  notBefore?: number;
  expiresAt: number;
  priority: number;
  result?: unknown;
};
/** Pending synthesis cannot monopolise playback; an eligible, ready cue wins by priority then arrival. */
export function nextReadyCue<T extends QueuedCue>(
  queue: T[],
  now: number,
): number {
  let selected = -1;
  for (let i = 0; i < queue.length; i++) {
    const cue = queue[i];
    if (
      cue.result === undefined ||
      now < (cue.notBefore ?? 0) ||
      now > cue.expiresAt
    )
      continue;
    if (selected < 0 || cue.priority > queue[selected].priority) selected = i;
  }
  return selected;
}
