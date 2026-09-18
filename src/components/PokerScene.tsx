import {
  Environment,
  Lightformer,
  CameraControls,
  CameraControlsImpl,
  RoundedBox,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TableMotion } from "../../shared/tableTimeline";
import { holePickupAt } from "../../shared/dealTiming";
import {
  FELT_Y,
  smooth,
  workZ,
} from "../three/contactMotion";
import { useStanding } from "../three/ContactRig";
import { CHARACTERS, getCharacter } from "../data/characters";
import {
  CAMERA_MAX_SPEED,
  CAMERA_SMOOTH_TIME,
  FirstPersonMotion,
  firstPersonShot,
  moveToShot,
} from "../three/cameraMotion";
import { seatPosition } from "../three/seating";
import type { CardPeek } from '../../shared/cardPeek';
import { privateCardLookTarget } from '../three/cardPeek';
import { CentralPot, CommunityCard, TableEffects } from "../three/TableEffects";
import { Card, ChipStack } from "../three/TablePieces";
import { ShowdownReveal } from '../three/ShowdownReveal';
import type { ShowdownPresentation } from '../three/showdownPresentation';
import {
  feltTexture,
  labelTexture,
  tableLogoTexture,
  woodGrainTexture,
  wovenTexture,
} from "../three/textures";
import {
  ToonAvatar as CartoonAvatar,
  DEALER_CHARACTER,
} from "../three/ToonAvatar";
export { ToonAvatar as CartoonAvatar } from "../three/ToonAvatar";

/** Private cards stay out of opponent models; tabled cards use the separate public reveal. */
export interface ScenePlayer {
  id: string;
  name: string;
  avatar: string;
  stack: number;
  status?: string;
  bet?: number;
  seat?: number;
  emote?: string;
  emoteAt?: number;
  spokenLine?: string;
  smallBlind?: boolean;
  bigBlind?: boolean;
  cardCount?: number;
  peek?: CardPeek | null;
}
export interface PokerSceneProps {
  players: ScenePlayer[];
  heroCards?: string[];
  peeking?: boolean;
  onPeekStart?: () => void;
  board?: string[];
  pot?: number;
  currentPlayerId?: string;
  followPlayerId?: string;
  playerSpeech?: { actor: string; text: string } | null;
  dealerIndex?: number;
  roomTheme?: "turf" | "penthouse" | "shed" | "basement" | string;
  cameraMode?:
    | "follow"
    | "table"
    | "overhead"
    | "cinematic"
    | "first-person"
    | "free"
    | string;
  heroId?: string;
  onSeatClick?: (id: string) => void;
  handNumber?: number;
  turnRemaining?: number;
  turnProgress?: number;
  paused?: boolean;
  dealerSpeech?: string;
  motions?: TableMotion[];
  effectNow?: number;
  soundEffects?: boolean;
  settled?: boolean;
  focusTable?: boolean;
  showdown?: ShowdownPresentation | null;
  /** Optional developer telemetry; never displayed in the game UI. */
  onRenderStats?: (stats: SceneRenderStats) => void;
}
export interface SceneRenderStats {
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  fps: number;
  motions?: {
    name: string;
    visible: boolean;
    position: number[];
    progress?: number;
    childrenVisible: number;
  }[];
  focusActor?: string;
  camera?: number[];
  cameraMotion?: { peakStep: number; peakSpeed: number; peakAcceleration: number };
  poses?: {
    id: string;
    blink: number;
    mouth: number;
    mouthOpen: boolean;
    headYaw: number;
    action?: string;
    rightHand?: number[];
    blinkMinimum: number;
    mouthMaximum: number;
    contact?: {
      physics: string;
      solver: string;
      armError: number;
      railClearance: number;
      standing: number;
      hip: number[];
      leftHand: number[];
      rightHand: number[];
      knees: number[][];
      ankles: number[][];
      airborne: boolean;
      peek?: number;
      cardCurl?: number;
    };
  }[];
}

type XYZ = [number, number, number];
const CREAM = "#e3d3ac";
const GOLD = "#b9924d";
const materialContext = createContext<{
  wood?: CanvasTexture;
  cloth?: CanvasTexture;
}>({});
const woodColors = new Set([
  "#3a2920",
  "#493023",
  "#53372a",
  "#4c3828",
  "#4a3324",
  "#765334",
  "#624329",
  "#715636",
  "#796145",
  "#796041",
  "#a38d65",
  "#8f7a57",
  "#6a5236",
  "#946848",
  "#614632",
]);
const clothColors = new Set(CHARACTERS.flatMap((c) => [c.shirt, c.undershirt]));

function MaterialLibrary({ children }: { children: ReactNode }) {
  const wood = useCanvasTexture(woodGrainTexture, []),
    cloth = useCanvasTexture(wovenTexture, []);
  const value = useMemo(() => ({ wood, cloth }), [wood, cloth]);
  return (
    <materialContext.Provider value={value}>
      {children}
    </materialContext.Provider>
  );
}

function FrameBudget() {
  const { invalidate, gl } = useThree();
  useEffect(() => {
    let onScreen = true;
    const tick = () => {
      if (onScreen && document.visibilityState !== "hidden") invalidate();
    };
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true;
      if (onScreen) tick();
    });
    observer.observe(gl.domElement);
    const timer = window.setInterval(tick, 1000 / 30);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", tick);
    };
  }, [invalidate, gl]);
  return null;
}

export function RenderStats({
  onStats,
}: {
  onStats: (stats: SceneRenderStats) => void;
}) {
  const counter = useRef({ frames: 0, elapsed: 0 });
  const cameraMotion = useRef({ previous: new Quaternion(), ready: false, speed: 0, peakStep: 0, peakSpeed: 0, peakAcceleration: 0 });
  const extrema = useRef(new Map<string, { blink: number; mouth: number }>());
  useFrame(({ gl, scene, camera }, delta) => {
    const motion = cameraMotion.current;
    if (motion.ready && delta > 0) {
      const step = MathUtils.radToDeg(motion.previous.angleTo(camera.quaternion));
      const speed = step / delta;
      motion.peakStep = Math.max(motion.peakStep, step);
      motion.peakSpeed = Math.max(motion.peakSpeed, speed);
      motion.peakAcceleration = Math.max(motion.peakAcceleration, Math.abs(speed - motion.speed) / delta);
      motion.speed = speed;
    }
    motion.previous.copy(camera.quaternion);
    motion.ready = true;
    counter.current.frames++;
    counter.current.elapsed += delta;
    scene.traverse((object) => {
      if (object.userData.actorKey) {
        const id = object.userData.actorKey,
          head = object.getObjectByName("face-head"),
          previous = extrema.current.get(id) || { blink: 1, mouth: 0 };
        extrema.current.set(id, {
          blink: Math.min(previous.blink, head?.userData.blink ?? 1),
          mouth: Math.max(previous.mouth, head?.userData.mouth ?? 0),
        });
      }
    });
    if (counter.current.elapsed >= 1) {
      const poses: NonNullable<SceneRenderStats["poses"]> = [];
      scene.traverse((object) => {
        if (object.userData.actorKey) {
          const head = object.getObjectByName("face-head");
          poses.push({
            id: object.userData.actorKey,
            blink: head?.userData.blink ?? 1,
            mouth: head?.userData.mouth ?? 0,
            mouthOpen: (head?.userData.mouth ?? 0) > 0.03,
            headYaw: head?.rotation.y ?? 0,
            action: object.userData.action,
            contact: object.userData.contact,
            rightHand: object
              .getObjectByName("right-hand")
              ?.rotation.toArray()
              .slice(0, 3) as number[] | undefined,
            blinkMinimum:
              extrema.current.get(object.userData.actorKey)?.blink ?? 1,
            mouthMaximum:
              extrema.current.get(object.userData.actorKey)?.mouth ?? 0,
          });
        }
      });
      const motions: NonNullable<SceneRenderStats["motions"]> = [];
      scene.traverse((object) => {
        if (
          /^(community-card-|dealing-cards|bet-chips-|collecting-pot|riffle-chips|folded-card-slide)/.test(
            object.name,
          )
        )
          motions.push({
            name: object.name,
            visible: object.visible,
            position: object.position.toArray(),
            progress: object.userData.progress,
            childrenVisible: object.children.filter((c) => c.visible).length,
          });
      });
      onStats({
        motions,
        focusActor: camera.userData.focusActor,
        camera: camera.position.toArray(),
        cameraMotion: { peakStep: motion.peakStep, peakSpeed: motion.peakSpeed, peakAcceleration: motion.peakAcceleration },
        poses,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
        fps:
          Math.round((counter.current.frames / counter.current.elapsed) * 10) /
          10,
      });
      counter.current = { frames: 0, elapsed: 0 };
      motion.peakStep = motion.peakSpeed = motion.peakAcceleration = 0;
      extrema.current.clear();
    }
  });
  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={64} frames={1}>
      <Lightformer
        form="rect"
        color="#fff3da"
        intensity={2.2}
        position={[0, 5, 3]}
        rotation={[-Math.PI / 4, 0, 0]}
        scale={[8, 4, 1]}
      />
      <Lightformer
        form="rect"
        color="#c7d6d6"
        intensity={1.2}
        position={[-4, 2, 1]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[4, 5, 1]}
      />
      <Lightformer
        form="rect"
        color="#eec786"
        intensity={1.5}
        position={[4, 3, -2]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[3, 5, 1]}
      />
    </Environment>
  );
}

