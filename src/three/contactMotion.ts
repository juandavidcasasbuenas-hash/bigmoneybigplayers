import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { TableMotion } from "../../shared/tableTimeline";
import { DEAL, dealReleaseAt } from "../../shared/dealTiming";
import { seatPosition } from "./seating";
import { solveTwoBone } from "./limbIK";
import { physicsLimbClearance } from "./contactPhysics";
export { solveTwoBone } from "./limbIK";

export type XYZ = [number, number, number];
export type ContactPose = { position: Vector3; quaternion: Quaternion };
export const FELT_Y = 1.37;
export const CARD_SCALE = 0.62;
export const CHAIR = { seatY: 0.65, seatTop: 0.735, front: 0.395, back: -0.52 };
export const BODY = {
  hipY: 0.895,
  hipZ: -0.07,
  upperArm: 0.46,
  forearm: 0.5,
  thigh: Math.hypot(0.025, 0.66),
  shin: Math.hypot(0.71, 0.07),
};
export const smooth = (p: number, from = 0, to = 1) =>
  MathUtils.smoothstep(p, from, to);
export const pose = (p: XYZ, r: XYZ = [0, 0, 0]): ContactPose => ({
  position: new Vector3(...p),
  quaternion: new Quaternion().setFromEuler(new Euler(...r)),
});
export function blendPose(
  a: ContactPose,
  b: ContactPose,
  t: number,
): ContactPose {
  return {
    position: a.position.clone().lerp(b.position, t),
    quaternion: a.quaternion.clone().slerp(b.quaternion, t),
  };
}
export function composePose(
  parent: ContactPose,
  child: ContactPose,
): ContactPose {
  return {
    position: child.position
      .clone()
      .applyQuaternion(parent.quaternion)
      .add(parent.position),
    quaternion: parent.quaternion.clone().multiply(child.quaternion),
  };
}
export function seatTransform(seat: number) {
  const { position, rotation } = seatPosition(seat, 12);
  return pose(position, rotation);
}
export function worldToSeat(point: Vector3, seat: number) {
  const root = seatTransform(seat);
  return point
    .clone()
    .sub(root.position)
    .applyQuaternion(root.quaternion.invert());
}

/** The hand lane is tangent to the rail. Keep objects inside the oval, including their radius. */
export function workZ(seat: number) {
  const root = seatTransform(seat);
  for (let z = 0.7; z < 1.5; z += 0.01) {
    if (
      [-0.46, 0.46].every((x) => {
        const p = new Vector3(x, 0, z)
          .applyQuaternion(root.quaternion)
          .add(root.position);
        return (p.x / 3.55) ** 2 + (p.z / 2.145) ** 2 <= 1;
      })
    )
      return z;
  }
  return 1.2;
}

export function tableSurfaceY(point: Vector3) {
  const radius = Math.hypot(point.x / 1.635, point.z);
  const fromRail = Math.abs(radius - 2.39);
  if (fromRail < 0.175) return 1.37 + Math.sqrt(0.175 ** 2 - fromRail ** 2);
  return radius < 2.215 ? FELT_Y : -Infinity;
}
export function armClearance(
  arm: ReturnType<typeof solveTwoBone>,
  seat: number | "dealer",
) {
  const transform = seat === "dealer" ? DEALER_ROOT : seatTransform(seat);
  const start = arm.root
    .clone()
    .applyQuaternion(transform.quaternion)
    .add(transform.position);
  const joint = arm.joint
    .clone()
    .applyQuaternion(transform.quaternion)
    .add(transform.position);
  const end = arm.end
    .clone()
    .applyQuaternion(transform.quaternion)
    .add(transform.position);
  const upperGap = physicsLimbClearance(start, joint, 0.12),
    lowerGap = physicsLimbClearance(joint, end, 0.08);
  if (upperGap !== undefined && lowerGap !== undefined)
    return Math.min(upperGap, lowerGap);
  let minimum = Infinity;
  for (const [start, end, baseRadius] of [
    [arm.root, arm.joint, 0.12],
    [arm.joint, arm.end, 0.095],
  ] as const) {
    for (let i = 0; i <= 12; i++) {
      const radius =
        baseRadius === 0.095 ? baseRadius - (i / 12) * 0.018 : baseRadius;
      const point = start
        .clone()
        .lerp(end, i / 12)
        .applyQuaternion(transform.quaternion)
        .add(transform.position);
      // Sample the lower hemisphere, including its horizontal reach over the rail's curved edge.
      for (const [x, z, y] of [
        [0, 0, 1],
        [0.6, 0, 0.8],
        [-0.6, 0, 0.8],
        [0, 0.6, 0.8],
        [0, -0.6, 0.8],
      ]) {
        const floor = tableSurfaceY(
          new Vector3(point.x + x * radius, point.y, point.z + z * radius),
        );
        minimum = Math.min(minimum, point.y - y * radius - floor);
      }
    }
  }
  return minimum;
}
/** Select the lowest comfortable elbow bend that clears the actual curved, padded rail. */
export function solveArm(
  root: Vector3,
  target: Vector3,
  side: number,
  seat: number | "dealer",
) {
  let best: ReturnType<typeof solveTwoBone> | undefined,
    bestGap = -Infinity;
  for (let lift = -0.4; lift <= 0.61; lift += 0.1) {
    const result = solveTwoBone(
      root,
      target,
      root.clone().add(new Vector3(side * 0.55, lift, 0.25)),
      BODY.upperArm,
      BODY.forearm,
    );
    const gap = armClearance(result, seat);
    if (gap > bestGap) {
      best = result;
      bestGap = gap;
    }
    if (gap >= 0.008) return { ...result, clearance: gap };
  }
  return { ...best!, clearance: bestGap };
}

