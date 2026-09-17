/** One source of truth for the dealer's release, card landing and player pickup. */
export const DEAL = {
  first: 650,
  interval: 280,
  flight: 520,
  pickupWait: 180,
  pickup: 620,
} as const;
export const STREET = { release: 240, interval: 260, flight: 520 } as const;
export const dealReleaseAt = (cardIndex: number) =>
  DEAL.first + cardIndex * DEAL.interval;
export const holePickupAt = (count: number, playerIndex: number) =>
  dealReleaseAt(count + playerIndex) + DEAL.flight + DEAL.pickupWait;
export const dealDuration = (count: number) =>
  Math.max(3200, holePickupAt(count, count - 1) + DEAL.pickup + 100);
