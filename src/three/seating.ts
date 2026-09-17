type XYZ = [number, number, number];
export function seatPosition(
  index: number,
  _count: number,
): { position: XYZ; rotation: XYZ } {
  // Reserve the centre of the far rail for the house dealer. A player seat
  // never moves when another player busts, disconnects, or joins the rail.
  const slot = (Math.max(0, index) % 12) + 1;
  const angle = (slot * Math.PI * 2) / 13 - Math.PI / 2;
  const nx = Math.cos(angle) / 3.62,
    nz = Math.sin(angle) / 2.215;
  const length = Math.hypot(nx, nz);
  // Face the local rail normal, so every player has the same reachable work area.
  const x = Math.cos(angle) * 3.62 + (nx / length) * 0.8;
  const z = Math.sin(angle) * 2.215 + (nz / length) * 0.8;
  return { position: [x, 0, z], rotation: [0, Math.atan2(-nx, -nz), 0] };
}
