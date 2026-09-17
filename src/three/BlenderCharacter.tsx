import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CharacterDefinition } from "../data/characters";
import { createBlenderPoseDriver, type BlenderPose } from "./blenderRig";
export type { BlenderPose } from "./blenderRig";
import { voiceLevel } from "../audio/tableAudio";
import { cardPeekProgress, type CardPeek } from '../../shared/cardPeek';

type EyeSurface = {
  center: [number, number, number];
  radii: [number, number, number];
  slope: [number, number];
};

type AnimatedPupil = {
  object: Object3D;
  position: Vector3;
  scale: Vector3;
  centerY: number;
  surface?: EyeSurface;
  surfaceOffset: number;
};

function eyeSurfaceDepth(surface: EyeSurface, x: number, y: number) {
  const [cx, cy, cz] = surface.center;
  const [rx, ry, rz] = surface.radii;
  const dx = x - cx;
  const dy = y - cy;
  return (
    cz +
    dx * surface.slope[0] +
    dy * surface.slope[1] +
    rz * (Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2 - (dy / ry) ** 2)) - 1)
  );
}

/** The Blender skeleton follows the same constrained wrist/knee targets as the props. */
export function BlenderBody({
  character: c,
  pose,
}: {
  character: CharacterDefinition;
  pose: MutableRefObject<BlenderPose | null>;
}) {
  const { scene } = useGLTF(c.model?.body || "/models/club/body.glb");
  const instance = useMemo(() => {
    const object = clone(scene);
    const materials: MeshStandardMaterial[] = [];
    const colors: Record<string, string | Color> = {
      Shirt: c.shirt,
      Trousers: new Color(c.shirt).lerp(new Color("#263b34"), 0.7),
      Skin: c.skin,
      [`${c.id}_skin`]: c.skin,
      Cuff: c.undershirt,
      Undershirt: c.undershirt,
      Lapel: new Color(c.shirt).multiplyScalar(1.12),
      Seam: new Color(c.shirt).multiplyScalar(0.7),
      Hood: c.shirt,
      Collar: ["doug", "tian", "humfrey"].includes(c.id)
        ? c.shirt
        : c.undershirt,
    };
    object.traverse((n) => {
      if (!(n instanceof Mesh)) return;
      if (n.name.startsWith("Hood_")) n.visible = c.id === "doug";
      if (n.name.startsWith("Dealer_bow")) n.visible = c.id === "dealer";
      if (
        ["doug", "tian", "humfrey"].includes(c.id) &&
        /^(Lapel|Jacket_seam|Brass_button|Shirt_front)/.test(n.name)
      )
        n.visible = false;
      n.castShadow = n.receiveShadow = true;
      // The arms can extend beyond the original T-pose bounds.
      n.frustumCulled = false;
      const wasArray = Array.isArray(n.material);
      const mapped = (
        wasArray
          ? (n.material as MeshStandardMaterial[])
          : [n.material as MeshStandardMaterial]
      ).map((m) => {
        const mat = (m as MeshStandardMaterial).clone();
        if (colors[m.name]) mat.color.set(colors[m.name]);
        materials.push(mat);
        return mat;
      });
      n.material = wasArray ? mapped : mapped[0];
    });
    return { object, drive: createBlenderPoseDriver(object), materials };
  }, [scene, c]);
  useEffect(
    () => () => instance.materials.forEach((m) => m.dispose()),
    [instance],
  );
  useFrame(() => {
    if (pose.current) instance.drive(pose.current);
  }, -1.5);
  return <primitive object={instance.object} dispose={null} />;
}

