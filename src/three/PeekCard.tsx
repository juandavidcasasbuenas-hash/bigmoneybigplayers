import { useEffect, useMemo, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { cardTexture } from './textures';
import { PEEK_CARD_WIDTH, PEEK_CARD_HEIGHT, peekCardSurface } from './cardPeek';

const COLUMNS = 6, ROWS = 28, STRIDE = COLUMNS + 1, COUNT = STRIDE * (ROWS + 1);

/** Front, back and thin cream edges share one deforming piece of card stock. */
function createGeometry() {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(COUNT * 2 * 3), uv = new Float32Array(COUNT * 2 * 2);
  for (let face = 0; face < 2; face++) for (let y = 0; y <= ROWS; y++) for (let x = 0; x <= COLUMNS; x++) {
    const vertex = face * COUNT + y * STRIDE + x;
    uv[vertex * 2] = face ? x / COLUMNS : 1 - x / COLUMNS;
    uv[vertex * 2 + 1] = y / ROWS;
  }
  const indices: number[] = [];
  for (let face = 0; face < 2; face++) {
    const begin = indices.length;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
      const a = face * COUNT + y * STRIDE + x, b = a + 1, c = a + STRIDE, d = c + 1;
      indices.push(...(face ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
    }
    geometry.addGroup(begin, indices.length - begin, face);
  }
  const edgeStart = indices.length;
  const edge: number[] = [];
  for (let x = 0; x <= COLUMNS; x++) edge.push(x);
  for (let y = 1; y <= ROWS; y++) edge.push(y * STRIDE + COLUMNS);
  for (let x = COLUMNS - 1; x >= 0; x--) edge.push(ROWS * STRIDE + x);
  for (let y = ROWS - 1; y > 0; y--) edge.push(y * STRIDE);
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    indices.push(a, b, a + COUNT, b, b + COUNT, a + COUNT);
  }
  geometry.addGroup(edgeStart, indices.length - edgeStart, 2);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.2, 0), PEEK_CARD_HEIGHT);
  return geometry;
}

export function PeekCard({ card, amount }: { card?: string; amount: MutableRefObject<number> }) {
  const geometry = useMemo(createGeometry, []);
  const front = useMemo(() => cardTexture(card), [card]);
  const back = useMemo(() => cardTexture(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => front.dispose(), [front]);
  useEffect(() => () => back.dispose(), [back]);
  useFrame(() => {
    if (geometry.userData.amount === amount.current) return;
    geometry.userData.amount = amount.current;
    const positions = geometry.attributes.position as BufferAttribute;
    for (let y = 0; y <= ROWS; y++) for (let x = 0; x <= COLUMNS; x++) {
      const value = peekCardSurface((x / COLUMNS - 0.5) * PEEK_CARD_WIDTH, y / ROWS, amount.current);
      const vertex = y * STRIDE + x;
      for (let face = 0; face < 2; face++) {
        const side = face ? -0.002 : 0.002;
        positions.setXYZ(vertex + face * COUNT, value.position.x, value.position.y + value.normal.y * side, value.position.z + value.normal.z * side);
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, -0.5);
  return <mesh geometry={geometry} frustumCulled={false}>
    <meshBasicMaterial attach="material-0" map={front} toneMapped={false}/>
    <meshStandardMaterial attach="material-1" map={back} roughness={0.84}/>
    <meshStandardMaterial attach="material-2" color="#f7efd9" roughness={0.8}/>
  </mesh>;
}
