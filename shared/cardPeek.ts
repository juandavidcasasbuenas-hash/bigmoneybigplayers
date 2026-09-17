/** Public gesture only. Card identities are never part of this message. */
export interface CardPeek {
  handNumber: number;
  startedAt: number;
  releasedAt: number | null;
  from: number;
}
export interface CardPeekRequest { handNumber: number; holding: boolean }
export const PEEK_RAISE_MS = 850;
export const PEEK_LOWER_MS = 650;
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Sample the same server-timed gesture in every view, including late joiners.
 * Releasing halfway up lowers from that exact pose, without a jump. */
export function cardPeekProgress(peek: CardPeek | null | undefined, now: number) {
  if (!peek) return 0;
  const raised = (at: number) => peek.from + (1 - peek.from) * ease((at - peek.startedAt) / PEEK_RAISE_MS);
  return peek.releasedAt === null
    ? raised(now)
    : raised(Math.min(now, peek.releasedAt)) * (1 - ease((now - peek.releasedAt) / PEEK_LOWER_MS));
}