export function BlenderHead({
  character: c,
  actorKey,
  seed = 0,
  emote,
  attention = 0,
  active = false,
  peek,
  effectNow,
}: {
  character: CharacterDefinition;
  actorKey?: string;
  seed?: number;
  emote?: string;
  attention?: number;
  active?: boolean;
  peek?: CardPeek | null;
  effectNow?: number;
}) {
  const { scene } = useGLTF(c.model?.head || `/models/club/${c.id}.glb`);
  const root = useRef<Group>(null);
  const instance = useMemo(() => {
    const object = scene.clone(true);
    const morphs: Mesh[] = [],
      eyes: AnimatedPupil[] = [],
      brows: { object: Object3D; position: Vector3 }[] = [];
    object.traverse((n) => {
      if (n instanceof Mesh) {
        n.castShadow = true;
        // Dense generated facial surfaces self-shadow into visible triangles
        // under the table's small shadow map. Keep their smooth material light.
        n.receiveShadow = !c.model;
        if (n.morphTargetInfluences) morphs.push(n);
      }
      if (n.userData.eye_side) {
        const surface = n.userData.eye_surface as EyeSurface | undefined;
        eyes.push({
          object: n,
          position: n.position.clone(),
          scale: n.scale.clone(),
          centerY: n.userData.eye_center_y ?? n.position.y,
          surface,
          surfaceOffset: surface
            ? n.position.z -
              eyeSurfaceDepth(surface, n.position.x, n.position.y)
            : 0,
        });
      }
      if (n.userData.brow_side)
        brows.push({ object: n, position: n.position.clone() });
    });
    return {
      object,
      morphs,
      eyes,
      brows,
      face: object.getObjectByName("Face") as Mesh | undefined,
      gaze: { x: 0, y: 0 },
    };
  }, [scene, c.model]);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05),
      t = clock.elapsedTime + seed * 2.71;
    const talk = voiceLevel(actorKey || c.id),
      laugh = emote === "laugh" || emote === "celebrate",
      cry = emote === "cry",
      bluff = emote === "bluff";
    const cycle = t % (3.8 + (seed % 3) * 0.73),
      blink = cycle < 0.19 ? Math.sin((cycle / 0.19) * Math.PI) : 0;
    const values: Record<string, number> = {
      Blink: blink,
      Smile: laugh ? 0.8 : cry ? 0 : 0.15,
      JawOpen: Math.min(0.85, talk * 1.45 + (laugh ? 0.25 : 0)),
      BrowUp: bluff ? 0.7 : active ? 0.25 : 0.08,
      Frown: cry ? 0.8 : 0,
      LookLeft: Math.max(0, -instance.gaze.x / 0.025),
      LookRight: Math.max(0, instance.gaze.x / 0.025),
      LookDown: Math.max(0, -instance.gaze.y / 0.025),
    };
    for (const mesh of instance.morphs) {
      if (typeof mesh.userData.blink_reveal === "number")
        mesh.visible = values.Blink >= mesh.userData.blink_reveal;
      for (const [name, index] of Object.entries(
        mesh.morphTargetDictionary || {},
      )) {
        mesh.morphTargetInfluences![index] =
          name === "Blink"
            ? values[name]
            : MathUtils.damp(
                mesh.morphTargetInfluences![index],
                values[name] || 0,
                14,
                dt,
              );
      }
    }
    // Hold each glance briefly. The eyes lead a small look, rather than swimming
    // continuously across the face, and both pupils follow the same gaze target.
    const glance = Math.floor(t / (3.1 + (seed % 3) * 0.23));
    const glanceDirection = Math.sin(glance * 2.4 + seed * 1.7);
    instance.gaze.x = MathUtils.damp(
      instance.gaze.x,
      MathUtils.clamp(attention, -1, 1) * 0.013 + glanceDirection * 0.008,
      9,
      dt,
    );
    instance.gaze.y = MathUtils.damp(
      instance.gaze.y,
      cardPeekProgress(peek, effectNow ?? Date.now()) > 0.1 ? -0.024 : active && glance % 3 === 0 ? -0.013 : -0.003,
      9,
      dt,
    );
    const eyeOpen = Math.max(0.015, 1 - values.Blink);
    for (const {
      object,
      position,
      scale,
      centerY,
      surface,
      surfaceOffset,
    } of instance.eyes) {
      const x = position.x + instance.gaze.x;
      const y = position.y + instance.gaze.y;
      object.scale.y = scale.y * eyeOpen;
      object.position.x = x;
      // The eye's authored center is above the head origin. Blinking toward zero
      // would pull pupils down the cheeks, especially on the larger cartoon eyes.
      object.position.y = centerY + (y - centerY) * eyeOpen;
      if (surface)
        object.position.z =
          eyeSurfaceDepth(surface, x, y) + surfaceOffset - values.Blink * 0.026;
      object.visible = values.Blink < 0.97;
    }
    for (const { object, position } of instance.brows)
      object.position.y = position.y + values.BrowUp * 0.022;
    if (root.current) {
      const face = instance.face;
      root.current.userData.blink = 1 - values.Blink;
      root.current.userData.mouth =
        face?.morphTargetInfluences?.[face.morphTargetDictionary!.JawOpen] ?? 0;
      root.current.rotation.y = MathUtils.damp(
        root.current.rotation.y,
        attention * 0.3 + Math.sin(t * 0.63) * 0.095,
        6,
        dt,
      );
      root.current.rotation.x = MathUtils.damp(
        root.current.rotation.x,
        -(root.current.parent?.parent?.rotation.x || 0) * 0.65 +
          (active ? 0.03 : 0) +
          cardPeekProgress(peek, effectNow ?? Date.now()) * 0.24 +
          Math.sin(t * 0.47) * 0.022 +
          Math.sin(t * 5) * talk * 0.04 -
          (laugh ? 0.065 : 0),
        7,
        dt,
      );
      root.current.rotation.z = MathUtils.damp(
        root.current.rotation.z,
        cry ? 0.12 : bluff ? -0.065 : Math.sin(t * 0.81) * 0.018,
        7,
        dt,
      );
    }
  });
  return (
    <group ref={root} name="face-head" position={[0, 1.94, 0]}>
      <group position={[0, 0.32, 0]} scale={1.12}>
        <primitive object={instance.object} dispose={null} />
      </group>
    </group>
  );
}
