import {
  Bone,
  BufferGeometry,
  MathUtils,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from "three";
import { CCDIKSolver } from "three/addons/animation/CCDIKSolver.js";

const UP = new Vector3(0, 1, 0);
/** Adapter to Three's maintained bone solver. The cartoon meshes can later be replaced with a skinned GLB. */
class LimbSolver {
  readonly shoulder = new Bone();
  readonly elbow = new Bone();
  readonly effector = new Bone();
  readonly target = new Bone();
  readonly carrier = new SkinnedMesh(
    new BufferGeometry(),
    new MeshBasicMaterial(),
  );
  readonly solver: CCDIKSolver;
  constructor(
    readonly a: number,
    readonly b: number,
  ) {
    this.shoulder.name = "upper";
    this.elbow.name = "lower";
    this.effector.name = "tip";
    this.target.name = "goal";
    this.carrier.add(this.shoulder, this.target);
    this.shoulder.add(this.elbow);
    this.elbow.add(this.effector);
    this.elbow.position.y = a;
    this.effector.position.y = b;
    this.carrier.bind(
      new Skeleton([this.target, this.shoulder, this.elbow, this.effector]),
    );
    this.solver = new CCDIKSolver(this.carrier, [
      {
        target: 0,
        effector: 3,
        links: [{ index: 2 }, { index: 1 }],
        iteration: 128,
      },
    ]);
  }
  solve(root: Vector3, target: Vector3, pole: Vector3) {
    const direction = target.clone().sub(root),
      requested = direction.length();
    if (requested < 1e-8) direction.set(0, -1, 0);
    else direction.divideScalar(requested);
    const distance = MathUtils.clamp(
      requested,
      Math.abs(this.a - this.b) + 1e-5,
      this.a + this.b - 1e-5,
    );
    const goal = root.clone().addScaledVector(direction, distance);
    const bend = pole.clone().sub(root);
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 1e-8) {
      bend.set(
        Math.abs(direction.x) < 0.8 ? 1 : 0,
        Math.abs(direction.x) < 0.8 ? 0 : 1,
        0,
      );
      bend.addScaledVector(direction, -bend.dot(direction));
    }
    // A bent rest pose supplies the pole plane; CCD performs the actual joint solve.
    const upperDirection = direction
      .clone()
      .multiplyScalar(0.85)
      .addScaledVector(bend.normalize(), 0.45)
      .normalize();
    this.shoulder.position.copy(root);
    this.shoulder.quaternion.setFromUnitVectors(UP, upperDirection);
    const initialElbow = root.clone().addScaledVector(upperDirection, this.a);
    const lowerQ = new Quaternion().setFromUnitVectors(
      UP,
      goal.clone().sub(initialElbow).normalize(),
    );
    this.elbow.quaternion
      .copy(this.shoulder.quaternion)
      .invert()
      .multiply(lowerQ);
    this.target.position.copy(goal);
    this.carrier.updateMatrixWorld(true);
    this.solver.update();
    // CCD converges more slowly near a straight knee. Refine the cached solution so
    // planted feet do not drift; this work is paid once per quantized reach.
    const tip = new Vector3();
    for (
      let refinement = 0;
      refinement < 7 &&
      this.effector.getWorldPosition(tip).distanceToSquared(goal) > 1e-10;
      refinement++
    )
      this.solver.update();
    const joint = this.elbow.getWorldPosition(new Vector3()),
      end = this.effector.getWorldPosition(new Vector3());
    return { root, joint, end, error: end.distanceTo(target) };
  }
}
const solvers = new Map<string, LimbSolver>();
const solutions = new Map<string, { joint: Vector3; end: Vector3 }>();
export function solveTwoBone(
  root: Vector3,
  target: Vector3,
  pole: Vector3,
  a: number,
  b: number,
) {
  const direction = target.clone().sub(root),
    requested = direction.length();
  if (requested < 1e-8) direction.set(0, -1, 0);
  else direction.divideScalar(requested);
  const reach = MathUtils.clamp(
    requested,
    Math.abs(a - b) + 1e-5,
    a + b - 1e-5,
  );
  // A limb's solution depends on reach and its bend plane, not its place in the room.
  // Cache CCD's canonical solution to 0.2 mm; rotating it avoids solving 26 limbs every frame.
  const distance = MathUtils.clamp(
    Math.round(reach * 5000) / 5000,
    Math.abs(a - b) + 1e-5,
    a + b - 1e-5,
  );
  const key = `${a}/${b}`,
    sampleKey = `${key}/${distance}`;
  let sample = solutions.get(sampleKey);
  if (!sample) {
    let solver = solvers.get(key);
    if (!solver) {
      solver = new LimbSolver(a, b);
      solvers.set(key, solver);
    }
    sample = solver.solve(
      new Vector3(),
      new Vector3(0, -distance, 0),
      new Vector3(0, 0, 1),
    );
    solutions.set(sampleKey, sample);
  }
  const bend = pole.clone().sub(root);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(
      Math.abs(direction.x) < 0.8 ? 1 : 0,
      Math.abs(direction.x) < 0.8 ? 0 : 1,
      0,
    );
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const joint = root
    .clone()
    .addScaledVector(direction, -sample.joint.y)
    .addScaledVector(bend, sample.joint.z);
  const end = root
    .clone()
    .addScaledVector(direction, -sample.end.y)
    .addScaledVector(bend, sample.end.z);
  return { root, joint, end, error: end.distanceTo(target) };
}
