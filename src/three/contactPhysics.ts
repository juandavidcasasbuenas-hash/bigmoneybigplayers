import { Quaternion, TorusGeometry, Vector3 } from "three";
import type * as Rapier from "@dimforge/rapier3d-compat";

let rapier: typeof Rapier | undefined;
let world: Rapier.World | undefined;
let colliders: Rapier.Collider[] = [];
let loading: Promise<void> | undefined;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 },
  UP = new Vector3(0, 1, 0);
/** One shared WASM query world, loaded once. No duplicate physics world per avatar. */
export function loadContactPhysics() {
  return (loading ||= import("@dimforge/rapier3d-compat").then(
    async (module) => {
      await module.init();
      rapier = module;
      world = new module.World({ x: 0, y: -9.81, z: 0 });
      const rail = new TorusGeometry(2.39, 0.175, 10, 64);
      rail.rotateX(Math.PI / 2);
      rail.scale(1.635, 1, 1);
      rail.translate(0, 1.37, 0);
      colliders.push(
        world.createCollider(
          module.ColliderDesc.trimesh(
            new Float32Array(rail.attributes.position.array),
            new Uint32Array(rail.index!.array),
          ),
        ),
      );
      rail.dispose();
      const points: number[] = [];
      for (const y of [1.31, 1.37])
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          points.push(Math.cos(a) * 3.84, y, Math.sin(a) * 2.22);
        }
      const felt = module.ColliderDesc.convexHull(new Float32Array(points));
      if (felt) colliders.push(world.createCollider(felt));
    },
  ));
}
export const contactPhysicsReady = () => !!world;
export function physicsLimbClearance(
  start: Vector3,
  end: Vector3,
  radius: number,
) {
  if (!rapier || !world) return undefined;
  const delta = end.clone().sub(start),
    length = delta.length();
  const shape = new rapier.Capsule(
    Math.max(0.005, (length - radius * 1.3) / 2),
    radius,
  );
  const center = start.clone().lerp(end, 0.5),
    rotation = new Quaternion().setFromUnitVectors(UP, delta.normalize());
  let clearance = 0.03;
  for (const collider of colliders) {
    const contact = collider.contactShape(shape, center, rotation, 0.03);
    if (contact) clearance = Math.min(clearance, contact.distance);
  }
  return clearance;
}
export function physicsChairClearance(
  start: Vector3,
  end: Vector3,
  radius: number,
  chairZ: number,
) {
  if (!rapier) return undefined;
  const direction = end.clone().sub(start),
    shape = new rapier.Capsule(
      Math.max(0.005, (direction.length() - radius * 1.3) / 2),
      radius,
    );
  const position = start.clone().lerp(end, 0.5),
    rotation = new Quaternion().setFromUnitVectors(UP, direction.normalize());
  const seat = new rapier.Cuboid(0.56, 0.07752, 0.475);
  return (
    seat.contactShape(
      { x: 0, y: 0.65664, z: -0.08 + chairZ },
      IDENTITY,
      shape,
      position,
      rotation,
      0.5,
    )?.distance ?? 0.5
  );
}
