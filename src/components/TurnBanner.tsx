import type { TurnFeedback } from "../hooks/useTableFeedback";
export function TurnBanner({ cue }: { cue: TurnFeedback }) {
  if (!cue.live) return null;
  const label = !cue.connected
    ? "Reconnecting…"
    : cue.paused
      ? "Table paused"
      : cue.myTurn
        ? "Your turn"
        : `${cue.player!.name}'s turn`;
  return (
    <div
      className={`turn-banner ${cue.myTurn ? "is-yours" : ""} ${cue.urgent ? "is-urgent" : ""}`}
      data-own-turn={cue.myTurn}
      data-actor={cue.player!.name}
    >
      <div
        className="turn-clock"
        aria-label={`${cue.seconds} ${cue.seconds === 1 ? "second" : "seconds"} remaining`}
      >
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="24" />
          <circle
            className="turn-clock-progress"
            cx="28"
            cy="28"
            r="24"
            strokeDasharray={150.8}
            strokeDashoffset={150.8 * (1 - cue.progress)}
          />
        </svg>
        <b>{cue.paused ? "Ⅱ" : cue.seconds}</b>
      </div>
      <div>
        <strong role="status" aria-live="polite">
          {label}
        </strong>
        <small>
          {!cue.connected
            ? "Restoring your seat"
            : cue.paused
              ? "The clock is stopped"
              : cue.myTurn
                ? "The table is waiting for you."
                : "Thinking. Allegedly."}
        </small>
      </div>
    </div>
  );
}
