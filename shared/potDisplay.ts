import type { TableMotion } from './tableTimeline';

export const POT_ORIGIN = [0, 1.385, 1.16] as const;
export const POT_CHIP_SCALE = 0.44;
const COLORS = ['#b4514b', '#afbaa0', '#d4b56e', '#738ba1'];

/** Amount-scaled chip piles, capped at twelve inexpensive stack meshes. */
export function potStacks(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const chips = Math.min(144, Math.max(2, Math.ceil(8 * Math.log2(1 + amount / 25))));
  return Array.from({ length: Math.ceil(chips / 12) }, (_, i) => ({
    count: Math.min(12, chips - i * 12),
    color: COLORS[i % COLORS.length],
    position: [
      POT_ORIGIN[0] + ((i % 4) - 1.5) * 0.22,
      POT_ORIGIN[1],
      POT_ORIGIN[2] + Math.floor(i / 4) * 0.205,
    ] as [number, number, number],
  }));
}

/** Contributions join the centre pile when their visible push finishes. */
export function visiblePot(amount: number, motions: TableMotion[], now: number) {
  const inFlight = motions.reduce((sum, m) => sum + (
    m.type === 'bet' && now < m.startAt + m.duration ? m.amount : 0
  ), 0);
  return Math.max(0, amount - inFlight);
}