export function seatedStance(standing: number) {
  const rise = smooth(standing, 0.2, 1) * 0.63;
  const hip = new Vector3(
    0,
    BODY.hipY + rise,
    BODY.hipZ + smooth(standing, 0.15, 0.85) * 0.3,
  );
  const ankleZ = 0.66 - smooth(standing, 0, 0.3) * 0.34;
  return {
    hip,
    rise,
    chairZ: -smooth(standing, 0, 0.65) * 0.36,
    lean: Math.sin(standing * Math.PI) * 0.17,
    legs: [-1, 1].map((side) =>
      solveTwoBone(
        hip.clone().add(new Vector3(side * 0.245, 0, 0)),
        new Vector3(side * 0.245, 0.16, ankleZ),
        new Vector3(side * 0.245, 0.85, 1.8),
        BODY.thigh,
        BODY.shin,
      ),
    ),
  };
}
export const restingHand = (side: number) =>
  pose(
    [side < 0 ? -0.28 : 0.39, side < 0 ? 1.595 : 1.63, side < 0 ? 1.0 : 0.8],
    side < 0 ? [-0.12, -0.04, 0.08] : [Math.PI / 2, 0, -0.08],
  );
export const holeRestHand = (z: number) =>
  pose([-0.28, FELT_Y + 0.051, z + 0.05], [Math.PI / 2, 0, 0]);
export function wristJoint(hand: ContactPose) {
  return new Vector3(0, -0.105, -0.025)
    .applyQuaternion(hand.quaternion)
    .add(hand.position);
}

/** Two actual thick cards, pinched near their lower edges. The same transforms are used on the felt. */
export function cardInHand(hand: ContactPose, index: number) {
  const card = pose([(index - 0.5) * 0.058, 0.205, 0.041 - index * 0.01]);
  card.quaternion
    .setFromAxisAngle(new Vector3(0, 0, 1), (index - 0.5) * -0.13)
    .multiply(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
    );
  return composePose(hand, card);
}
export const betChips = (p: number, z: number, forced = false) =>
  new Vector3(
    0.325,
    FELT_Y + 0.003,
    z - 0.035 + smooth(p, forced ? 0 : 0.27, 0.68) * 0.36,
  );
