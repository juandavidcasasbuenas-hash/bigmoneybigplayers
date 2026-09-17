import type { RoomState } from "../../shared/types";
import type { TablePresentation } from "../hooks/useTablePresentation";
import { getCharacter } from "../data/characters";

export function HandFlow({
  room,
  flow,
  now,
}: {
  room: RoomState;
  flow: TablePresentation;
  now: number;
}) {
  if (room.stage === "lobby") return null;
  const stage = flow.settled
    ? "result"
    : flow.board.length === 5
      ? "river"
      : flow.board.length === 4
        ? "turn"
        : flow.board.length >= 3
          ? "flop"
          : "preflop";
  const steps = ["preflop", "flop", "turn", "river", "result"];
  const newHand = flow.active?.type === "hand-start";
  const street = flow.active?.type === "street" ? flow.active.stage : null;
  const champion = room.stage === "finished" && flow.settled;
  const countdown = room.nextHandAt
    ? Math.max(
        0,
        Math.ceil(
          (room.nextHandAt - (room.paused ? (room.pausedAt ?? now) : now)) /
            1000,
        ),
      )
    : null;
  const winner =
    room.winners.length === 1
      ? room.players.find((p) => p.id === room.winners[0].playerId)
      : null;
  const action = flow.latestAction;
  const actor =
    action && "playerId" in action
      ? room.players.find((p) => p.id === action.playerId)
      : null;
  return (
    <>
      <ol className="hand-phase-track" aria-label="Hand progress">
        {steps.map((step, i) => (
          <li
            key={step}
            className={
              i === steps.indexOf(stage)
                ? "current"
                : i < steps.indexOf(stage)
                  ? "complete"
                  : ""
            }
            aria-current={step === stage ? "step" : undefined}
          >
            {step === "preflop" ? "Deal" : step === "result" ? "Result" : step}
          </li>
        ))}
      </ol>
      {newHand ? (
        <div className="hand-milestone new-hand" role="status">
          <span className="milestone-icon">♠</span>
          <div>
            <small>FRESH CARDS · FRESH START</small>
            <strong>
              New hand <em>#{room.handNumber}</em>
            </strong>
            <p>Shuffling up. Two cards each.</p>
          </div>
        </div>
      ) : flow.settled ? (
        <div
          className={`hand-milestone hand-result ${champion ? "is-champion" : ""}`}
          role="status"
        >
          {winner ? (
            <img src={getCharacter(winner.avatarId).portrait} alt="" />
          ) : (
            <span className="milestone-icon">♣</span>
          )}
          <div>
            <small>{champion ? "TOURNAMENT COMPLETE" : "HAND COMPLETE"}</small>
            <strong>
              {champion
                ? `${winner?.name || "Your champion"} wins it!`
                : winner
                  ? `${winner.name} takes the pot`
                  : room.pots.length > 1
                    ? "Pots settled. Chips shared."
                    : "Split pot. Shared glory."}
            </strong>
            <p>
              {room.winners
                .map(
                  (w) =>
                    `${room.winners.length > 1 ? `${room.players.find((p) => p.id === w.playerId)?.name}: ` : ""}+${w.amount.toLocaleString()} chips`,
                )
                .join(" · ")}
              <span>
                {" "}
                · {winner ? room.winners[0].hand : "The pot is divided"}
              </span>
            </p>
            <div className="next-hand-cue">
              {champion
                ? "Bragging rights secured."
                : room.paused
                  ? "Table paused"
                  : countdown !== null
                    ? `Next hand in ${countdown}s`
                    : "Waiting for the host to deal"}
              {!champion && countdown !== null && !room.paused && (
                <i
                  style={{
                    width: `${Math.min(100, (countdown / room.settings.nextHandSeconds) * 100)}%`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : street ? (
        <div className="hand-milestone street-cue" role="status">
          <span className="milestone-icon">
            {street === "flop" ? "Ⅲ" : street === "turn" ? "Ⅳ" : "Ⅴ"}
          </span>
          <div>
            <small>
              {street === "flop"
                ? "THREE COMMUNITY CARDS"
                : street === "turn"
                  ? "FOURTH COMMUNITY CARD"
                  : "FIFTH & FINAL CARD"}
            </small>
            <strong>The {street}</strong>
            <p>
              {flow.pendingAward
                ? street === "river"
                  ? "Final card. Showdown next."
                  : "All in. Running out the board."
                : street === "river"
                  ? "Last betting round."
                  : "A new betting round begins."}
            </p>
          </div>
        </div>
      ) : null}
      {action && actor && !flow.active && !flow.settled && (
        <div className="table-action-cue" key={action.id} role="status">
          <b>{actor.name}</b>{" "}
          {action.type === "bet"
            ? `${action.action === "all-in" ? "goes all in ·" : action.action === "call" ? "calls ·" : action.action === "raise" ? "raises to" : "bets"} ${(action.action === "raise" ? action.to : action.amount).toLocaleString()} chips`
            : action.type === "fold"
              ? "folds"
              : "checks"}
        </div>
      )}
    </>
  );
}
