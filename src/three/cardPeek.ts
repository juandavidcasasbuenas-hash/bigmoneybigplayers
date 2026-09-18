import { MathUtils, Quaternion, Vector3 } from 'three';
import { blendPose, FELT_Y, holeCardRest, pose, restingHand, seatTransform, smooth, workZ, worldToSeat } from './contactMotion';

export const PEEK_CARD_WIDTH = 0.38;
export const PEEK_CARD_HEIGHT = 0.54;
export const PEEK_MAX_CURL = 2.35;

/** The far fifth stays on the felt; the near edge curls up into the thumb. */
export function peekCardSurface(x: number, along: number, amount: number) {
  const length = PEEK_CARD_HEIGHT, flat = length * 0.2;
  const s = MathUtils.clamp(along, 0, 1) * length;
  const curl = MathUtils.clamp(amount, 0, 1) * PEEK_MAX_CURL;
  const angle = s <= flat ? 0 : curl * (s - flat) / (length - flat);
  const radius = curl > 0.000001 ? (length - flat) / curl : 0;
  return {
    position: new Vector3(x, radius * (1 - Math.cos(angle)), length / 2 - (s <= flat || !radius ? s : flat + radius * Math.sin(angle))),
    normal: new Vector3(0, -Math.cos(angle), -Math.sin(angle)),
    angle,
  };
}

export function privateCardOrigin(seat: number) {
  return new Vector3(0, FELT_Y + 0.015, workZ(seat) + 0.32);
}
export function privateCardTransform(index: number) {
  return {
    position: new Vector3(index === 0 ? 0.175 : -0.175, index * 0.004, index * -0.016),
    rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), index === 0 ? 0.10 : -0.10),
  };
}
export function peekHandPose(index: number, amount: number) {
  const side = index === 0 ? 1 : -1;
  const card = privateCardTransform(index);
  const edge = peekCardSurface(side * PEEK_CARD_WIDTH * (0.47 + 0.03 * amount), 1 - 0.27 * amount, amount);
  // The fingers pinch the curling corner; the wrist stays comfortably above the
  // rail instead of rotating through the entire bend and stretching the arm.
  const rotation = card.rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 2.48 - amount * 0.81));
  const thumbTip = new Vector3(side * -0.075, 0.065, 0.055);
  const contact = edge.position.applyQuaternion(card.rotation).add(card.position);
  return { position: contact.clone().sub(thumbTip.clone().applyQuaternion(rotation)), rotation, contact, thumbTip };
}
export function tablePeekHand(seat: number, index: number, curl: number) {
  const hand = peekHandPose(index, curl);
  return {position: hand.position.add(privateCardOrigin(seat)), quaternion: hand.rotation};
}
export function restingCardHand(seat: number, side: number) {
  const result = tablePeekHand(seat, side > 0 ? 0 : 1, 0);
  result.position.x += side * 0.055;
  result.position.y += 0.055;
  result.position.z -= 0.04;
  return result;
}
/** Both hands slide the cards together, then release them toward the muck. */
export function foldTableCard(p: number, seat: number, index: number) {
  const rest = holeCardRest(workZ(seat), index);
  const release = {position: rest.position.clone().add(new Vector3(0, 0, 0.18)), quaternion: rest.quaternion};
  if (p <= 0.43) return blendPose(rest, release, smooth(p, 0.18, 0.43));
  const end = pose(worldToSeat(new Vector3(-0.62 + index * 0.07, FELT_Y + 0.015 + index * 0.006, -1.27), seat).toArray() as [number, number, number]);
  end.quaternion.copy(rest.quaternion).premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.35));
  const t = MathUtils.clamp((p - 0.43) / 0.47, 0, 1);
  return blendPose(release, end, 1 - (1 - t) ** 2);
}
export function foldTableHand(p: number, seat: number, side: number) {
  const index = side > 0 ? 0 : 1;
  const grip = tablePeekHand(seat, index, 0);
  const rest = restingCardHand(seat, side);
  if (p < 0.18) return blendPose(rest, grip, smooth(p, 0, 0.18));
  grip.position.z += 0.18 * smooth(p, 0.18, 0.43);
  if (p <= 0.43) return grip;
  const recovery = blendPose(grip, restingHand(side), smooth(p, 0.48, 1));
  recovery.position.y += Math.sin(smooth(p, 0.43, 1) * Math.PI) * 0.15;
  return recovery;
}
export function privateCardLookTarget(seat: number) {
  const root = seatTransform(seat);
  return privateCardOrigin(seat).add(new Vector3(0, 0.14, -0.03)).applyQuaternion(root.quaternion).add(root.position);
}
