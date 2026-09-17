import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";

/** A continuous jacket surface: broad shoulders, shaped waist, rounded seated hem. */
export function TorsoBody({ color }: { color: string }) {
  const geometry = useMemo(() => {
    const rings = [
      [0.955, 0.3, 0.225],
      [0.99, 0.38, 0.26],
      [1.1, 0.44, 0.305],
      [1.32, 0.47, 0.32],
      [1.52, 0.46, 0.28],
      [1.65, 0.43, 0.235],
      [1.74, 0.33, 0.18],
      [1.79, 0.18, 0.14],
    ];
    const vertices: number[] = [],
      indices: number[] = [],
      n = 32;
    for (const [y, x, z] of rings)
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        vertices.push(Math.cos(a) * x, y, Math.sin(a) * z);
      }
    for (let r = 0; r < rings.length - 1; r++)
      for (let j = 0; j < n; j++) {
        const a = r * n + j,
          b = r * n + ((j + 1) % n),
          c = (r + 1) * n + j,
          d = (r + 1) * n + ((j + 1) % n);
        indices.push(a, c, b, b, c, d);
      }
    for (const [r, reverse] of [
      [0, true],
      [rings.length - 1, false],
    ] as const) {
      const center = vertices.length / 3;
      vertices.push(0, rings[r][0], 0);
      for (let j = 0; j < n; j++) {
        const a = r * n + j,
          b = r * n + ((j + 1) % n);
        indices.push(center, reverse ? a : b, reverse ? b : a);
      }
    }
    const mesh = new BufferGeometry();
    mesh.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    return mesh;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.94} />
    </mesh>
  );
}
