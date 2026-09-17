import { expect, it } from 'vitest';
import { potStacks, visiblePot } from './potDisplay';
import { planTableMotions } from './tableTimeline';

it('grows visible chip counts monotonically while bounding geometry for huge pots', () => {
  const amounts = [0, 25, 75, 150, 1000, 5000, 10000, 120000, 1e12];
  const counts = amounts.map(amount => {
    const piles = potStacks(amount);
    expect(piles.length).toBeLessThanOrEqual(12);
    expect(piles.every(p => p.count > 0 && p.count <= 12)).toBe(true);
    return piles.reduce((n, p) => n + p.count, 0);
  });
  expect(counts).toEqual([...counts].sort((a, b) => a - b));
  expect(counts[5]).toBeGreaterThan(counts[2]);
  expect(counts.at(-1)).toBe(144);
});

it('adds a contribution only after its chip slide lands, including reconnect timestamps', () => {
  const motions = planTableMotions([
    { type: 'bet', id: 'a', sequence: 1, handNumber: 1, at: 1000, presentAt: 1200, playerId: 'a', amount: 75, to: 100, forced: false },
    { type: 'bet', id: 'b', sequence: 2, handNumber: 1, at: 3200, presentAt: 3200, playerId: 'b', amount: 50, to: 100, forced: false },
  ], 4000);
  expect(visiblePot(200, motions, 1200)).toBe(75);
  expect(visiblePot(200, motions, 3100)).toBe(150);
  expect(visiblePot(200, motions, 5100)).toBe(200);
});
