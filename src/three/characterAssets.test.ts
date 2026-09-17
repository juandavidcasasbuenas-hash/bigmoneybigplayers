import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import {
  BackSide,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  SkinnedMesh,
  Vector3,
  Quaternion,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { CHARACTERS } from "../data/characters";
import { createBlenderPoseDriver } from "./blenderRig";
import {
  actorContact,
  BODY,
  seatedStance,
  solveArm,
  wristJoint,
} from "./contactMotion";
async function load(id: string): Promise<GLTF> {
  const bytes = await readFile(
    new URL(`../../public/models/club/${id}.glb`, import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
}

/** Includes the current morph pose, unlike a cached geometry bounding box. */
function posedBounds(mesh: Mesh) {
  const box = new Box3();
  const point = new Vector3();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
    box.expandByPoint(mesh.localToWorld(mesh.getVertexPosition(i, point)));
  return box;
}

describe("shipped Blender characters", () => {
  for (const id of [...CHARACTERS.map((c) => c.id), "dealer"]) {
    it(`${id} ships native colour and independently animated facial shapes`, async () => {
      const gltf = await load(id);
      const face = gltf.scene.getObjectByName("Face") as Mesh;
      expect(face).toBeInstanceOf(Mesh);
      expect(Object.keys(face.morphTargetDictionary!)).toEqual(
        expect.arrayContaining(["Smile", "JawOpen", "BrowUp", "Frown"]),
      );
      expect(face.morphTargetInfluences?.every((n) => n === 0)).toBe(true);
      const colors = face.geometry.getAttribute("color");
      expect(colors).toBeDefined();
      const low = [1, 1, 1],
        high = [0, 0, 0];
      for (let i = 0; i < colors.count; i++) {
        [colors.getX(i), colors.getY(i), colors.getZ(i)].forEach(
          (channel, j) => {
            low[j] = Math.min(low[j], channel);
            high[j] = Math.max(high[j], channel);
          },
        );
      }
      // A warm complexion may blush mainly through green/blue changes; colour
      // variation should not depend on a particular character's red channel.
      expect(
        Math.max(...high.map((channel, j) => channel - low[j])),
      ).toBeGreaterThan(0.01);
      expect(Math.min(...low)).toBeLessThan(0.8); // Detect the old white COLOR_0 export regression.
      const eye = gltf.scene.getObjectByName("Eye_white_L") as Mesh;
      expect(eye.morphTargetDictionary?.Blink).toBeTypeOf("number");
      expect(gltf.parser.json.images || []).toHaveLength(0);

      // Two players may select the same character. Their speech and blinking
      // must animate distinct weight arrays even though the meshes share data.
      const first = gltf.scene.clone(true);
      const second = gltf.scene.clone(true);
      first.updateMatrixWorld(true);
      const firstFace = first.getObjectByName("Face") as Mesh;
      const secondFace = second.getObjectByName("Face") as Mesh;
      const jaw = firstFace.morphTargetDictionary!.JawOpen;
      const closed = posedBounds(firstFace);
      firstFace.morphTargetInfluences![jaw] = 0.8;
      expect(posedBounds(firstFace).min.y).toBeLessThan(closed.min.y - 0.015);
      expect(secondFace.morphTargetInfluences![jaw]).toBe(0);
      expect(face.morphTargetInfluences![jaw]).toBe(0);
      const firstEye = first.getObjectByName("Eye_white_L") as Mesh;
      const secondEye = second.getObjectByName("Eye_white_L") as Mesh;
      const open = posedBounds(firstEye);
      const blink = firstEye.morphTargetDictionary!.Blink;
      firstEye.morphTargetInfluences![blink] = 1;
      const shut = posedBounds(firstEye);
      expect(shut.getSize(new Vector3()).y).toBeLessThan(
        open.getSize(new Vector3()).y * 0.06,
      );
      expect(shut.getCenter(new Vector3()).y).toBeCloseTo(
        open.getCenter(new Vector3()).y,
        4,
      );
      expect(secondEye.morphTargetInfluences![blink]).toBe(0);
      expect(eye.morphTargetInfluences![blink]).toBe(0);
    });

    it(`${id} has outward-facing cartoon eyes and small surface-bound pupils`, async () => {
      const { scene } = await load(id);
      scene.updateMatrixWorld(true);
      for (const side of ["L", "R"]) {
        const eye = scene.getObjectByName(`Eye_white_${side}`) as Mesh;
        const pupil = scene.getObjectByName(`Pupil_${side}`) as Mesh;
        expect(eye).toBeInstanceOf(Mesh);
        expect(pupil).toBeInstanceOf(Mesh);
        const eyeSize = posedBounds(eye).getSize(new Vector3());
        const pupilSize = posedBounds(pupil).getSize(new Vector3());
        expect(pupilSize.x / eyeSize.x).toBeGreaterThan(0.1);
        expect(pupilSize.x / eyeSize.x).toBeLessThan(0.25);
        expect(pupilSize.y / eyeSize.y).toBeGreaterThan(0.1);
        expect(pupilSize.y / eyeSize.y).toBeLessThan(0.25);
        const pupilMaterial = pupil.material as MeshStandardMaterial;
        expect(pupilMaterial.map).toBeNull();
        expect(Math.max(...pupilMaterial.color.toArray())).toBeLessThan(0.08);

        const surface = pupil.userData.eye_surface;
        expect(surface.center).toHaveLength(3);
        expect(surface.radii).toHaveLength(3);
        expect(surface.slope).toHaveLength(2);
        expect(
          [...surface.center, ...surface.radii, ...surface.slope].every(
            Number.isFinite,
          ),
        ).toBe(true);
        expect(surface.radii.every((n: number) => n > 0)).toBe(true);
        expect(surface.radii[0] * 2).toBeCloseTo(eyeSize.x, 4);
        expect(surface.radii[1] * 2).toBeCloseTo(eyeSize.y, 4);
        expect(pupil.userData.eye_center_y).toBeCloseTo(0.055, 5);
        expect(surface.center[1]).toBeCloseTo(pupil.userData.eye_center_y, 5);

        // A visible material cannot repair inward triangle winding. Check the
        // actual exported surface, including the outer rings around the pupil.
        const position = eye.geometry.attributes.position;
        const index = eye.geometry.index;
        const a = new Vector3(),
          b = new Vector3(),
          c = new Vector3();
        const edge = new Vector3(),
          normal = new Vector3();
        let frontArea = 0,
          totalArea = 0;
        const vertexCount = index?.count ?? position.count;
        for (let i = 0; i < vertexCount; i += 3) {
          a.fromBufferAttribute(
            position,
            index ? index.getX(i) : i,
          ).applyMatrix4(eye.matrixWorld);
          b.fromBufferAttribute(
            position,
            index ? index.getX(i + 1) : i + 1,
          ).applyMatrix4(eye.matrixWorld);
          c.fromBufferAttribute(
            position,
            index ? index.getX(i + 2) : i + 2,
          ).applyMatrix4(eye.matrixWorld);
          normal.crossVectors(edge.subVectors(b, a), c.sub(a));
          const area = normal.length();
          totalArea += area;
          if (normal.z > 0) frontArea += area;
        }
        expect(totalArea).toBeGreaterThan(0.01);
        expect(frontArea / totalArea).toBeGreaterThan(0.99);
        const eyeMaterials = Array.isArray(eye.material)
          ? eye.material
          : [eye.material];
        expect(eyeMaterials.every((m) => m.side !== BackSide)).toBe(true);
        const ray = new Raycaster(
          new Vector3(surface.center[0], surface.center[1], 2),
          new Vector3(0, 0, -1),
        );
        expect(ray.intersectObject(eye, false).length).toBeGreaterThan(0);
      }
    });
  }
  it("keeps the exported wrist and knee joints on the interaction targets in transformed seats", async () => {
    const { scene } = await load("body");
    const drive = createBlenderPoseDriver(scene);
    const seat = new Group();
    seat.position.set(3.6, 0, -1.2);
    seat.rotation.y = 1.9;
    seat.add(scene);
    for (const standing of [0, 0.5, 1]) {
      const stance = seatedStance(standing),
        rotation = new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          0.12,
        );
      const contact = actorContact({
        p: -1,
        z: 1.04,
        now: 20000,
        cardsReadyAt: 0,
        hasCards: true,
        standing,
      });
      const arms = [-1, 1].map((side, i) =>
        solveArm(
          new Vector3(side * 0.44, 1.7 - BODY.hipY, 0.125)
            .applyQuaternion(rotation)
            .add(stance.hip),
          wristJoint(i === 0 ? contact.left : contact.right),
          side,
          5,
        ),
      );
      drive({ hip: stance.hip, rotation, arms, legs: stance.legs });
      // Match the renderer's update, including SkinnedMesh.bindMatrixInverse.
      seat.updateMatrixWorld(true);
      for (const [i, suffix] of ["r", "l"].entries()) {
        for (const [bone, p] of [
          [`hand_${suffix}`, arms[i].end],
          [`calf_${suffix}`, stance.legs[i].joint],
          [`foot_${suffix}`, stance.legs[i].end],
        ] as const) {
          const actual = scene
            .getObjectByName(bone)!
            .getWorldPosition(new Vector3());
          expect(seat.worldToLocal(actual).distanceTo(p)).toBeLessThan(0.00001);
        }
      }
      scene.traverse((n) => {
        if (!(n instanceof SkinnedMesh)) return;
        n.skeleton.update();
        for (let i = 0; i < n.geometry.attributes.position.count; i += 97) {
          const p = n.getVertexPosition(i, new Vector3());
          expect(p.toArray().every(Number.isFinite)).toBe(true);
          expect(p.length()).toBeLessThan(5);
        }
      });
    }
  });
  it("keeps the number panel and lettering fitted to Doug’s helmet shell", async () => {
    const { scene } = await load("doug");
    scene.updateMatrixWorld(true);
    const shell = scene.getObjectByName("Helmet_shell") as Mesh;
    expect(shell).toBeInstanceOf(Mesh);
    const ray = new Raycaster();
    ray.ray.direction.set(0, 0, -1);
    for (const name of ["Helmet_number_panel", "Helmet_number"]) {
      const mesh = scene.getObjectByName(name) as Mesh;
      expect(mesh).toBeInstanceOf(Mesh);
      const attr = mesh.geometry.attributes.position;
      // Spread samples over the full panel/text tessellation; raycasting every
      // bevel duplicate adds seconds without covering a new part of the badge.
      const step = Math.max(1, Math.floor(attr.count / 128));
      for (let i = 0; i < attr.count; i += step) {
        const p = new Vector3()
          .fromBufferAttribute(attr, i)
          .applyMatrix4(mesh.matrixWorld);
        ray.ray.origin.copy(p);
        ray.ray.origin.z += 0.1;
        const hit = ray.intersectObject(shell, false)[0];
        expect(hit).toBeDefined();
        expect(p.z - hit.point.z).toBeGreaterThan(0);
        expect(p.z - hit.point.z).toBeLessThan(0.006);
      }
    }
  });
});