function useCanvasTexture(factory: () => CanvasTexture, deps: unknown[]) {
  // Every texture is owned by its mounted component, including its GPU cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const texture = useMemo(factory, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Ball({
  position = [0, 0, 0],
  scale = [1, 1, 1],
  color,
  roughness = 0.72,
  metalness = 0,
}: {
  position?: XYZ;
  scale?: XYZ;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  const maps = useContext(materialContext);
  const map = clothColors.has(color) ? maps.cloth : undefined;
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[1, 28, 20]} />
      <meshStandardMaterial
        color={color}
        map={map}
        bumpMap={map}
        bumpScale={0.009}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

function Box({
  position = [0, 0, 0],
  scale,
  color,
  rotation = [0, 0, 0],
  roughness = 0.7,
  metalness = 0,
}: {
  position?: XYZ;
  scale: XYZ;
  color: string;
  rotation?: XYZ;
  roughness?: number;
  metalness?: number;
}) {
  const maps = useContext(materialContext);
  const map = woodColors.has(color)
    ? maps.wood
    : clothColors.has(color)
      ? maps.cloth
      : undefined;
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={scale} />
      <meshStandardMaterial
        color={color}
        map={map}
        bumpMap={map}
        bumpScale={0.025}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

function Curve({
  points,
  color,
  radius = 0.012,
}: {
  points: XYZ[];
  color: string;
  radius?: number;
}) {
  const data = JSON.stringify(points);
  const geometry = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3(points.map((point) => new Vector3(...point))),
        18,
        radius,
        6,
        false,
      ),
    [data, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function PrintedPlane({
  lines,
  width,
  height,
  position,
  rotation = [0, 0, 0],
  color = CREAM,
  background,
}: {
  lines: string[];
  width: number;
  height: number;
  position: XYZ;
  rotation?: XYZ;
  color?: string;
  background?: string;
}) {
  const key = lines.join("\n");
  const texture = useCanvasTexture(
    () => labelTexture(lines, color, background),
    [key, color, background],
  );
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={texture}
        transparent={!background}
        roughness={0.9}
        depthWrite={!!background}
      />
    </mesh>
  );
}

export function Chair({
  theme,
  emote,
  emoteAt,
  effectNow,
}: {
  theme: string;
  emote?: string;
  emoteAt?: number;
  effectNow?: number;
}) {
  const chair = useRef<Group>(null);
  const standing = useStanding(emote, emoteAt, effectNow);
  useFrame(() => {
    if (chair.current)
      chair.current.position.z = -smooth(standing.current, 0, 0.65) * 0.36;
  }, -2);
  const shed = theme === "shed" || theme === "basement";
  const upholstery =
    theme === "penthouse" ? "#612e33" : shed ? "#668473" : "#3a4939";
  const maps = useContext(materialContext);
  return (
    <group ref={chair} name="player-chair" scale={[1, 0.912, 1]}>
      <RoundedBox
        args={[1.12, 0.17, 0.95]}
        radius={0.08}
        position={[0, 0.72, -0.08]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={upholstery}
          map={maps.cloth}
          bumpMap={maps.cloth}
          bumpScale={0.008}
          roughness={0.58}
        />
      </RoundedBox>
      <RoundedBox
        args={[1.08, 0.97, 0.15]}
        radius={0.068}
        position={[0, 1.18, -0.52]}
        rotation={[-0.09, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={upholstery}
          map={maps.cloth}
          bumpMap={maps.cloth}
          bumpScale={0.008}
          roughness={0.62}
        />
      </RoundedBox>
      {!shed && (
        <>
          {[-0.615, -0.427].map((z) => (
            <group key={z}>
              <Curve
                points={[
                  [-0.44, 0.79, z],
                  [-0.47, 0.89, z],
                  [-0.47, 1.52, z],
                  [-0.4, 1.59, z],
                  [0.4, 1.59, z],
                  [0.47, 1.52, z],
                  [0.47, 0.89, z],
                  [0.4, 0.79, z],
                  [-0.44, 0.79, z],
                ]}
                color="#7c8765"
                radius={0.008}
              />
              {[-0.28, 0, 0.28].map((x) => (
                <Ball
                  key={x}
                  position={[x, 1.23, z]}
                  scale={[0.031, 0.031, 0.015]}
                  color={upholstery}
                />
              ))}
              {[-0.4, -0.2, 0, 0.2, 0.4].map((x) => (
                <Ball
                  key={x}
                  position={[x, 1.615, z]}
                  scale={[0.014, 0.014, 0.012]}
                  color={GOLD}
                  metalness={0.5}
                />
              ))}
            </group>
          ))}
          <Curve
            points={[
              [-0.46, 0.76, 0.34],
              [0, 0.775, 0.384],
              [0.46, 0.76, 0.34],
              [0.51, 0.76, -0.36],
              [0.42, 0.76, -0.49],
              [-0.42, 0.76, -0.49],
              [-0.51, 0.76, -0.36],
              [-0.46, 0.76, 0.34],
            ]}
            color="#7c8765"
            radius={0.008}
          />
        </>
      )}
      {[-1, 1].map((x) =>
        [-1, 1].map((z) => (
          <Box
            key={`${x}${z}`}
            position={[x * 0.41, 0.35, z * 0.33 - 0.08]}
            scale={[0.06, 0.7, 0.065]}
            color={shed ? "#a6aaa0" : GOLD}
            metalness={0.6}
          />
        )),
      )}
      {!shed &&
        [-1, 1].map((x) => (
          <Box
            key={x}
            position={[x * 0.51, 1.22, -0.59]}
            scale={[0.038, 1.05, 0.035]}
            color={GOLD}
            metalness={0.65}
          />
        ))}
    </group>
  );
}

function Pint({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.205, 0]}>
        <cylinderGeometry args={[0.12, 0.094, 0.38, 24]} />
        <meshPhysicalMaterial
          color="#d8ddb6"
          roughness={0.12}
          metalness={0.05}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.191, 0]}>
        <cylinderGeometry args={[0.108, 0.081, 0.329, 24]} />
        <meshStandardMaterial
          color="#a56c1c"
          roughness={0.22}
          metalness={0.12}
        />
      </mesh>
      <mesh position={[0, 0.365, 0]}>
        <cylinderGeometry args={[0.109, 0.109, 0.036, 24]} />
        <meshStandardMaterial color="#f2e2b7" roughness={0.9} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <Ball
          key={i}
          position={[
            Math.sin(i * 2.4) * 0.07,
            0.385 + (i % 2) * 0.009,
            Math.cos(i * 2.4) * 0.07,
          ]}
          scale={[0.024, 0.014, 0.024]}
          color="#f5e7c5"
        />
      ))}
      <Curve
        points={[
          [-0.05, 0.067, 0.081],
          [-0.068, 0.18, 0.086],
          [-0.075, 0.31, 0.095],
        ]}
        color="#eee8ca"
        radius={0.006}
      />
      <mesh position={[0, 0.397, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.108, 0.012, 6, 20]} />
        <meshStandardMaterial color="#f9f2d8" roughness={0.3} />
      </mesh>
      <mesh position={[0.13, 0.22, 0]} scale={[0.8, 1, 1]}>
        <torusGeometry args={[0.095, 0.019, 8, 20]} />
        <meshStandardMaterial
          color="#d0c59b"
          roughness={0.18}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