// A four-chip cut represents the public amount, rather than spawning a giant cylinder for a large bet.
export const betChipCount = (_amount: number) => 4;
export function betHand(p: number, z: number, count = 4) {
  const chips = betChips(p, z);
  const contact = pose(
    [chips.x, FELT_Y + count * 0.022 + 0.098, chips.z - 0.17],
    [2.2, 0, 0],
  );
  const hold = smooth(p, 0, 0.23) * (1 - smooth(p, 0.72, 1));
  const result = blendPose(restingHand(1), contact, hold);
  // Lift on approach/recovery; the push itself stays at the contact height.
  result.position.y +=
    Math.sin(smooth(p, 0, 0.23) * Math.PI) * 0.1 +
    Math.sin(smooth(p, 0.72, 1) * Math.PI) * 0.09;
  return result;
}
export const FOLD_RELEASE = 0.43;
export function foldHand(p: number, z: number) {
  const release = pose([-0.2, FELT_Y + 0.051, z + 0.1], [Math.PI / 2, 0, 0]);
  const reach = blendPose(restingHand(-1), release, smooth(p, 0, FOLD_RELEASE));
  reach.position.y += Math.sin(smooth(p, 0, FOLD_RELEASE) * Math.PI) * 0.12;
  if (p <= FOLD_RELEASE) return reach;
  const lifted = pose([-0.2, 1.75, z + 0.1], [Math.PI / 2, 0, 0]);
  return p < 0.67
    ? blendPose(release, lifted, smooth(p, 0.48, 0.67))
    : blendPose(lifted, restingHand(-1), smooth(p, 0.67, 1));
}
export function foldedCard(p: number, z: number, seat: number, index: number) {
  const release = cardInHand(foldHand(FOLD_RELEASE, z), index);
  if (p <= FOLD_RELEASE) return cardInHand(foldHand(p, z), index);
  const end = pose(
    worldToSeat(
      new Vector3(-0.62 + index * 0.07, FELT_Y + 0.014 + index * 0.006, -1.27),
      seat,
    ).toArray() as XYZ,
    [0, 0.3 + index * 0.13, 0],
  );
  end.quaternion
    .copy(release.quaternion)
    .premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.35));
  // Friction gives the released cards a decelerating slide. No position discontinuity at release.
  const progress = MathUtils.clamp(
    (p - FOLD_RELEASE) / (0.9 - FOLD_RELEASE),
    0,
    1,
  );
  return blendPose(release, end, 1 - (1 - progress) ** 2);
}

export const DEALER_ROOT = pose([0, 0, -3.08]);
export const dealerLeftHand = () =>
  pose([-0.25, 1.65, 0.64], [Math.PI / 2, Math.PI, 0]);
export function dealerRightHand(phase: number, faceUp = false) {
  const take = pose([-0.2, 1.77, 0.62], [Math.PI / 2, 0, 0]);
  const release = pose(
    [0.22, 1.62, 0.84],
    [faceUp ? -Math.PI / 2 : Math.PI / 2, 0, -0.1],
  );
  return blendPose(take, release, smooth(phase));
}
export function dealerHandAt(
  elapsed: number,
  total: number,
  first: number = DEAL.first,
  interval: number = DEAL.interval,
  faceUp = false,
) {
  const index = Math.floor((elapsed - first + 180) / interval);
  if (index < 0)
    return blendPose(
      restingHand(1),
      dealerRightHand(0),
      smooth(elapsed, first - 380, first - 180),
    );
  const lastRelease = first + (total - 1) * interval;
  if (elapsed >= lastRelease)
    return blendPose(
      dealerRightHand(1, faceUp),
      restingHand(1),
      smooth(elapsed, lastRelease, lastRelease + 320),
    );
  const phase = MathUtils.clamp(
    (elapsed - (first + index * interval - 180)) / 180,
    0,
    1,
  );
  // Recover during the gap between cards, without teleporting the wrist back to the deck.
  const gap = elapsed - (first + index * interval);
  return gap <= 0
    ? dealerRightHand(phase, faceUp)
    : blendPose(
        dealerRightHand(1, faceUp),
        dealerRightHand(0),
        smooth(gap, 0, interval - 180),
      );
}
export function dealtCard(
  elapsed: number,
  index: number,
  seat: number,
  count: number,
  z: number,
) {
  const releaseAt = dealReleaseAt(index);
  const end = composePose(
    seatTransform(seat),
    cardInHand(holeRestHand(z), Math.floor(index / count)),
  );
  if (elapsed < releaseAt)
    return composePose(
      DEALER_ROOT,
      cardInHand(
        dealerRightHand(
          MathUtils.clamp((elapsed - releaseAt + 180) / 180, 0, 1),
        ),
        0,
      ),
    );
  const start = composePose(DEALER_ROOT, cardInHand(dealerRightHand(1), 0));
  const p = MathUtils.clamp((elapsed - releaseAt) / DEAL.flight, 0, 1);
  const result = blendPose(start, end, 1 - (1 - p) ** 2);
  result.position.y =
    MathUtils.lerp(start.position.y, end.position.y, p) +
    0.12 * 4 * p * (1 - p);
  return result;
}

