import { MathUtils, Vector3 } from "three";
import {
  blendPose,
  composePose,
  FELT_Y,
  pose,
  restingHand,
  smooth,
  type ContactPose,
} from "./contactMotion";

export const TRICK_MS = 3100;
export const TRICK_CHIP_SCALE = 0.44;
const thickness = 0.05 * TRICK_CHIP_SCALE;
export function chipRest(index: number, z: number) {
  return pose([
    0.4 + (index < 4 ? -0.075 : 0.075),
    FELT_Y + 0.003 + thickness * ((index % 4) + 0.5),
    z - 0.035,
  ]);
}

/** Props live in seat space. The airborne chip is deliberately independent of the wrist. */
export function chipTrick(progress: number, variant: number, z: number) {
  const p = MathUtils.clamp(progress, 0, 1);
  const chips = Array.from({ length: 8 }, (_, i) => chipRest(i, z));
  if (variant === 0) {
    const reach = smooth(p, 0, 0.18) * (1 - smooth(p, 0.85, 1));
    const hand = blendPose(
      restingHand(1),
      pose([0.4, FELT_Y + 0.25, z - 0.16], [1.05, 0, 0]),
      reach,
    );
    // Lift to alternating vertical slots BEFORE the columns interleave.
    const spread = smooth(p, 0.2, 0.36) * (1 - smooth(p, 0.75, 0.85));
    const merge = smooth(p, 0.38, 0.58) * (1 - smooth(p, 0.65, 0.74));
    chips.forEach((chip, i) => {
      const side = i < 4 ? -1 : 1,
        row = i % 4;
      chip.position.x = 0.4 + side * 0.075 * (1 - merge);
      chip.position.y += spread * thickness * (row + (side > 0 ? 1 : 0));
    });
    return {
      hand,
      chips,
      airborne: false,
      contact: reach > 0.95,
      curl: 0.65 + merge * 0.22,
    };
  }
  const restChip = chips[3];
  const offset = new Vector3(0, 0.1, 0.085);
  const pickup = pose([0, 0, 0], [Math.PI / 2, 0, 0]);
  pickup.position
    .copy(restChip.position)
    .sub(offset.clone().applyQuaternion(pickup.quaternion));
  const work =
    variant === 1
      ? pose([0.4, 1.67, 0.69], [Math.PI / 2, 0, 0])
      : pose([0.4, 1.72, 0.68], [Math.PI / 2, Math.PI, 0]);
  let hand =
    p < 0.18
      ? blendPose(restingHand(1), pickup, smooth(p, 0, 0.18))
      : p < 0.34
        ? blendPose(pickup, work, smooth(p, 0.18, 0.34))
        : p < 0.8
          ? work
          : p < 0.96
            ? blendPose(work, pickup, smooth(p, 0.8, 0.96))
            : blendPose(pickup, restingHand(1), smooth(p, 0.96, 1));
  const held = p >= 0.18 && p < 0.96;
  let airborne = false;
  if (held) {
    const manipulation = smooth(p, 0.18, 0.34) * (1 - smooth(p, 0.8, 0.96));
    if (variant === 1) {
      const roll = smooth(p, 0.34, 0.8);
      const local = pose(
        [
          Math.sin(roll * Math.PI * 2) * 0.084 * manipulation,
          0.1,
          MathUtils.lerp(0.085, -0.112, manipulation),
        ],
        [(Math.PI / 2) * (1 - manipulation), roll * Math.PI * 2, 0],
      );
      chips[3] = composePose(hand, local);
    } else {
      // Thumb flick, a fixed ballistic arc, then fingers close at the exact catch point.
      const local = pose(offset.toArray() as [number, number, number], [
        Math.PI / 2,
        0,
        0,
      ]);
      chips[3] = composePose(hand, local);
      if (p >= 0.38 && p <= 0.74) {
        const u = (p - 0.38) / 0.36;
        const launch = composePose(work, local);
        const seconds = (0.36 * TRICK_MS) / 1000;
        const gravity = 3.8;
        const time = u * seconds;
        chips[3] = launch;
        chips[3].position.y +=
          (gravity * seconds * time) / 2 - (gravity * time * time) / 2;
        chips[3].quaternion.multiply(
          pose([0, 0, 0], [u * Math.PI * 4, 0, 0]).quaternion,
        );
        // The hand follows through and drops away; it does not drag the flying chip.
        hand = blendPose(
          work,
          pose([0.47, 1.6, 0.66], [Math.PI / 2, Math.PI, -0.12]),
          Math.sin(u * Math.PI) * 0.85,
        );
        airborne = p > 0.38 && p < 0.74;
      }
    }
  }
  return {
    hand,
    chips,
    airborne,
    contact: held && !airborne,
    curl: variant === 1 ? 0.15 : p > 0.74 && p < 0.81 ? 1.1 : 0.22,
  };
}
