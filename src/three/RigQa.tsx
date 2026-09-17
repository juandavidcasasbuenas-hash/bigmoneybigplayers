/** Isolated contact inspection. Only imported by the dev-only scene-qa entry. */
import { useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Chair, PokerTable, RenderStats } from "../components/PokerScene";
import { getCharacter } from "../data/characters";
import { ToonAvatar } from "./ToonAvatar";
import { seatTransform, workZ } from "./contactMotion";
import { motionDuration, type TableMotion } from "../../shared/tableTimeline";
import type { TableEvent } from "../../shared/types";
import { useEffect } from "react";
import { TableEffects } from "./TableEffects";

function InspectionCamera({ view }: { view: string }) {
  const { camera } = useThree();
  useEffect(() => {
    const views: Record<string, number[]> = {
      side: [5.6, 1.85, 0.28],
      front: [0, 2.1, 5.6],
      hand: [-1.9, 2.35, 3.7],
      under: [3.6, 1.0, 2.2],
      back: [-4.2, 1.8, -3.0],
    };
    const p = views[view] || views.side;
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(
      0,
      view === "under" ? 0.7 : view === "side" || view === "front" ? 1.75 : 1.4,
      0.25,
    );
  }, [view, camera]);
  return (
    <OrbitControls
      target={[
        0,
        view === "under"
          ? 0.7
          : view === "side" || view === "front"
            ? 1.75
            : 1.4,
        0.25,
      ]}
    />
  );
}
export function RigQa() {
  const params = new URLSearchParams(location.search);
  const [action, setAction] = useState(params.get("action") || "idle");
  const [progress, setProgress] = useState(Number(params.get("p") || 0.5));
  const [view, setView] = useState(params.get("view") || "side");
  const [avatar, setAvatar] = useState(params.get("avatar") || "juan");
  const seat = Number(params.get("seat") || 0),
    depth = workZ(seat);
  const root = useMemo(() => {
    const t = seatTransform(seat);
    t.quaternion.invert();
    t.position.negate().applyQuaternion(t.quaternion);
    return t;
  }, [seat]);
  const emote = [
    "stand",
    "chips",
    "chip-roll",
    "chip-toss",
    "cheers",
    "laugh",
    "cry",
    "shush",
    "bluff",
  ].includes(action)
    ? action
    : undefined;
  const event = {
    type: action,
    id: "qa-action",
    sequence: 1,
    handNumber: 1,
    at: 20000,
    playerId: "contact-player",
    amount: 500,
    to: 500,
    forced: false,
    winners: [{ playerId: "contact-player", amount: 500 }],
    pot: 500,
  } as TableEvent;
  const activity = ["bet", "check", "fold", "award"].includes(action)
    ? ({
        ...event,
        startAt: 20000,
        duration: motionDuration(event),
      } as TableMotion)
    : undefined;
  const now =
    20000 +
    progress * (activity?.duration || (action === "stand" ? 1400 : 3100));
  return (
    <main style={{ height: "100vh", background: "#a7b09a" }}>
      <Canvas shadows camera={{ position: [3.5, 1.65, 0.28], fov: 44 }}>
        <color attach="background" args={["#87947d"]} />
        <ambientLight intensity={1.5} />
        <hemisphereLight args={["#fff1d9", "#657653", 1.5]} />
        <directionalLight
          position={[-3, 6, 4]}
          intensity={3.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-normalBias={0.01}
        />
        <directionalLight position={[3, 4, -2]} intensity={1.8} />
        <InspectionCamera view={view} />
        <RenderStats
          onStats={(stats) =>
            Object.assign(window, { __pokerSceneStats: stats })
          }
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#999a7c" roughness={1} />
        </mesh>
        <group position={root.position} quaternion={root.quaternion}>
          <PokerTable board={[]} pot={0} />
          {activity && (
            <TableEffects
              players={[
                {
                  id: "contact-player",
                  name: "QA",
                  avatar,
                  stack: 10000,
                  seat,
                },
              ]}
              motions={[activity]}
              effectNow={now}
            />
          )}
        </group>
        <Chair theme="turf" emote={emote} emoteAt={20000} effectNow={now} />
        <ToonAvatar
          character={getCharacter(avatar)}
          actorKey="contact-player"
          emote={emote}
          emoteAt={20000}
          effectNow={now}
          hasCards={action !== "award"}
          activity={activity}
          seatIndex={seat}
          workDepth={depth}
        />
      </Canvas>
      <nav
        style={{
          position: "fixed",
          top: 10,
          left: 10,
          display: "flex",
          gap: 8,
          padding: 8,
          background: "#16352dee",
          color: "white",
          zIndex: 30,
        }}
      >
        <select
          aria-label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {[
            "idle",
            "bet",
            "check",
            "fold",
            "award",
            "stand",
            "chips",
            "chip-roll",
            "chip-toss",
            "cheers",
            "shush",
            "bluff",
            "laugh",
            "cry",
          ].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          aria-label="View"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          {["side", "front", "hand", "under", "back"].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          aria-label="Character"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
        >
          {[
            "juan",
            "jack",
            "nat",
            "diego",
            "clive",
            "doug",
            "humfrey",
            "tian",
          ].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <input
          aria-label="Motion progress"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
        />
        <output>{Math.round(progress * 100)}%</output>
      </nav>
    </main>
  );
}
