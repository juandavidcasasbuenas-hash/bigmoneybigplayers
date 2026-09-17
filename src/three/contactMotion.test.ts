import { beforeAll, describe, expect, it } from "vitest";
import { Box3, Quaternion, Vector3 } from "three";
import {
  DEAL,
  dealDuration,
  dealReleaseAt,
  holePickupAt,
} from "../../shared/dealTiming";
import type { TableMotion } from "../../shared/tableTimeline";
import {
  actorContact,
  BODY,
  cardInHand,
  composePose,
  dealtCard,
  dealerHandAt,
  dealerRightHand,
  DEALER_ROOT,
  FELT_Y,
  foldedCard,
  foldHand,
  FOLD_RELEASE,
  holeRestHand,
  seatTransform,
  seatedStance,
  solveArm,
  solveTwoBone,
  workZ,
  wristJoint,
} from "./contactMotion";
import { chipTrick, TRICK_CHIP_SCALE } from "./contactTricks";

import { loadContactPhysics, physicsChairClearance } from "./contactPhysics";
beforeAll(() => loadContactPhysics());
const distanceToBox = (point: Vector3, box: Box3) =>
  box.clampPoint(point, new Vector3()).distanceTo(point);
describe("contact rig", () => {
  it("keeps limb lengths fixed even for unreachable and singular targets", () => {
    for (const target of [
      new Vector3(),
      new Vector3(0, -20, 0),
      new Vector3(0, -0.5, 0),
      new Vector3(0, 0.93, 0),
      new Vector3(0.4, 0.1, 0.5),
    ]) {
      const result = solveTwoBone(
        new Vector3(),
        target,
        new Vector3(0, -1, 0),
        0.46,
        0.5,
      );
      expect(result.root.distanceTo(result.joint)).toBeCloseTo(0.46, 6);
      expect(result.joint.distanceTo(result.end)).toBeCloseTo(0.5, 6);
      expect(result.joint.toArray().every(Number.isFinite)).toBe(true);
    }
  });
  it("keeps thighs clear of the cushion and calves in front of it while sitting and standing", () => {
    let worst = Infinity,
      physicalGap = Infinity;
    for (let i = 0; i <= 100; i++) {
      const stance = seatedStance(i / 100);
      const cushion = new Box3(
        new Vector3(-0.56, 0.58, -0.555 + stance.chairZ),
        new Vector3(0.56, 0.7342, 0.395 + stance.chairZ),
      );
      expect(stance.hip.y - 0.15).toBeGreaterThanOrEqual(0.7342);
      for (const leg of stance.legs) {
        expect(leg.root.distanceTo(leg.joint)).toBeCloseTo(BODY.thigh, 6);
        expect(leg.joint.distanceTo(leg.end)).toBeCloseTo(BODY.shin, 6);
        expect(Math.abs(leg.end.y - 0.16)).toBeLessThan(0.0003);
        for (const [a, b, r] of [
          [leg.root, leg.joint, 0.126],
          [leg.joint, leg.end, 0.098],
        ] as const) {
          physicalGap = Math.min(
            physicalGap,
            physicsChairClearance(a, b, r, stance.chairZ)!,
          );
          for (let j = 0; j <= 25; j++)
            worst = Math.min(
              worst,
              distanceToBox(a.clone().lerp(b, j / 25), cushion) - r,
            );
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(-0.003);
    expect(physicalGap).toBeGreaterThanOrEqual(-0.003);
  });
  it("reaches every action contact at all 12 seats without stretching or crossing the padded rail", () => {
    let worstError = 0,
      worstGap = Infinity,
      context = "";
    for (let seat = 0; seat < 12; seat++)
      for (const type of ["idle", "bet", "check", "fold", "award"] as const)
        for (let frame = 0; frame <= 24; frame++) {
          const p = frame / 25,
            activity =
              type === "idle"
                ? undefined
                : ({
                    type,
                    amount: 500,
                    to: 500,
                    forced: false,
                  } as TableMotion);
          const contact = actorContact({
            p,
            activity,
            z: workZ(seat),
            now: 20000,
            cardsReadyAt: 0,
            hasCards: true,
            standing: 0,
          });
          const q = new Quaternion().setFromAxisAngle(
            new Vector3(1, 0, 0),
            contact.lean,
          );
          for (const [side, hand] of [
            [-1, contact.left],
            [1, contact.right],
          ] as const) {
            const shoulder = new Vector3(side * 0.44, 1.7 - BODY.hipY, 0.125)
              .applyQuaternion(q)
              .add(seatedStance(0).hip);
            const arm = solveArm(shoulder, wristJoint(hand), side, seat);
            worstError = Math.max(worstError, arm.error);
            if (arm.clearance < worstGap) {
              worstGap = arm.clearance;
              context = `${seat}/${type}/${p}/${side}`;
            }
          }
        }
    expect(worstError).toBeLessThan(0.002);
    expect(worstGap, context).toBeGreaterThanOrEqual(-0.008);
  }, 20000);
  it("hands cards over continuously from dealer to felt, then into the same player grip", () => {
    for (let count = 2; count <= 12; count++)
      for (let i = 0; i < count * 2; i++) {
        const seat = i % count,
          z = workZ(seat),
          release = dealReleaseAt(i);
        const before = dealtCard(release - 0.001, i, seat, count, z),
          after = dealtCard(release, i, seat, count, z);
        expect(before.position.distanceTo(after.position)).toBeLessThan(0.0001);
        const dealerGrip = composePose(
          DEALER_ROOT,
          cardInHand(dealerRightHand(1), 0),
        );
        expect(after.position.distanceTo(dealerGrip.position)).toBeLessThan(
          1e-7,
        );
        const landed = dealtCard(release + DEAL.flight, i, seat, count, z);
        const pickup = composePose(
          seatTransform(seat),
          cardInHand(holeRestHand(z), Math.floor(i / count)),
        );
        expect(landed.position.distanceTo(pickup.position)).toBeLessThan(1e-7);
        expect(landed.quaternion.angleTo(pickup.quaternion)).toBeLessThan(1e-7);
        expect(landed.position.y).toBeGreaterThan(FELT_Y);
        expect(holePickupAt(count, seat)).toBeGreaterThanOrEqual(
          dealReleaseAt(count + seat) + DEAL.flight,
        );
        expect(dealDuration(count)).toBeGreaterThanOrEqual(
          holePickupAt(count, seat) + DEAL.pickup,
        );
        const hand = dealerHandAt(release, count * 2);
        expect(
          hand.position.distanceTo(dealerRightHand(1).position),
        ).toBeLessThan(1e-7);
      }
  });
  it("releases folded cards from the fingers and slides them flat without a jump", () => {
    for (let seat = 0; seat < 12; seat++)
      for (let index = 0; index < 2; index++) {
        const z = workZ(seat),
          release = foldedCard(FOLD_RELEASE, z, seat, index);
        const grip = cardInHand(foldHand(FOLD_RELEASE, z), index);
        expect(release.position.distanceTo(grip.position)).toBeLessThan(1e-8);
        expect(
          foldedCard(FOLD_RELEASE + 1e-6, z, seat, index).position.distanceTo(
            release.position,
          ),
        ).toBeLessThan(0.0001);
        for (let p = FOLD_RELEASE; p <= 1; p += 0.025) {
          const card = foldedCard(p, z, seat, index);
          expect(
            Math.abs(new Vector3(0, 1, 0).applyQuaternion(card.quaternion).y),
          ).toBeCloseTo(1, 5);
          expect(card.position.y).toBeGreaterThan(FELT_Y + 0.004);
        }
      }
  });
  it("catches the airborne chip at the hand and interleaves chip stacks without intersections", () => {
    const z = workZ(0);
    for (const moment of [0.18, 0.34, 0.38, 0.74, 0.8, 0.96]) {
      const before = chipTrick(moment - 1e-6, 2, z),
        after = chipTrick(moment + 1e-6, 2, z);
      expect(
        before.chips[3].position.distanceTo(after.chips[3].position),
      ).toBeLessThan(0.001);
    }
    const flying = chipTrick(0.56, 2, z);
    expect(flying.airborne).toBe(true);
    expect(flying.chips[3].position.y - flying.hand.position.y).toBeGreaterThan(
      0.3,
    );
    for (let i = 0; i <= 100; i++) {
      const chips = chipTrick(i / 100, 0, z).chips;
      for (let a = 0; a < 8; a++)
        for (let b = a + 1; b < 8; b++) {
          const dx = Math.hypot(
              chips[a].position.x - chips[b].position.x,
              chips[a].position.z - chips[b].position.z,
            ),
            dy = Math.abs(chips[a].position.y - chips[b].position.y);
          expect(
            dx >= 0.145 * TRICK_CHIP_SCALE * 2 - 0.001 ||
              dy >= 0.05 * TRICK_CHIP_SCALE - 0.001,
          ).toBe(true);
        }
    }
  });
});