function PositionButton({ position, label = 'D' }: { position: XYZ; label?: 'D' | 'SB' | 'BB' }) {
  const background = label === 'D' ? '#f0dfb6' : label === 'SB' ? '#91c5d5' : '#e7a17b';
  const texture = useCanvasTexture(
    () => labelTexture([label], "#192d24", background, 256, 256),
    [label],
  );
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.205, 0.205, 0.046, 32]} />
        <meshStandardMaterial color={background} roughness={0.45} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <circleGeometry args={[0.192, 32]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </group>
  );
}

function RailStitches() {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    for (let i = 0; i < 230; i++) {
      const a = (i * Math.PI * 2) / 230,
        b = a + 0.011;
      vertices.push(
        Math.cos(a) * 3.96,
        1.493,
        Math.sin(a) * 2.42,
        Math.cos(b) * 3.96,
        1.493,
        Math.sin(b) * 2.42,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    return geometry;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#c5b080" transparent opacity={0.65} />
    </lineSegments>
  );
}

export function PokerTable({
  board,
  pot,
  motions = [],
  effectNow,
  settled = false,
  boardRotation = 0,
}: {
  board: string[];
  pot: number;
  motions?: TableMotion[];
  effectNow?: number;
  settled?: boolean;
  boardRotation?: number;
}) {
  const animatedBoard = [...board];
  for (const motion of motions)
    if (motion.type === "street")
      motion.board.forEach((card, i) => {
        animatedBoard[i] = card;
      });
  const felt = useCanvasTexture(feltTexture, []);
  const logo = useCanvasTexture(tableLogoTexture, []);
  const maps = useContext(materialContext);
  return (
    <group>
      <mesh position={[0, -0.006, 0]} scale={[4.9, 1, 3.1]} receiveShadow>
        <cylinderGeometry args={[1, 1, 0.018, 80]} />
        <meshStandardMaterial color="#6d5740" roughness={1} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.9, 0.63, 0]}>
          <Box scale={[0.4, 1.1, 1.3]} color="#3a2920" />
          <Box
            position={[0, -0.48, 0]}
            scale={[1.55, 0.15, 1.65]}
            color="#493023"
          />
          <Box
            position={[0, 0.3, 0]}
            scale={[1.5, 0.08, 1.3]}
            color={GOLD}
            metalness={0.6}
          />
        </group>
      ))}
      <mesh
        position={[0, 1.17, 0]}
        scale={[4.16, 1, 2.54]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.96, 0.32, 96]} />
        <meshStandardMaterial
          color="#53372a"
          map={maps.wood}
          bumpMap={maps.wood}
          bumpScale={0.025}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 1.34, 0]} scale={[3.84, 1, 2.22]} receiveShadow>
        <cylinderGeometry args={[1, 1, 0.06, 96]} />
        <meshStandardMaterial
          map={felt}
          bumpMap={felt}
          bumpScale={0.012}
          roughness={0.96}
        />
      </mesh>
      <mesh
        position={[0, 1.37, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.635, 1, 1]}
        castShadow
        receiveShadow
      >
        <torusGeometry args={[2.39, 0.175, 16, 100]} />
        <meshStandardMaterial
          color="#243f32"
          map={maps.cloth}
          bumpMap={maps.cloth}
          bumpScale={0.008}
          roughness={0.49}
        />
      </mesh>
      <RailStitches />
      <mesh
        position={[0, 1.465, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.635, 1, 1]}
      >
        <torusGeometry args={[2.43, 0.012, 6, 100]} />
        <meshStandardMaterial
          color="#ad9870"
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>
      <mesh
        position={[0, 1.378, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.8, 1, 1]}
      >
        <torusGeometry args={[1.56, 0.012, 6, 96]} />
        <meshStandardMaterial color="#86a683" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.377, -1.42]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.76]} />
        <meshStandardMaterial
          map={logo}
          transparent
          roughness={1}
          depthWrite={false}
        />
      </mesh>
      {/* Private hands are rendered separately, only once publicly tabled. */}
      {animatedBoard.slice(0, 5).map((card, i) => (
        <CommunityCard
          key={`${i}-${card}`}
          card={card}
          index={i}
          motions={motions}
          effectNow={effectNow}
          layoutRotation={boardRotation}
        />
      ))}
      {pot > 0 && !settled && (
        <CentralPot amount={pot} layoutRotation={boardRotation} />
      )}
      {[-1, 1].map((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}${z}`}
            position={[x * 3.05, 1.475, z * 1.44]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.108, 0.133, 24]} />
            <meshStandardMaterial
              color={GOLD}
              metalness={0.72}
              roughness={0.29}
            />
          </mesh>
        )),
      )}
    </group>
  );
}

function PlayerSeat({
  player,
  index,
  count,
  active,
  dealer,
  hero,
  theme,
  hideAvatar = false,
  cardsTabled = false,
  privateCards,
  onPeekStart,
  onClick,
  remaining = 0,
  progress = 0,
  paused = false,
  showLabel = true,
  motions = [],
  effectNow,
  soundEffects = false,
}: {
  motions?: TableMotion[];
  effectNow?: number;
  soundEffects?: boolean;
  showLabel?: boolean;
  remaining?: number;
  progress?: number;
  paused?: boolean;
  player: ScenePlayer;
  index: number;
  count: number;
  active: boolean;
  dealer: boolean;
  hero: boolean;
  theme: string;
  hideAvatar?: boolean;
  cardsTabled?: boolean;
  privateCards?: string[];
  onPeekStart?: () => void;
  onClick?: (id: string) => void;
}) {
  const { position, rotation } = seatPosition(player.seat ?? index, count);
  const folded = ["folded", "out", "eliminated", "spectator"].includes(
    player.status || "",
  );
  const outOfHand = folded || player.status === 'waiting';
  const c = getCharacter(player.avatar);
  const depth = workZ(player.seat ?? index);
  return (
    <group position={position} rotation={rotation}>
      <Chair
        theme={theme}
        emote={player.emote}
        emoteAt={player.emoteAt}
        effectNow={effectNow}
      />
      {active && <TurnHalo paused={paused} />}
      <group
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(player.id);
        }}
      >
        <CartoonAvatar
          character={c}
          firstPerson={hideAvatar}
          privateCards={privateCards}
          onPeekStart={onPeekStart}
          peek={player.peek}
          cardsTabled={cardsTabled}
          emote={player.emote}
          seed={index}
          actorKey={player.id}
          active={active && !paused}
          outOfHand={outOfHand}
          seatIndex={player.seat ?? index}
          workDepth={depth}
          hasCards={
            !cardsTabled && ((!outOfHand && player.cardCount !== 0) ||
            motions.some(
              (m) =>
                m.type === "fold" &&
                m.playerId === player.id &&
                (effectNow ?? Date.now()) < m.startAt + m.duration &&
                (effectNow ?? Date.now()) >= m.startAt,
            ))
          }
          activity={[...motions]
            .reverse()
            .find(
              (m) =>
                m.startAt <= (effectNow ?? Date.now()) &&
                m.startAt + m.duration >= (effectNow ?? Date.now()) &&
                (("playerId" in m && m.playerId === player.id) ||
                  (m.type === "award" &&
                    m.winners.some((w) => w.playerId === player.id))),
            )}
          effectNow={effectNow}
          playerCount={count}
          soundEffects={soundEffects}
          emoteAt={player.emoteAt}
          cardsReadyAt={(() => {
            const deal = motions.find((m) => m.type === "hand-start");
            return deal?.type === "hand-start"
              ? deal.startAt +
                  holePickupAt(
                    deal.playerIds.length,
                    deal.playerIds.indexOf(player.id),
                  )
              : 0;
          })()}
        />
      </group>
      <group position={[0, FELT_Y + 0.002, depth]}>
        {player.stack > 0 && <>
        <ChipStack
          position={[0.48, 0, 0.26]}
          count={Math.max(2, Math.round(player.stack / 2000))}
          color="#b64e48"
        />
        <ChipStack
          position={[0.66, 0, 0.55]}
          count={Math.max(2, Math.round(player.stack / 3500))}
          color="#abb79b"
        />
        <ChipStack position={[0.15, 0, 0.52]} count={4} color="#d0ad69" />
        </>}
        {!cardsTabled && dealer && <PositionButton position={[-0.48, 0.025, 0.68]} />}
        {!cardsTabled && player.smallBlind && <PositionButton position={[dealer ? -0.02 : -0.48, 0.025, 0.68]} label="SB" />}
        {!cardsTabled && player.bigBlind && <PositionButton position={[-0.48, 0.025, 0.68]} label="BB" />}
      </group>
      {index % 2 === 0 && (
        <group position={[-0.69, FELT_Y, depth + 0.28]}>
          <Pint scale={0.85} />
        </group>
      )}
    </group>
  );
}

function Pendant({
  position,
  fancy = false,
}: {
  position: XYZ;
  fancy?: boolean;
}) {
  return (
    <group position={position}>
      <Box
        position={[0, 0.85, 0]}
        scale={[0.025, 1.7, 0.025]}
        color="#6c5934"
        metalness={0.5}
      />
      <mesh castShadow>
        <cylinderGeometry args={[0.19, 0.7, 0.32, 32, 1, true]} />
        <meshStandardMaterial
          color={fancy ? "#cab57f" : "#2c4c3d"}
          metalness={0.45}
          roughness={0.34}
          side={2}
        />
      </mesh>
      <mesh position={[0, -0.155, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.69, 0.025, 8, 40]} />
        <meshStandardMaterial color={GOLD} metalness={0.72} roughness={0.24} />
      </mesh>
      <mesh position={[0, -0.158, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.63, 32]} />
        <meshStandardMaterial
          color="#f9e9b9"
          emissive="#f8d59b"
          emissiveIntensity={1.3}
        />
      </mesh>
    </group>
  );
}

function Sconce({ position }: { position: XYZ }) {
  return (
    <group position={position}>
      <Box scale={[0.18, 0.53, 0.09]} color={GOLD} metalness={0.65} />
      <Box
        position={[0, -0.1, 0.17]}
        scale={[0.03, 0.04, 0.3]}
        color={GOLD}
        metalness={0.65}
      />
      <mesh position={[0, 0.04, 0.3]}>
        <cylinderGeometry args={[0.15, 0.25, 0.35, 24, 1, true]} />
        <meshStandardMaterial
          color="#e9cc8e"
          emissive="#b27634"
          emissiveIntensity={0.3}
          side={2}
        />
      </mesh>
      <Ball
        position={[0, -0.06, 0.3]}
        scale={[0.075, 0.1, 0.075]}
        color="#fae6b7"
      />
    </group>
  );
}

function PubClock() {
  const marks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <group position={[-3.27, 3.08, -4.87]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.35, 0.1, 40]} />
        <meshStandardMaterial color="#624329" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.058]}>
        <circleGeometry args={[0.294, 40]} />
        <meshStandardMaterial color="#dfcea3" roughness={0.8} />
      </mesh>
      {marks.map((i) => (
        <Box
          key={i}
          position={[
            Math.sin((i * Math.PI) / 6) * 0.25,
            Math.cos((i * Math.PI) / 6) * 0.25,
            0.067,
          ]}
          scale={[0.014, i % 3 === 0 ? 0.056 : 0.027, 0.006]}
          rotation={[0, 0, (-i * Math.PI) / 6]}
          color="#49553c"
        />
      ))}
      <Box
        position={[0.057, 0.093, 0.08]}
        scale={[0.018, 0.22, 0.018]}
        rotation={[0, 0, -0.53]}
        color="#394c38"
      />
      <Box
        position={[-0.07, 0.013, 0.089]}
        scale={[0.16, 0.015, 0.015]}
        rotation={[0, 0, -0.2]}
        color="#394c38"
      />
      <Ball
        position={[0, 0, 0.092]}
        scale={[0.027, 0.027, 0.018]}
        color={GOLD}
        metalness={0.6}
      />
    </group>
  );
}

function Candle({ position }: { position: XYZ }) {
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (flame.current)
      flame.current.scale.set(
        1 + Math.sin(clock.elapsedTime * 7) * 0.08,
        1 + Math.sin(clock.elapsedTime * 11) * 0.1,
        1,
      );
  });
  return (
    <group position={position} userData={{ live: true }}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.04, 24]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.31} />
      </mesh>
      <mesh position={[0, 0.105, 0]}>
        <cylinderGeometry args={[0.075, 0.077, 0.15, 24]} />
        <meshStandardMaterial color="#decbaa" roughness={0.9} />
      </mesh>
      <group ref={flame} position={[0, 0.218, 0]}>
        <mesh scale={[0.023, 0.058, 0.023]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#ffd581" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Frame({
  position,
  title,
  subtitle,
  wide = 1.9,
}: {
  position: XYZ;
  title: string;
  subtitle: string;
  wide?: number;
}) {
  return (
    <group position={position}>
      <Box scale={[wide, 1.31, 0.12]} color="#765334" />
      <Box
        position={[0, 0, 0.075]}
        scale={[wide - 0.1, 1.2, 0.04]}
        color={GOLD}
        metalness={0.3}
      />
      <PrintedPlane
        lines={["♠", title, subtitle]}
        width={wide - 0.21}
        height={1.09}
        position={[0, 0, 0.11]}
        color="#d5cfac"
        background="#294538"
      />
    </group>
  );
}

function Window({
  position,
  width = 1.65,
  fancy = false,
}: {
  position: XYZ;
  width?: number;
  fancy?: boolean;
}) {
  return (
    <group position={position}>
      <Box
        scale={[width + 0.16, 2.35, 0.13]}
        color={fancy ? "#a8966b" : "#3e3325"}
        metalness={fancy ? 0.4 : 0}
      />
      <Box
        position={[0, 0, 0.076]}
        scale={[width, 2.18, 0.03]}
        color={fancy ? "#314a5b" : "#556e64"}
        roughness={0.28}
      />
      {[-0.27, 0.27].map((x) => (
        <Box
          key={x}
          position={[x * width, 0, 0.115]}
          scale={[0.055, 2.2, 0.055]}
          color="#352f24"
        />
      ))}
      {[-0.54, 0.03, 0.6].map((y) => (
        <Box
          key={y}
          position={[0, y, 0.12]}
          scale={[width, 0.045, 0.04]}
          color="#352f24"
        />
      ))}
      {!fancy && (
        <>
          <Box
            position={[0, -1.15, 0.1]}
            scale={[width + 0.28, 0.12, 0.32]}
            color="#776d51"
          />
          {[-1, 1].map((side) => (
            <Ball
              key={side}
              position={[side * (width / 2 + 0.11), -0.1, 0.16]}
              scale={[0.15, 1.25, 0.13]}
              color="#92684f"
            />
          ))}
        </>
      )}
    </group>
  );
}

function Shelf({ position }: { position: XYZ }) {
  const bottles = [
    "#62794c",
    "#805a31",
    "#495f3d",
    "#8d3e2e",
    "#8b773b",
    "#3b5944",
  ];
  return (
    <group position={position}>
      <Box scale={[2.4, 0.105, 0.42]} color="#624329" />
      {bottles.map((color, i) => (
        <group key={i} position={[(i - 2.5) * 0.32, 0.06, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.088, 0.09, 0.37 + (i % 2) * 0.09, 12]} />
            <meshStandardMaterial
              color={color}
              metalness={0.05}
              roughness={0.27}
            />
          </mesh>
          <mesh position={[0, 0.43 + (i % 2) * 0.055, 0]}>
            <cylinderGeometry args={[0.037, 0.068, 0.15, 12]} />
            <meshStandardMaterial color={color} roughness={0.25} />
          </mesh>
          <Box
            position={[0, 0.19, 0.086]}
            scale={[0.115, 0.14, 0.012]}
            color={i % 2 ? "#d2ba84" : "#dad6b2"}
          />
        </group>
      ))}
    </group>
  );
}

function CutawayWall({
  axis,
  edge,
  insidePositive,
  children,
}: {
  axis: "x" | "z";
  edge: number;
  insidePositive: boolean;
  children: ReactNode;
}) {
  const wall = useRef<Group>(null);
  useEffect(() => {
    const root = wall.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map<
      string,
      {
        material: MeshStandardMaterial;
        originals: Mesh[];
        geometries: BufferGeometry[];
      }
    >();
    root.traverse((object) => {
      if (
        !(object instanceof Mesh) ||
        Array.isArray(object.material) ||
        !(object.material instanceof MeshStandardMaterial) ||
        object.material.transparent
      )
        return;
      let dynamic = false;
      for (
        let parent = object.parent;
        parent && parent !== root;
        parent = parent.parent
      ) {
        if (parent.userData.live) {
          dynamic = true;
          break;
        }
      }
      if (dynamic) return;
      const material = object.material;
      const key = [
        material.color.getHex(),
        material.map?.uuid,
        material.bumpMap?.uuid,
        material.bumpScale,
        material.roughness,
        material.metalness,
        material.emissive.getHex(),
        material.emissiveIntensity,
        material.side,
      ].join("|");
      const batch = batches.get(key) ?? {
        material,
        originals: [],
        geometries: [],
      };
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      batch.originals.push(object);
      batch.geometries.push(geometry);
      batches.set(key, batch);
    });
    const baked: Mesh[] = [];
    const hidden: Mesh[] = [];
    for (const batch of batches.values()) {
      if (batch.originals.length < 2) {
        batch.geometries.forEach((g) => g.dispose());
        continue;
      }
      const geometry = mergeGeometries(batch.geometries, false);
      batch.geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      const mesh = new Mesh(geometry, batch.material.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      baked.push(mesh);
      batch.originals.forEach((original) => {
        original.visible = false;
        hidden.push(original);
      });
    }
    return () => {
      hidden.forEach((mesh) => {
        mesh.visible = true;
      });
      baked.forEach((mesh) => {
        root.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      });
    };
  }, [children]);
  useFrame(({ camera }) => {
    if (wall.current)
      wall.current.visible = insidePositive
        ? camera.position[axis] > edge
        : camera.position[axis] < edge;
  });
  return <group ref={wall}>{children}</group>;
}

function Ceiling({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const direction = useRef(new Vector3());
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = camera.position.y < 11 && (camera.position.y < 5.6 || camera.getWorldDirection(direction.current).y > -0.8);
  });
  return <group ref={group}>{children}</group>;
}

function SupportingWall({
  position,
  rotation,
  width,
  theme,
}: {
  position: XYZ;
  rotation: XYZ;
  width: number;
  theme: string;
}) {
  const fancy = theme === "penthouse",
    shed = theme === "shed" || theme === "basement";
  return (
    <group position={position} rotation={rotation}>
      <Box
        position={[0, 2.75, 0]}
        scale={[width, 5.5, 0.16]}
        color={fancy ? "#253942" : shed ? "#a38d65" : "#b8a17a"}
      />
      <Box
        position={[0, 0.72, 0.1]}
        scale={[width, 1.44, 0.1]}
        color={fancy ? "#253d3d" : shed ? "#8f7a57" : "#334b38"}
      />
      <Box
        position={[0, 1.48, 0.16]}
        scale={[width, 0.08, 0.13]}
        color={fancy ? GOLD : shed ? "#796041" : "#6a5236"}
        metalness={fancy ? 0.5 : 0}
      />
      <Box
        position={[0, 4.85, 0.1]}
        scale={[width, 0.26, 0.3]}
        color={fancy ? GOLD : "#4c3828"}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Window
            position={[side * width * 0.3, 3.12, 0.15]}
            width={fancy ? width * 0.35 : 1.8}
            fancy={fancy}
          />
          <Sconce position={[side * width * 0.135, 3.32, 0.17]} />
        </group>
      ))}
      <Frame
        position={[0, 3.05, 0.18]}
        title={
          fancy
            ? "PLAY BEAUTIFULLY"
            : shed
              ? "POKER IN PROGRESS"
              : "THE USUAL SUSPECTS"
        }
        subtitle={
          fancy
            ? "WIN WITH GRACE. LOSE WITH STYLE."
            : shed
              ? "PLEASE DO NOT TELL THE NEIGHBOURS."
              : "NO STRANGERS. JUST MATES WE HAVE NOT MET."
        }
        wide={width > 12 ? 2.8 : 1.8}
      />
      {!fancy &&
        Array.from({ length: Math.floor(width) }, (_, i) => (
          <Box
            key={i}
            position={[(i - (Math.floor(width) - 1) / 2) * 0.94, 0.7, 0.17]}
            scale={[0.047, 1.3, 0.03]}
            color={shed ? "#786846" : "#506249"}
          />
        ))}
    </group>
  );
}

function PubRoom() {
  return (
    <group>
      <CutawayWall axis="z" edge={-5.05} insidePositive>
        <Box
          position={[0, 2.75, -5.35]}
          scale={[17, 5.5, 0.2]}
          color="#b8a17a"
        />
        <Box
          position={[0, 0.72, -5.21]}
          scale={[17, 1.44, 0.13]}
          color="#334b38"
        />
        <Box
          position={[0, 1.5, -5.1]}
          scale={[17, 0.09, 0.13]}
          color="#6a5236"
        />
        {Array.from({ length: 19 }, (_, i) => (
          <Box
            key={i}
            position={[(i - 9) * 0.85, 0.7, -5.09]}
            scale={[0.055, 1.35, 0.035]}
            color="#4b6147"
          />
        ))}
        {[-7.5, -3.8, 3.8, 7.5].map((x) => (
          <Box
            key={x}
            position={[x, 2.8, -5.08]}
            scale={[0.22, 5.6, 0.27]}
            color="#4c3828"
          />
        ))}
        <Box
          position={[0, 4.87, -5.0]}
          scale={[17, 0.33, 0.37]}
          color="#4a3324"
        />
        <Window position={[-5.7, 3.06, -5.08]} />
        <Window position={[5.7, 3.06, -5.08]} />
        <Frame
          position={[0, 3.27, -5.08]}
          title="THE TURF"
          subtitle="A FINE PLACE FOR A BAD BEAT"
          wide={2.7}
        />
        <Sconce position={[-2.3, 3.28, -5.04]} />
        <Sconce position={[2.3, 3.28, -5.04]} />
        <Shelf position={[-2.15, 1.91, -5.03]} />
        <Shelf position={[2.15, 1.91, -5.03]} />
        <PubClock />
        <Candle position={[-0.92, 1.96, -4.96]} />
        <Candle position={[0.94, 1.96, -4.96]} />
        <group position={[3.18, 2.98, -4.85]}>
          <Box scale={[0.51, 0.82, 0.045]} color="#614632" />
          <PrintedPlane
            lines={["THE RIVER", "IS NOT", "YOUR MATE"]}
            width={0.45}
            height={0.75}
            position={[0, 0, 0.028]}
            color="#d9c798"
            background="#364b38"
          />
        </group>
        <Frame
          position={[-7.08, 2.6, -5.03]}
          title="NO WHINING"
          subtitle="THE RIVER OWES YOU NOTHING"
          wide={0.85}
        />
        <Frame
          position={[7.08, 2.76, -5.03]}
          title="OXFORD"
          subtitle="EST. A VERY LONG TIME AGO"
          wide={0.87}
        />
      </CutawayWall>
      <Ceiling>
        {[-5, 0, 5].map((x) => (
          <Box
            key={x}
            position={[x, 5.35, -1]}
            scale={[0.24, 0.25, 9]}
            color="#4a3324"
          />
        ))}
      </Ceiling>
      <group position={[-6.95, 0.52, -3.25]}>
        <mesh>
          <cylinderGeometry args={[0.46, 0.33, 0.8, 16]} />
          <meshStandardMaterial color="#946848" roughness={0.85} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <group key={i} rotation={[0, i * 2.4, 0]}>
            <Ball
              position={[0.16, 0.55 + i * 0.045, 0.1]}
              scale={[0.16, 0.45, 0.09]}
              color={i % 2 ? "#4f6c3a" : "#6f7c3e"}
            />
          </group>
        ))}
      </group>
      <Ceiling>
        {[-2.6, 2.6].map((x) => (
          <Pendant key={x} position={[x, 4.78, -0.9]} />
        ))}
      </Ceiling>
    </group>
  );
}

function PenthouseRoom() {
  return (
    <group>
      <CutawayWall axis="z" edge={-4.85} insidePositive>
        <Box
          position={[0, 2.75, -5.35]}
          scale={[17, 5.5, 0.2]}
          color="#253942"
        />
        {[-6, -3, 0, 3, 6].map((x) => (
          <group key={x}>
            <Window position={[x, 3.22, -5.15]} width={2.63} fancy />
            <Box
              position={[x - 1.4, 2.75, -5.05]}
              scale={[0.04, 5.5, 0.04]}
              color="#c5ab73"
              metalness={0.6}
            />
          </group>
        ))}
        {Array.from({ length: 20 }, (_, i) => (
          <Box
            key={i}
            position={[(i - 10) * 0.78, 1.64, -5.02]}
            scale={[0.37, 0.6 + (i % 4) * 0.31, 0.025]}
            color={i % 2 ? "#b1a576" : "#466375"}
          />
        ))}
        <Box
          position={[0, 1.43, -5.0]}
          scale={[17, 0.04, 0.07]}
          color={GOLD}
          metalness={0.7}
        />
        <Box
          position={[0, 0.7, -5.07]}
          scale={[17, 1.36, 0.12]}
          color="#253d3d"
        />
        <Frame
          position={[0, 3.1, -4.9]}
          title="THE HIGH LIFE"
          subtitle="CHAMPAGNE TASTE. PLAY-MONEY BUDGET."
          wide={2.4}
        />
      </CutawayWall>
      {[-5.8, 5.8].map((x) => (
        <group key={x} position={[x, 0, -3.6]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.12, 28]} />
            <meshStandardMaterial
              color={GOLD}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          <Box
            position={[0, 1.45, 0]}
            scale={[0.045, 2.8, 0.045]}
            color={GOLD}
            metalness={0.7}
          />
          <mesh position={[0, 2.75, 0]}>
            <cylinderGeometry args={[0.32, 0.5, 0.63, 24]} />
            <meshStandardMaterial
              color="#e8d9b3"
              emissive="#b79156"
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>
      ))}
      <Ceiling>
        <Pendant position={[-2.1, 4.78, -0.8]} fancy />
        <Pendant position={[2.1, 4.78, -0.8]} fancy />
      </Ceiling>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 6.8, 1.07, -4.1]}>
          <Box scale={[1.7, 0.18, 1.1]} color="#b7a478" metalness={0.3} />
          <Box
            position={[0, -0.5, 0]}
            scale={[0.05, 0.95, 0.7]}
            color={GOLD}
            metalness={0.65}
          />
          <Ball
            position={[0, 0.35, 0]}
            scale={[0.27, 0.3, 0.27]}
            color="#cdb479"
            metalness={0.65}
            roughness={0.22}
          />
          {[-0.2, 0, 0.2].map((x, i) => (
            <Ball
              key={i}
              position={[x, 0.67 + i * 0.1, 0]}
              scale={[0.15, 0.19, 0.16]}
              color="#e0bdb2"
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function ShedRoom() {
  return (
    <group>
      <CutawayWall axis="z" edge={-4.95} insidePositive>
        <Box
          position={[0, 2.65, -5.35]}
          scale={[17, 5.3, 0.15]}
          color="#a38d65"
        />
        {Array.from({ length: 26 }, (_, i) => (
          <Box
            key={i}
            position={[(i - 13) * 0.65, 2.65, -5.22]}
            scale={[0.018, 5.3, 0.02]}
            color="#70603f"
          />
        ))}
        <Box
          position={[0, 1.2, -5.12]}
          scale={[17, 0.13, 0.12]}
          color="#796041"
        />
        <Box
          position={[0, 4.7, -5.12]}
          scale={[17, 0.16, 0.16]}
          color="#796041"
        />
        <Window position={[-4.9, 2.95, -5.05]} width={2} />
        <Frame
          position={[0, 3, -5.09]}
          title="THE GARDEN SHED"
          subtitle="IF ANYONE ASKS, WE ARE FIXING THE MOWER."
          wide={3.2}
        />
        <PrintedPlane
          lines={["LIVE. LAUGH.", "LOSE ON THE RIVER."]}
          width={1.5}
          height={1}
          position={[3.43, 3, -5.02]}
          color="#594f38"
          background="#e0d0a7"
        />
      </CutawayWall>
      <Box
        position={[-5.6, 0.85, -4.2]}
        scale={[2.5, 0.15, 0.9]}
        color="#715636"
      />
      <Shelf position={[-5.4, 0.94, -4.1]} />
      <mesh position={[5.1, 0.6, -3.9]}>
        <cylinderGeometry args={[0.6, 0.6, 1.1, 16]} />
        <meshStandardMaterial
          color="#707b65"
          metalness={0.5}
          roughness={0.65}
        />
      </mesh>
      <PrintedPlane
        lines={["ABSOLUTELY", "NOT A BIN"]}
        width={0.85}
        height={0.45}
        position={[5.1, 0.68, -3.28]}
        color="#e5ddbd"
      />
      <Ceiling>
        <group position={[0.2, 4.7, -0.3]}>
          <Box
            position={[0, 0.7, 0]}
            scale={[0.025, 1.4, 0.025]}
            color="#454935"
          />
          <Ball scale={[0.16, 0.24, 0.16]} color="#f6e2a7" />
        </group>
      </Ceiling>
      {Array.from({ length: 13 }, (_, i) => (
        <group
          key={i}
          position={[(i - 6) * 0.9, 4.1 + Math.abs(i - 6) * 0.06, -4.6]}
        >
          <Ball
            scale={[0.065, 0.085, 0.065]}
            color={i % 3 ? "#e6c880" : "#a6b88c"}
          />
          <Box
            position={[0.45, 0.025, 0]}
            scale={[0.9, 0.016, 0.018]}
            color="#46503a"
          />
        </group>
      ))}
    </group>
  );
}

const Room = memo(function Room({ theme }: { theme: string }) {
  const fancy = theme === "penthouse";
  const shed = theme === "shed" || theme === "basement";
  return (
    <>
      <StudioEnvironment />
      <color attach="background" args={[fancy ? "#354343" : "#75674d"]} />
      <fog attach="fog" args={[fancy ? "#354343" : "#75674d", 19, 36]} />
      <ambientLight intensity={0.85} color="#f4ddaf" />
      <hemisphereLight args={["#ffecc7", "#374732", 1.35]} />
      <directionalLight
        position={[3, 7, 5]}
        intensity={2.5}
        color="#ffe4b5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={0.5}
        shadow-camera-far={23}
        shadow-normalBias={0.025}
        shadow-bias={-0.0002}
      />
      <directionalLight
        position={[-5, 4, -4]}
        intensity={1.15}
        color={fancy ? "#a3cad8" : "#efc67d"}
      />
      <pointLight
        position={[0, 4, -1]}
        intensity={22}
        distance={12}
        color="#f3d49c"
      />
      <pointLight
        position={[-5, 3, -4]}
        intensity={13}
        distance={8}
        color="#f4b565"
      />
      <pointLight
        position={[5, 3, -4]}
        intensity={13}
        distance={8}
        color="#f4b565"
      />
      <Box
        position={[0, -0.09, 0]}
        scale={[22, 0.15, 20]}
        color={fancy ? "#5a6255" : shed ? "#696d53" : "#796145"}
      />
      {!fancy &&
        Array.from({ length: 27 }, (_, i) => (
          <Box
            key={i}
            position={[(i - 13) * 0.68, 0.001, 0]}
            scale={[0.013, 0.008, 20]}
            color={shed ? "#565b46" : "#66503b"}
          />
        ))}
      {fancy &&
        Array.from({ length: 15 }, (_, i) => (
          <Box
            key={i}
            position={[(i - 7) * 1.5, 0.001, 0]}
            scale={[0.016, 0.006, 20]}
            rotation={[0, 0.28, 0]}
            color="#92957c"
          />
        ))}
      <CutawayWall axis="z" edge={5.65} insidePositive={false}>
        <SupportingWall
          position={[0, 0, 5.95]}
          rotation={[0, Math.PI, 0]}
          width={16.5}
          theme={theme}
        />
      </CutawayWall>
      <CutawayWall axis="x" edge={-7.85} insidePositive>
        <SupportingWall
          position={[-8.15, 0, 0.25]}
          rotation={[0, Math.PI / 2, 0]}
          width={11.35}
          theme={theme}
        />
      </CutawayWall>
      <CutawayWall axis="x" edge={7.85} insidePositive={false}>
        <SupportingWall
          position={[8.15, 0, 0.25]}
          rotation={[0, -Math.PI / 2, 0]}
          width={11.35}
          theme={theme}
        />
      </CutawayWall>
      {fancy ? <PenthouseRoom /> : shed ? <ShedRoom /> : <PubRoom />}
    </>
  );
});

function CameraRig({
  mode,
  players,
  heroId,
  currentPlayerId,
  peeking = false,
}: {
  mode: string;
  players: ScenePlayer[];
  heroId?: string;
  currentPlayerId?: string;
  peeking?: boolean;
}) {
  const { camera, size } = useThree();
  const initialized = useRef(false);
  const cinematicReady = useRef(false);
  const lastShot = useRef("");
  const goalPosition = useMemo(() => new Vector3(), []),
    goalTarget = useMemo(() => new Vector3(), []);
  const controls = useRef<CameraControlsImpl>(null);
  const firstPerson = useMemo(() => new FirstPersonMotion(), []);
  const inward = useMemo(() => new Vector3(), []);
  useFrame(({ clock }, delta) => {
    const fromSeat = mode === 'first-person' || mode === 'firstPerson';
    camera.userData.focusActor = mode === "follow" || fromSeat ? currentPlayerId : undefined;
    if (!controls.current) return;
    if (!fromSeat) firstPerson.reset();
    if (mode === "free") {
      lastShot.current = "free";
      return;
    }
    const aspect = size.width / size.height,
      zoom = Math.max(1, (size.width < 620 ? 0.9 : 1.18) / aspect);
    const activeIndex = players.findIndex((p) => p.id === currentPlayerId);
    let fov = size.width < 620 ? 48 : 39;
    if (mode === "follow" && activeIndex >= 0) {
      const seat = seatPosition(
        players[activeIndex].seat ?? activeIndex,
        players.length,
      ).position;
      inward.set(-seat[0], 0, -seat[2]).normalize();
      goalPosition.set(seat[0] + inward.x * 4.2, 2.9, seat[2] + inward.z * 4.2);
      goalTarget.set(seat[0], 2.05, seat[2]);
      fov = 51;
    } else if (mode === 'showdown') {
      // Frame the whole table with room for seat labels. Portrait screens look
      // along the long axis so twelve hands don't collapse into a tiny oval.
      const portrait = size.height > size.width;
      const width = portrait ? 7.6 : 10.8, height = portrait ? 11.5 : size.height < 420 ? 5.4 : 8.1;
      fov = 39;
      const distance = Math.max(height, width / aspect) / (2 * Math.tan(fov * Math.PI / 360));
      goalPosition.set(portrait ? 0.18 : 0, FELT_Y + distance, portrait ? 0 : 0.18);
      goalTarget.set(0, FELT_Y, 0);
    } else if (mode === "overhead") {
      goalPosition.set(0, 15 * zoom, 0.2);
      goalTarget.set(0, 0, 0);
    } else if (fromSeat) {
      const heroIndex = Math.max(
        0,
        players.findIndex((p) => p.id === heroId),
      );
      const shot = firstPersonShot(players[heroIndex]?.seat ?? heroIndex,
        activeIndex >= 0 ? players[activeIndex].seat ?? activeIndex : undefined);
      goalPosition.copy(shot.position);
      goalTarget.copy(shot.target);
      if (peeking) goalTarget.copy(privateCardLookTarget(players[heroIndex]?.seat ?? heroIndex));
      fov = peeking ? (size.width < 620 ? 70 : 48) : 72;
    } else if (mode === "cinematic") {
      const t = clock.elapsedTime * 0.045;
      goalPosition.set(
        Math.sin(t) * 11.7 * zoom,
        5.7 * zoom,
        Math.cos(t) * 11.7 * zoom,
      );
      goalTarget.set(0, 1.55, 0);
    } else {
      goalPosition.set(1.1 * zoom, 5.9 * zoom, 11.7 * zoom);
      goalTarget.set(0, 1.6, -0.1);
    }
    const shot = `${mode}:${mode === "follow" ? currentPlayerId : mode.startsWith("first") ? heroId : ""}:${size.width}:${size.height}`;
    if (fromSeat) {
      firstPerson.update(controls.current, camera, goalPosition, goalTarget, delta, !initialized.current);
      lastShot.current = shot;
      initialized.current = true;
    } else if (shot !== lastShot.current) {
      // One critically damped controller owns both scripted shots and manual orbit.
      // Only the very first frame is immediate; even automatic mode changes ease.
      cinematicReady.current = !initialized.current;
      moveToShot(
        controls.current,
        goalPosition,
        goalTarget,
        !initialized.current,
      );
      lastShot.current = shot;
      initialized.current = true;
    } else if (mode === "cinematic" && cinematicReady.current) {
      controls.current.azimuthAngle += Math.min(delta, 0.05) * 0.045;
    }
    if (camera instanceof PerspectiveCamera) {
      camera.fov = MathUtils.damp(camera.fov, fov, 3.5, Math.min(delta, 0.05));
      camera.updateProjectionMatrix();
    }
  }, -1.1);
  const action = CameraControlsImpl.ACTION;
  const free = mode === "free";
  return (
    <CameraControls
      ref={controls}
      smoothTime={CAMERA_SMOOTH_TIME}
      onRest={() => {
        cinematicReady.current = true;
      }}
      draggingSmoothTime={0.16}
      maxSpeed={CAMERA_MAX_SPEED}
      azimuthRotateSpeed={0.65}
      polarRotateSpeed={0.65}
      dollySpeed={0.7}
      minDistance={free ? 3 : 0.6}
      maxDistance={26}
      minPolarAngle={0.01}
      maxPolarAngle={Math.PI / 2.02}
      mouseButtons={{
        left: free ? action.ROTATE : action.NONE,
        middle: action.NONE,
        right: action.NONE,
        wheel: free ? action.DOLLY : action.NONE,
      }}
      touches={{
        one: free ? action.TOUCH_ROTATE : action.NONE,
        two: free ? action.TOUCH_DOLLY : action.NONE,
        three: action.NONE,
      }}
      makeDefault
    />
  );
}

function TurnHalo({ paused }: { paused: boolean }) {
  const glow = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (glow.current) {
      const pulse = paused ? 1 : 1 + Math.sin(clock.elapsedTime * 4) * 0.025;
      glow.current.scale.set(pulse, pulse, pulse);
    }
  });
  return (
    <group>
      <mesh ref={glow} position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.72, 48]} />
        <meshBasicMaterial
          color={paused ? "#9c9a77" : "#f7cb6d"}
          transparent
          opacity={0.8}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 1.409, 0.95]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.405, 40]} />
        <meshBasicMaterial
          color={paused ? "#9c9a77" : "#f7cb6d"}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
function HouseDealer({
  motions,
  effectNow,
  theme,
}: {
  motions: TableMotion[];
  effectNow?: number;
  theme: string;
}) {
  return (
    <group position={[0, 0, -3.08]}>
      <Chair theme={theme} />
      <CartoonAvatar
        character={DEALER_CHARACTER}
        actorKey="dealer"
        seed={19}
        dealer
        effectNow={effectNow}
        dealerMotion={[...motions]
          .reverse()
          .find(
            (m) =>
              (m.type === "hand-start" || m.type === "street") &&
              m.startAt <= (effectNow ?? Date.now()),
          )}
      />
      <group position={[0, 1.396, 1.02]}>
        <RoundedBox args={[1.1, 0.055, 0.47]} radius={0.04}>
          <meshStandardMaterial color="#1f302a" roughness={0.75} />
        </RoundedBox>
        <ChipStack position={[-0.31, 0.04, 0]} count={3} color="#c54b48" />
        <ChipStack position={[0, 0.04, 0]} count={3} color="#c4aa68" />
        <ChipStack position={[0.31, 0.04, 0]} count={3} color="#758ea1" />
        <Card position={[0.89, 0.026, 0.05]} rotation={[0, 0.06, 0]} />
        <Card position={[0.89, 0.053, 0.05]} rotation={[0, 0.09, 0]} />
      </group>
    </group>
  );
}
function SceneContents({
  players,
  heroCards = [],
  peeking = false,
  board = [],
  onPeekStart,
  pot = 0,
  currentPlayerId,
  followPlayerId,
  playerSpeech,
  dealerIndex = 0,
  roomTheme = "turf",
  cameraMode = "table",
  heroId,
  onSeatClick,
  handNumber = 0,
  turnRemaining = 0,
  turnProgress = 0,
  paused = false,
  dealerSpeech,
  motions = [],
  effectNow,
  soundEffects = false,
  settled = false,
  focusTable = false,
  showdown = null,
}: PokerSceneProps) {
  const { size } = useThree();
  const boardRotation = cameraMode === 'showdown' && size.height > size.width ? Math.PI / 2 : 0;
  const pointOfViewId = players.some((p) => p.id === heroId)
    ? heroId
    : players[0]?.id;
  const occupiedSeats = new Set(
    players.map((player, index) => player.seat ?? index),
  );
  const hero = players.find(player => player.id === heroId);
  return (
    <>
      <Room theme={roomTheme} />
      <PokerTable
        board={board}
        pot={pot}
        motions={motions}
        effectNow={effectNow}
        settled={settled}
        boardRotation={boardRotation}
      />
      <HouseDealer motions={motions} effectNow={effectNow} theme={roomTheme} />
      <TableEffects players={players} motions={motions} effectNow={effectNow} layoutRotation={boardRotation} />
      {[0, 1, 2, 3, 4, 5]
        .filter((seat) => !occupiedSeats.has(seat))
        .map((seat) => {
          const { position, rotation } = seatPosition(seat, 6);
          return (
            <group
              key={`empty-${seat}`}
              position={position}
              rotation={rotation}
            >
              <Chair theme={roomTheme} />
            </group>
          );
        })}
      {players.slice(0, 12).map((player, index) => (
        <PlayerSeat
          key={player.id}
          player={
            playerSpeech?.actor === player.id
              ? { ...player, spokenLine: playerSpeech.text }
              : player
          }
          index={index}
          count={players.length}
          active={player.id === currentPlayerId}
          dealer={index === dealerIndex}
          hero={player.id === heroId}
          theme={roomTheme}
          hideAvatar={
            (cameraMode === "first-person" || cameraMode === "firstPerson") &&
            player.id === pointOfViewId
          }
          privateCards={player.id === heroId && (cameraMode === 'first-person' || cameraMode === 'firstPerson') ? heroCards : undefined}
          cardsTabled={!!showdown?.seats.some(seat => seat.id === player.id)}
          onPeekStart={player.id === heroId ? onPeekStart : undefined}
          onClick={onSeatClick}
          remaining={turnRemaining}
          progress={turnProgress}
          paused={paused}
          motions={motions}
          effectNow={effectNow}
          soundEffects={soundEffects && !paused}
          showLabel={
            !(cameraMode === "follow" && (followPlayerId || currentPlayerId))
          }
        />
      ))}
      {showdown && <ShowdownReveal presentation={showdown} portrait={boardRotation !== 0} />}
      <CameraRig
        mode={cameraMode}
        players={players}
        heroId={heroId}
        currentPlayerId={focusTable ? undefined : followPlayerId ?? currentPlayerId}
        peeking={peeking && !!hero}
      />
    </>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          padding: 32,
          color: "#eee1bc",
          textAlign: "center",
          background: "#314c3a",
        }}
      >
        The 3D table needs WebGL. Enable hardware acceleration in your browser
        to bring the gang to life.
      </div>
    ) : (
      this.props.children
    );
  }
}

/** Self-contained responsive canvas. Parent supplies a sized container. */
export function PokerScene(props: PokerSceneProps) {
  return (
    <SceneBoundary>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.65]}
        camera={{ position: [5.2, 7.9, 10.8], fov: 35, near: 0.1, far: 55 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <FrameBudget />
        {props.onRenderStats && <RenderStats onStats={props.onRenderStats} />}
        <MaterialLibrary>
          <SceneContents {...props} />
        </MaterialLibrary>
      </Canvas>
    </SceneBoundary>
  );
}

function PortraitContents({
  avatar,
  emote,
}: {
  avatar: string;
  emote?: string;
  emoteAt?: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 2.3, 0);
  }, [camera]);
  return (
    <>
      <StudioEnvironment />
      <color attach="background" args={["#889b80"]} />
      <ambientLight intensity={1.2} color="#f2e8cc" />
      <hemisphereLight args={["#fff3d6", "#536b50", 1.3]} />
      <directionalLight
        position={[-3, 5, 4]}
        intensity={3}
        color="#ffecd0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[3, 3, -2]} intensity={2} color="#d8e6ca" />
      <group rotation={[0, -0.12, 0]}>
        <CartoonAvatar
          character={
            avatar === "dealer" ? DEALER_CHARACTER : getCharacter(avatar)
          }
          emote={emote}
          hasCards={false}
          effectNow={emote ? undefined : 0}
        />
      </group>
    </>
  );
}

/** Large, front-facing wardrobe preview, using the exact same live-table rig. */
export function CharacterPortrait({
  avatar,
  emote,
}: {
  avatar: string;
  emote?: string;
  emoteAt?: number;
}) {
  return (
    <SceneBoundary>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.65]}
        camera={{ position: [0, 2.45, 3.3], fov: 35, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <FrameBudget />
        <MaterialLibrary>
          <PortraitContents avatar={avatar} emote={emote} />
        </MaterialLibrary>
      </Canvas>
    </SceneBoundary>
  );
}

export default PokerScene;
