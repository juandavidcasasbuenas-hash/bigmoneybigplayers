// Oversized public cards have their own lane; held cards keep their grip scale.
export const BOARD_CARD_SCALE = 1.1;
export const BOARD_CARD_SPACING = 0.61;
export const BOARD_Z = -0.48;

/** Keep the pot beside the board when portrait showdowns turn the table view. */
export function tablePotPosition(point: readonly number[], angle: number): [number, number, number] {
  return [point[0] * Math.cos(angle) + (point[2] - BOARD_Z) * Math.sin(angle), point[1], point[2] * Math.cos(angle) - point[0] * Math.sin(angle)];
}
