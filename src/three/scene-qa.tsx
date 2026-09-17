/** Dev-only Vite entry for repeatable model/camera/performance inspection. */
import { useCallback, useEffect, useState } from "react";
import "../styles.css";
import { createRoot } from "react-dom/client";
import { planTableMotions } from "../../shared/tableTimeline";
import type { TableEventData } from "../../shared/types";
import type { CardPeek } from '../../shared/cardPeek';
import { unlockTableAudio } from "../audio/tableAudio";
import { CHARACTERS } from "../data/characters";
import { RigQa } from "./RigQa";
import {
  CharacterPortrait,
  PokerScene,
  type SceneRenderStats,
} from "../components/PokerScene";

function SceneQa() {
  const params = new URLSearchParams(location.search);
  const [acting, setActing] = useState(0);
  const [peek, setPeek] = useState<CardPeek | null>(() => params.has('peek') ? {handNumber: 1, startedAt: Date.now() - 1000, releasedAt: null, from: 0} : null);
  const [started, setStarted] = useState(() => Date.now() + 1500);
  const [effectTime, setEffectTime] = useState<number | undefined>(() =>
    params.has("frame") ? started + Number(params.get("frame")) : undefined,
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, []);
  const choreography = params.get("choreography") === "1";
  const scripted: TableEventData[] = [
    {
      type: "hand-start",
      playerIds: Array.from({ length: 12 }, (_, i) => `qa-${i}`),
    },
    { type: "bet", playerId: "qa-0", amount: 500, to: 500, forced: false },
    { type: "check", playerId: "qa-1" },
    { type: "fold", playerId: "qa-2" },
    { type: "street", stage: "flop", board: ["As", "Kd", "7h"] },
    { type: "street", stage: "turn", board: ["As", "Kd", "7h", "5c"] },
    { type: "street", stage: "river", board: ["As", "Kd", "7h", "5c", "2d"] },
    {
      type: "award",
      winners: [{ playerId: "qa-0", amount: 4600, hand: "Two pair" }],
      pot: 4600,
    },
  ];
  const motions = choreography
    ? planTableMotions(
        scripted.map((e, i) => ({
          ...e,
          id: `qa-${started}-${i}`,
          sequence: i + 1,
          at: started,
          handNumber: 1,
        })),
        started,
      )
    : [];

  useEffect(() => {
    if (params.get("cycle") !== "1") return;
    const timer = setInterval(
      () => setActing((value) => (value + 1) % 12),
      5000,
    );
    return () => clearInterval(timer);
  }, []);
  const [stats, setStats] = useState<SceneRenderStats | null>(null);
  const capture = useCallback((value: SceneRenderStats) => {
    setStats(value);
    Object.assign(window, { __pokerSceneStats: value });
    const target = window as unknown as {
      __motionHistory?: SceneRenderStats[];
    };
    target.__motionHistory = [...(target.__motionHistory || []), value].slice(
      -30,
    );
  }, []);
  const portrait = params.get("portrait");
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: `qa-${i}`,
    name: CHARACTERS[i % 8].name + (i >= 8 ? " II" : ""),
    avatar: CHARACTERS[i % 8].id,
    stack: 10000 + i * 300,
    seat: i,
    status: i === 3 ? "folded" : "active",
    bet: i % 2 ? 200 : 0,
    emote: i === 0 ? params.get("emote") || undefined : undefined,
    peek: i === 0 ? peek : null,
  }));
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "#294735",
        fontFamily: "Arial,sans-serif",
      }}
    >
      {portrait ? (
        <CharacterPortrait
          avatar={portrait}
          emote={params.get("emote") || undefined}
        />
      ) : (
        <PokerScene
          players={players}
          motions={motions}
          effectNow={effectTime}
          settled={
            choreography &&
            (effectTime ?? Date.now()) >= motions.at(-1)!.startAt
          }
          board={["As", "Kd", "7h", "5c", "2d"]}
          pot={4600}
          heroId="qa-0"
          heroCards={['6h', '6c']}
          peeking={peek?.releasedAt === null}
          dealerIndex={7}
          currentPlayerId={`qa-${acting}`}
          handNumber={1}
          turnRemaining={21}
          turnProgress={0.7}
          cameraMode={params.get("camera") || "table"}
          roomTheme={params.get("room") || "turf"}
          onRenderStats={capture}
        />
      )}
      {!portrait && <button style={{position: 'fixed', top: 12, right: 12, zIndex: 50}}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPeek({handNumber: 1, startedAt: Date.now(), releasedAt: null, from: 0}); }}
        onPointerUp={() => setPeek(p => p ? {...p, releasedAt: Date.now()} : p)}
      >Hold to peek</button>}
      {choreography && (
        <nav
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 40,
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              void unlockTableAudio();
              setEffectTime(undefined);
              setStarted(Date.now() + 400);
            }}
          >
            Replay choreography
          </button>
          <button
            onClick={() =>
              setEffectTime((value) =>
                value === undefined ? Date.now() : undefined,
              )
            }
          >
            Freeze frame
          </button>
        </nav>
      )}
      {stats && (
        <output
          data-testid="render-stats"
          style={{
            position: "fixed",
            bottom: 12,
            left: 12,
            color: "#e7ddbf",
            background: "#183c2ddd",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            zIndex: 20,
          }}
        >
          {stats.fps} fps · {stats.drawCalls} draws ·{" "}
          {stats.triangles.toLocaleString()} triangles · {stats.textures}{" "}
          textures · {stats.geometries} geometries
        </output>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("rig") ? <RigQa /> : <SceneQa />,
);
