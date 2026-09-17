import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  SkinnedMesh,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CHARACTERS, DEALER_CHARACTER } from "../data/characters";
import { createBlenderPoseDriver } from "./blenderRig";
import {
  actorContact,
  BODY,
  seatedStance,
  solveArm,
  wristJoint,
} from "./contactMotion";

type AssetJson = {
  images?: { bufferView: number; mimeType: string }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
};

function imageDimensions(content: Buffer, mimeType: string) {
  if (mimeType === "image/png")
    return [content.readUInt32BE(16), content.readUInt32BE(20)];
  // JPEG SOF markers carry dimensions without decoding pixels in Node.
  for (let offset = 2; offset + 9 < content.length;) {
    expect(content[offset]).toBe(0xff);
    const marker = content[offset + 1];
    const length = content.readUInt16BE(offset + 2);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    )
      return [
        content.readUInt16BE(offset + 7),
        content.readUInt16BE(offset + 5),
      ];
    if (marker === 0xda || length < 2) break;
    offset += length + 2;
  }
  throw new Error("Embedded texture has no readable dimensions");
}

async function loadAsset(name: string) {
  const bytes = await readFile(
    new URL(`../../public/models/tripo/${name}.glb`, import.meta.url),
  );
  expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.toString("utf8", 20, 20 + jsonLength),
  ) as AssetJson;
  const binaryOffset = 20 + jsonLength + 8;
  const images = (json.images ?? []).map((image) => {
    const view = json.bufferViews[image.bufferView];
    const start = binaryOffset + (view.byteOffset ?? 0);
    const content = bytes.subarray(start, start + view.byteLength);
    expect(content.length).toBe(view.byteLength);
    expect(content.length).toBeGreaterThan(4096);
    if (image.mimeType === "image/jpeg") {
      expect(content.readUInt16BE(0)).toBe(0xffd8);
      expect(content.readUInt16BE(content.length - 2)).toBe(0xffd9);
    } else {
      expect(image.mimeType).toBe("image/png");
      expect(content.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
    const dimensions = imageDimensions(content, image.mimeType);
    expect(Math.min(...dimensions)).toBeGreaterThanOrEqual(512);
    // Nine source models with 4K maps would overwhelm a browser GPU. Only the
    // editable source assets retain that resolution; live faces cap maps at 2K.
    expect(Math.max(...dimensions)).toBeLessThanOrEqual(2048);
    return image;
  });
  // Node does not decode browser image resources. Validate their actual embedded
  // bytes above and supply Texture objects through the loader's public plugin
  // API, preserving material/UV assignments while testing exported geometry.
  const loader = new GLTFLoader().register((parser) => ({
    name: "ValidatedEmbeddedTextures",
    loadTexture(index: number) {
      const definition = parser.json.textures[index];
      expect(images[definition.source]).toBeDefined();
      const texture = new Texture();
      texture.userData.sourceImage = definition.source;
      return Promise.resolve(texture);
    },
  }));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

function meshNamed(
  scene: { getObjectByName(name: string): unknown },
  name: string,
) {
  const mesh = scene.getObjectByName(name);
  expect(mesh).toBeInstanceOf(Mesh);
  return mesh as Mesh;
}

function bounds(mesh: Mesh) {
  const box = new Box3();
  const point = new Vector3();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
    box.expandByPoint(mesh.localToWorld(mesh.getVertexPosition(i, point)));
  return box;
}

function surfaceArea(mesh: Mesh) {
  const index = mesh.geometry.index;
  const count = index?.count ?? mesh.geometry.attributes.position.count;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    mesh.getVertexPosition(index ? index.getX(i) : i, a);
    mesh.getVertexPosition(index ? index.getX(i + 1) : i + 1, b);
    mesh.getVertexPosition(index ? index.getX(i + 2) : i + 2, c);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

describe.each([...CHARACTERS, DEALER_CHARACTER])(
  "$name’s Blender-prepared Tripo asset",
  (character) => {
    const id = character.id;
    it("keeps the adapted body on its contact targets through sitting, rising and standing", async () => {
      expect(character.model?.body).toBe(`/models/tripo/${id}-body.glb`);
      const { scene } = await loadAsset(`${id}-body`);
      const drive = createBlenderPoseDriver(scene);
      const seat = new Group();
      seat.position.set(-2.8, 0, 3.1);
      seat.rotation.y = -1.3;
      seat.add(scene);
      let skinnedMeshes = 0;
      scene.traverse((object) => {
        if (!(object instanceof SkinnedMesh)) return;
        skinnedMeshes++;
        expect(object.skeleton.bones.length).toBeGreaterThan(12);
        const weights = object.geometry.attributes.skinWeight;
        let validWeights = true,
          maxWeightError = 0;
        for (let i = 0; i < weights.count; i++) {
          const channels = [
            weights.getX(i),
            weights.getY(i),
            weights.getZ(i),
            weights.getW(i),
          ];
          validWeights &&= channels.every((n) => Number.isFinite(n) && n >= 0);
          maxWeightError = Math.max(
            maxWeightError,
            Math.abs(channels.reduce((sum, n) => sum + n, 0) - 1),
          );
        }
        expect(validWeights).toBe(true);
        expect(maxWeightError).toBeLessThan(0.00005);
      });
      expect(skinnedMeshes).toBeGreaterThan(0);
      for (const standing of [0, 0.5, 1]) {
        const stance = seatedStance(standing);
        const rotation = new Quaternion().setFromAxisAngle(
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
        seat.updateMatrixWorld(true);
        for (const [i, side] of ["r", "l"].entries()) {
          for (const [name, target] of [
            [`hand_${side}`, arms[i].end],
            [`calf_${side}`, stance.legs[i].joint],
            [`foot_${side}`, stance.legs[i].end],
          ] as const) {
            const joint = scene.getObjectByName(name)!;
            expect(joint).toBeDefined();
            const position = seat.worldToLocal(
              joint.getWorldPosition(new Vector3()),
            );
            expect(position.distanceTo(target)).toBeLessThan(0.00001);
          }
        }
        scene.traverse((object) => {
          if (!(object instanceof SkinnedMesh)) return;
          object.skeleton.update();
          for (
            let i = 0;
            i < object.geometry.attributes.position.count;
            i += 17
          ) {
            const vertex = object.getVertexPosition(i, new Vector3());
            expect(vertex.toArray().every(Number.isFinite)).toBe(true);
            expect(vertex.length()).toBeLessThan(5);
          }
        });
      }
    });
    it("preserves the source textures, UVs and provenance within the head triangle budget", async () => {
      expect(character.model?.head).toBe(`/models/tripo/${id}-head.glb`);
      const { scene } = await loadAsset(`${id}-head`);
      const face = meshNamed(scene, "Face");
      expect(face.userData.model_pipeline).toBe(
        "Tripo H3.1 / Blender prepared",
      );
      expect(face.userData.source_file).toBe(`${id}-original.glb`);
      const material = face.material as MeshStandardMaterial;
      expect(material.map).toBeInstanceOf(Texture);
      expect(material.normalMap).toBeInstanceOf(Texture);
      const uv = face.geometry.attributes.uv;
      expect(uv.count).toBe(face.geometry.attributes.position.count);
      const uvRange = new Box3();
      let finiteUvs = true;
      for (let i = 0; i < uv.count; i++) {
        finiteUvs &&=
          Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i));
        uvRange.expandByPoint(new Vector3(uv.getX(i), uv.getY(i), 0));
      }
      expect(finiteUvs).toBe(true);
      expect(uvRange.getSize(new Vector3()).x).toBeGreaterThan(0.25);
      expect(uvRange.getSize(new Vector3()).y).toBeGreaterThan(0.25);
      let triangles = 0;
      scene.traverse((object) => {
        if (object instanceof Mesh)
          triangles +=
            (object.geometry.index?.count ??
              object.geometry.attributes.position.count) / 3;
      });
      expect(triangles).toBeGreaterThan(10000);
      expect(triangles).toBeLessThan(45000);
    });

    it("ships functional speech and gaze morphs with finite geometry at extreme expressions", async () => {
      const { scene } = await loadAsset(`${id}-head`);
      const face = meshNamed(scene, "Face");
      const dictionary = face.morphTargetDictionary!;
      expect(Object.keys(dictionary)).toEqual(
        expect.arrayContaining([
          "Smile",
          "JawOpen",
          "Blink",
          "BrowUp",
          "Frown",
          "LookLeft",
          "LookRight",
          "LookDown",
        ]),
      );
      expect(face.morphTargetInfluences?.every((value) => value === 0)).toBe(
        true,
      );
      const count = face.geometry.attributes.position.count;
      const rest = Array.from({ length: count }, (_, i) =>
        face.getVertexPosition(i, new Vector3()),
      );
      for (const name of Object.keys(dictionary)) {
        face.morphTargetInfluences!.fill(0);
        face.morphTargetInfluences![dictionary[name]] = 1;
        let largestMotion = 0,
          movedVertices = 0,
          largestRadius = 0,
          finiteVertices = true;
        const point = new Vector3();
        for (let i = 0; i < count; i++) {
          face.getVertexPosition(i, point);
          finiteVertices &&=
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            Number.isFinite(point.z);
          largestRadius = Math.max(largestRadius, point.length());
          const distance = point.distanceTo(rest[i]);
          largestMotion = Math.max(largestMotion, distance);
          if (distance > 0.001) movedVertices++;
        }
        expect(finiteVertices).toBe(true);
        expect(largestRadius).toBeLessThan(3);
        expect(
          largestMotion,
          `${name} must actually deform the sculpt`,
        ).toBeGreaterThan(0.005);
        expect(largestMotion).toBeLessThan(0.2);
        expect(movedVertices).toBeGreaterThan(20);
        if (name === "JawOpen") expect(largestMotion).toBeGreaterThan(0.025);
      }
      // Speech, expression and blinking are allowed to overlap in the live game.
      face.morphTargetInfluences!.fill(0);
      for (const [name, amount] of [
        ["Smile", 0.8],
        ["JawOpen", 0.85],
        ["Blink", 1],
        ["BrowUp", 0.3],
      ] as const)
        face.morphTargetInfluences![dictionary[name]] = amount;
      const combined = bounds(face);
      expect(
        [...combined.min.toArray(), ...combined.max.toArray()].every(
          Number.isFinite,
        ),
      ).toBe(true);
      expect(combined.getSize(new Vector3()).length()).toBeLessThan(3);
    });

    it("keeps visible facial surfaces facing the camera across imported UV seams", async () => {
      const { scene } = await loadAsset(`${id}-head`);
      const face = meshNamed(scene, "Face");
      const box = bounds(face),
        size = box.getSize(new Vector3());
      const probe = new Mesh(
        face.geometry,
        new MeshBasicMaterial({ side: DoubleSide }),
      );
      probe.matrix.copy(face.matrixWorld);
      probe.matrixAutoUpdate = false;
      probe.updateMatrixWorld(true);
      const ray = new Raycaster();
      ray.ray.direction.set(0, 0, -1);
      let visible = 0,
        reversed = 0;
      // Recalculating normals on disconnected UV islands once reversed broad
      // cheek/forehead patches. Double-sided probes detect the actual winding
      // instead of allowing backface culling to hide those missing surfaces.
      for (let row = 1; row < 14; row++) {
        for (let column = 1; column < 14; column++) {
          ray.ray.origin.set(
            box.min.x + (size.x * column) / 14,
            box.min.y + (size.y * row) / 14,
            box.max.z + 1,
          );
          const hit = ray.intersectObject(probe, false)[0];
          if (!hit?.face) continue;
          visible++;
          if (
            hit.face.normal.clone().transformDirection(probe.matrixWorld).z <
            -0.01
          )
            reversed++;
        }
      }
      probe.material.dispose();
      expect(visible).toBeGreaterThan(75);
      expect(
        reversed / visible,
        `${id}: ${reversed}/${visible} visible surfaces face inward`,
      ).toBeLessThan(0.04);
    });

    it("clones speech and eyelid weights independently for players using the same character", async () => {
      const { scene } = await loadAsset(`${id}-head`);
      const first = scene.clone(true),
        second = scene.clone(true);
      for (const name of [
        "Face",
        "Upper_lid_L",
        "Upper_lid_R",
        "Lower_lid_L",
        "Lower_lid_R",
      ]) {
        const original = meshNamed(scene, name);
        const a = meshNamed(first, name),
          b = meshNamed(second, name);
        const expression = name === "Face" ? "JawOpen" : "Blink";
        const index = a.morphTargetDictionary![expression];
        a.morphTargetInfluences![index] = 0.85;
        expect(b.morphTargetInfluences![index]).toBe(0);
        expect(original.morphTargetInfluences![index]).toBe(0);
        expect(a.morphTargetInfluences).not.toBe(b.morphTargetInfluences);
      }
    });

    it("closes real paired eyelid surfaces and reveals the crease only through Blink", async () => {
      const { scene } = await loadAsset(`${id}-head`);
      for (const side of ["L", "R"]) {
        const upper = meshNamed(scene, `Upper_lid_${side}`);
        const lower = meshNamed(scene, `Lower_lid_${side}`);
        for (const lid of [upper, lower]) {
          expect(Object.keys(lid.morphTargetDictionary!)).toEqual(["Blink"]);
          expect(lid.morphTargetInfluences).toEqual([0]);
          const openArea = surfaceArea(lid);
          lid.morphTargetInfluences![lid.morphTargetDictionary!.Blink] = 1;
          const closedArea = surfaceArea(lid);
          expect(closedArea).toBeGreaterThan(0.01);
          expect(openArea).toBeLessThan(closedArea * 0.001);
        }
        expect(bounds(upper).min.y).toBeCloseTo(bounds(lower).max.y, 3);
      }
      for (const name of ["Closed_lid_line_0", "Closed_lid_line_1"]) {
        const crease = meshNamed(scene, name);
        expect(Object.keys(crease.morphTargetDictionary!)).toEqual(["Blink"]);
        expect(crease.morphTargetInfluences).toEqual([0]);
        const hidden = bounds(crease).getCenter(new Vector3());
        crease.morphTargetInfluences![crease.morphTargetDictionary!.Blink] = 1;
        const shown = bounds(crease).getCenter(new Vector3());
        expect(shown.z - hidden.z).toBeGreaterThan(0.02);
        expect(surfaceArea(crease)).toBeGreaterThan(0.0001);
      }
    });
  },
);
