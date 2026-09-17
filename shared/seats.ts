/** Physical seat numbers advance clockwise; slot zero on the rail is Monty's. */
export const SEAT_COUNT = 12;
// Fill opposite sides first without moving anyone when a table grows or shrinks.
export const SEAT_PREFERENCE = [5, 1, 9, 3, 7, 11, 0, 2, 4, 6, 8, 10] as const;
export function clockwiseDistance(after: number, seat: number): number {
  return (seat - after + SEAT_COUNT) % SEAT_COUNT || SEAT_COUNT;
}
export function nextFreeSeat(occupied: ReadonlySet<number>): number {
  return SEAT_PREFERENCE.find((seat) => !occupied.has(seat)) ?? -1;
}