export type HandMode =
  | "cards"
  | "rest"
  | "push"
  | "check"
  | "open"
  | "riffle"
  | "roll"
  | "toss"
  | "cheers";
export function actorContact({
  p,
  activity,
  z,
  now,
  cardsReadyAt,
  hasCards,
  standing,
  emote,
  peek = 0,
}: {
  p: number;
  activity?: TableMotion;
  z: number;
  now: number;
  cardsReadyAt: number;
  hasCards: boolean;
  standing: number;
  emote?: string;
  peek?: number;
}) {
  let left = restingHand(-1),
    right = restingHand(1);
  let leftMode: HandMode = hasCards ? "cards" : "rest",
    rightMode: HandMode = "rest";
  let lean = 0.08;
  const action = p >= 0 && p < 1;
  const hold = smooth(p, 0, 0.2) * (1 - smooth(p, 0.75, 1));
  if (action && activity?.type === "bet" && !activity.forced) {
    right = betHand(p, z, betChipCount(activity.amount));
    rightMode = "push";
    lean += hold * 0.15;
  } else if (action && activity?.type === "fold") {
    left = foldHand(p, z);
    leftMode = p < FOLD_RELEASE ? "cards" : "open";
    lean += hold * 0.14;
  } else if (action && activity?.type === "check") {
    const tap = pose([0.36, FELT_Y + 0.121, z + 0.18], [Math.PI / 2, 0, 0]);
    right = blendPose(right, tap, hold);
    rightMode = "check";
    lean += hold * 0.1;
    right.position.y +=
      Math.abs(Math.sin(smooth(p, 0.25, 0.58) * Math.PI * 2)) * 0.065;
  } else if (action && activity?.type === "award") {
    const gather = smooth(p, 0.45, 0.83);
    right = blendPose(
      right,
      pose([0.34, 1.556, z + 0.13 - gather * 0.26], [2.2, 0, 0]),
      hold,
    );
    rightMode = "push";
    lean += hold * 0.17;
  } else if (
    !activity &&
    cardsReadyAt &&
    now >= cardsReadyAt - 380 &&
    now < cardsReadyAt + DEAL.pickup
  ) {
    const pickup = holeRestHand(z);
    left =
      now < cardsReadyAt
        ? blendPose(left, pickup, smooth(now, cardsReadyAt - 380, cardsReadyAt))
        : blendPose(
            pickup,
            left,
            smooth(now, cardsReadyAt, cardsReadyAt + DEAL.pickup),
          );
    left.position.y +=
      Math.sin(smooth(now, cardsReadyAt - 380, cardsReadyAt) * Math.PI) * 0.12;
    lean +=
      0.16 *
      smooth(now, cardsReadyAt - 380, cardsReadyAt) *
      (1 - smooth(now, cardsReadyAt + 150, cardsReadyAt + DEAL.pickup));
  } else {
    left.position.y += peek * 0.09;
    left.quaternion.slerp(pose([0, 0, 0], [-0.32, 0, 0.06]).quaternion, peek);
  }
  if (!action && !standing) {
    if (emote === "cheers") {
      right = pose([0.52, 2.02, 0.53], [0, 0, -0.4]);
      rightMode = "cheers";
    }
    if (emote === "shush") {
      right = pose([0.1, 1.93, 0.69], [0, 0, -0.07]);
      rightMode = "check";
    }
    if (emote === "bluff") {
      right = pose([0.5, 1.82, 0.64], [0.3, 0, -0.55]);
      rightMode = "open";
    }
    if (emote === "laugh" || emote === "celebrate") {
      right = pose([0.64, 1.99, 0.3], [0, 0, -0.55]);
      rightMode = "open";
    }
    if (emote === "cry") {
      right = pose([0.43, 2.03, 0.62], [-0.2, 0, -0.25]);
      rightMode = "open";
    }
  }
  if (standing > 0) {
    const stance = seatedStance(standing);
    const raised = new Vector3(0, stance.rise * 0.95, stance.hip.z - BODY.hipZ);
    left.position.add(raised);
    right.position.add(raised);
    left.position.z -= standing * 0.12;
    right.position.z -= standing * 0.07;
    lean = MathUtils.lerp(lean, stance.lean, standing);
  }
  return {
    left,
    right,
    leftMode: leftMode as HandMode,
    rightMode: rightMode as HandMode,
    lean,
  };
}
