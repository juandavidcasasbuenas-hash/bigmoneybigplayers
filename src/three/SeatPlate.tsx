import { Html } from "@react-three/drei";
import type { CSSProperties } from "react";
import type { SeatHud } from "../../shared/seatHud";
import { FELT_Y } from "./contactMotion";

const n = (v: number) => v.toLocaleString("en-GB");

/**
 * A broadcast-style nameplate on the rail in front of each player: who they
 * are, what they have behind, what they just did and whose clock is running.
 */
export function SeatPlate({
  name,
  hud,
  hero,
  acting,
  progress,
  seconds,
  paused,
  onClick,
}: {
  name: string;
  hud: SeatHud;
  hero: boolean;
  acting: boolean;
  progress: number;
  seconds: number;
  paused: boolean;
  onClick?: () => void;
}) {
  const stack = hud.stack;
  const urgent = acting && !paused && seconds <= 5;
  const classes = [
    "seat-plate",
    hero && "hero",
    acting && "acting",
    urgent && "urgent",
    hud.folded && "folded",
    hud.allIn && "all-in",
    hud.tag?.tone === "win" && "winner",
    hud.away && "away",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
    {hud.bet > 0 && (
      <Html center position={[0, FELT_Y + 0.03, 2.05]} zIndexRange={[5, 1]} style={{ pointerEvents: "none" }}>
        <span className="seat-bet" aria-hidden="true">
          <i />
          {n(hud.bet)}
        </span>
      </Html>
    )}
    <Html
      center
      position={[0, FELT_Y + 0.02, 1.2]}
      zIndexRange={[5, 1]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className={classes}
        style={{ "--turn": progress } as CSSProperties}
        onClick={onClick}
        aria-label={`${hero ? "You" : name}, ${n(stack)} chips${hud.bet ? `, bet ${n(hud.bet)}` : ""}${hud.tag ? `, ${hud.tag.text}` : ""}${acting ? ", to act" : ""}`}
      >
        <div className="seat-plate-body">
          <span className="seat-text">
            <strong>{hero ? "You" : name}</strong>
            <em>{stack > 0 ? n(stack) : hud.allIn ? "All in" : "0"}</em>
          </span>
          {acting && <b className="seat-clock">{seconds}</b>}
          {acting && <span className="seat-timer" aria-hidden="true" />}
          {(hud.dealer || hud.smallBlind || hud.bigBlind) && (
            <span className="seat-badges">
              {hud.dealer && <b className="seat-badge d" title="Dealer button">D</b>}
              {hud.smallBlind && <b className="seat-badge sb" title="Small blind">SB</b>}
              {hud.bigBlind && <b className="seat-badge bb" title="Big blind">BB</b>}
            </span>
          )}
        </div>
        {hud.tag && !(hud.allIn && hud.tag.tone === "all-in" && stack === 0) ? (
          <span className={`seat-tag ${hud.tag.tone}`}>{hud.tag.text}</span>
        ) : hud.away ? (
          <span className="seat-tag fold">Away</span>
        ) : null}
      </div>
    </Html>
    </>
  );
}
