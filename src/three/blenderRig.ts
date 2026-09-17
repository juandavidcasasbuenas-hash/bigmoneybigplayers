import { Bone, Object3D, Quaternion, Vector3 } from "three";

export interface BlenderPose {
  hip: Vector3;
  rotation: Quaternion;
  arms: { root: Vector3; joint: Vector3; end: Vector3 }[];
  legs: { root: Vector3; joint: Vector3; end: Vector3 }[];
}
const REST_HIP = new Vector3(0, 0.895, -0.07);
const SEGMENTS: Record<
  string,
  ["arms" | "legs", number, "root" | "joint", "joint" | "end"]
> = {
  upperarm_r: ["arms", 0, "root", "joint"],
  lowerarm_r: ["arms", 0, "joint", "end"],
  upperarm_l: ["arms", 1, "root", "joint"],
  lowerarm_l: ["arms", 1, "joint", "end"],
  thigh_r: ["legs", 0, "root", "joint"],
  calf_r: ["legs", 0, "joint", "end"],
  thigh_l: ["legs", 1, "root", "joint"],
  calf_l: ["legs", 1, "joint", "end"],
};
const ENDS: Record<string, ["arms" | "legs", number]> = {
  hand_r: ["arms", 0],
  hand_l: ["arms", 1],
  foot_r: ["legs", 0],
  foot_l: ["legs", 1],
};
const TORSO = new Set([
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "clavicle_r",
  "clavicle_l",
  "neck_01",
  "Head",
]);

/** Bind in asset space before parenting the instance under a player seat. */
export function createBlenderPoseDriver(object: Object3D) {
  object.updateMatrixWorld(true);
  const bones: {
    bone: Bone;
    position: Vector3;
    rotation: Quaternion;
    direction: Vector3;
  }[] = [];
  object.traverse((n) => {
    if (
      !(n instanceof Bone) ||
      !(TORSO.has(n.name) || SEGMENTS[n.name] || ENDS[n.name])
    )
      return;
    const position = n.getWorldPosition(new Vector3());
    const childName = n.name
      .replace("upperarm", "lowerarm")
      .replace("lowerarm", n.name.startsWith("lowerarm") ? "hand" : "lowerarm")
      .replace("thigh", "calf")
      .replace("calf", n.name.startsWith("calf") ? "foot" : "calf");
    const child = object.getObjectByName(childName);
    const direction =
      child && child !== n
        ? child.getWorldPosition(new Vector3()).sub(position).normalize()
        : new Vector3(0, 1, 0);
    bones.push({
      bone: n,
      position,
      rotation: n.getWorldQuaternion(new Quaternion()),
      direction,
    });
  });
  const scratch = {
    p: new Vector3(),
    d: new Vector3(),
    q: new Quaternion(),
    worldQ: new Quaternion(),
    parentQ: new Quaternion(),
  };
  return (value: BlenderPose) => {
    object.updateWorldMatrix(true, true);
    const frame = object.parent;
    if (!frame) return;
    frame.getWorldQuaternion(scratch.worldQ);
    for (const { bone, position, rotation, direction } of bones) {
      const segment = SEGMENTS[bone.name],
        end = ENDS[bone.name];
      if (segment) {
        const [limbs, i, a, b] = segment,
          limb = value[limbs][i];
        scratch.p.copy(limb[a]);
        scratch.d.copy(limb[b]).sub(limb[a]).normalize();
        scratch.q.setFromUnitVectors(direction, scratch.d).multiply(rotation);
      } else if (end) {
        const [limbs, i] = end,
          limb = value[limbs][i];
        scratch.p.copy(limb.end);
        const upstream = bones.find(
          (b) =>
            b.bone.name ===
            bone.name.replace("hand", "lowerarm").replace("foot", "calf"),
        )!;
        scratch.d.copy(limb.end).sub(limb.joint).normalize();
        scratch.q
          .setFromUnitVectors(upstream.direction, scratch.d)
          .multiply(rotation);
      } else {
        scratch.p
          .copy(position)
          .sub(REST_HIP)
          .applyQuaternion(value.rotation)
          .add(value.hip);
        scratch.q.copy(value.rotation).multiply(rotation);
      }
      scratch.p.applyMatrix4(frame.matrixWorld);
      scratch.q.premultiply(scratch.worldQ);
      bone.parent!.updateWorldMatrix(true, false);
      bone.parent!.worldToLocal(scratch.p);
      bone.parent!.getWorldQuaternion(scratch.parentQ).invert();
      bone.position.copy(scratch.p);
      bone.quaternion.copy(scratch.parentQ).multiply(scratch.q);
      bone.updateWorldMatrix(false, false);
    }
  };
}
