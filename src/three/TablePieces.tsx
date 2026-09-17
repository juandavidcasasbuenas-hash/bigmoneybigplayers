import { useMemo, useEffect } from "react";
import { RoundedBox } from "@react-three/drei";
import { CanvasTexture } from "three";
import { cardTexture, chipTopTexture, chipSideTexture } from "./textures";
type XYZ = [number, number, number];
function useCanvasTexture(factory: () => CanvasTexture, deps: unknown[]) {
  const texture = useMemo(factory, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
// Identical chip stacks share artwork, including the tiny chips in every avatar’s riffle.
// Release only after all users unmount; deferred release tolerates Strict Mode remounts.
const chipTextures = new Map<
  string,
  { texture: CanvasTexture; users: number }
>();
function useChipTexture(key: string, factory: () => CanvasTexture) {
  const entry = useMemo(() => {
    let value = chipTextures.get(key);
    if (!value) {
      value = { texture: factory(), users: 0 };
      chipTextures.set(key, value);
    }
    return value;
  }, [key]);
  useEffect(() => {
    entry.users++;
    return () => {
      entry.users--;
      queueMicrotask(() => {
        if (!entry.users && chipTextures.get(key) === entry) {
          entry.texture.dispose();
          chipTextures.delete(key);
        }
      });
    };
  }, [entry, key]);
  return entry.texture;
}
export function ChipStack({
  position = [0, 0, 0],
  count = 7,
  color = "#b64946",
  scale = 0.44,
}: {
  position?: XYZ;
  count?: number;
  color?: string;
  scale?: number;
}) {
  const n = Math.max(1, Math.min(18, count));
  const top = useChipTexture(`top:${color}`, () => chipTopTexture(color));
  const side = useChipTexture(`side:${color}:${n}`, () =>
    chipSideTexture(color, n),
  );
  return (
    <mesh
      position={[position[0], position[1] + n * 0.025 * scale, position[2]]}
      scale={scale}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[0.145, 0.145, n * 0.05, 32]} />
      <meshStandardMaterial attach="material-0" map={side} roughness={0.53} />
      <meshStandardMaterial attach="material-1" map={top} roughness={0.57} />
      <meshStandardMaterial attach="material-2" color={color} roughness={0.6} />
    </mesh>
  );
}

export function Card({
  card,
  position,
  rotation = [0, 0, 0],
  scale = 1,
}: {
  card?: string;
  position: XYZ;
  rotation?: XYZ;
  scale?: number;
}) {
  const texture = useCanvasTexture(() => cardTexture(card), [card]);
  const back = useCanvasTexture(() => cardTexture(), []);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <RoundedBox
        args={[0.48, 0.012, 0.67]}
        radius={0.004}
        smoothness={2}
        castShadow
      >
        <meshStandardMaterial color="#f3ead2" roughness={0.57} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <planeGeometry args={[0.465, 0.654]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.008, 0]}>
        <planeGeometry args={[0.465, 0.654]} />
        <meshStandardMaterial map={back} roughness={0.73} />
      </mesh>
    </group>
  );
}
