import { SEAT_PREFERENCE } from "../../shared/seats";
import {
  AudioLines,
  ChevronDown,
  Coins,
  DoorOpen,
  Eye,
  Fullscreen,
  Hand,
  MessageSquare,
  Music2,
  Pause,
  Play,
  Plus,
  Settings2,
  Smile,
  Spade,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeHand } from "../../shared/handOdds";
import type { Ack, Emote, RoomState } from "../../shared/types";
import { CHARACTERS, getCharacter } from "../data/characters";
import "../game.css";
import type { useDealerVoice } from "../hooks/useDealerVoice";
import { useHeadsUpOdds } from "../hooks/useHeadsUpOdds";
import type { TurnFeedback } from "../hooks/useTableFeedback";
import { useTableLog } from "../hooks/useTableLog";
import type { TablePresentation } from "../hooks/useTablePresentation";
import { PlayingCard } from "./PlayingCard";
import { canHoldPrivateCards, privateCardsReadyAt } from "../three/firstPersonHandState";
import { useCardPeek } from '../hooks/useCardPeek';
import { HandPositions } from "./HandPositions";
import { PreActionControls } from "./PreActionControls";
import { showdownPresentation } from '../three/showdownPresentation';
import PokerScene, { type ScenePlayer } from "./PokerScene";
const n = (v: number) => v.toLocaleString("en-GB");
const reactions: { id: Emote; label: string; icon: typeof Coins }[] = [
  { id: "chips", label: "Riffle", icon: Coins },
  { id: "chip-roll", label: "Roll", icon: Hand },
  { id: "chip-toss", label: "Toss", icon: Spade },
  { id: "bluff", label: "Bluff", icon: Spade },
  { id: "cheers", label: "Cheers", icon: Plus },
  { id: "laugh", label: "Laugh", icon: Smile },
  { id: "stand", label: "Stand", icon: DoorOpen },
  { id: "cry", label: "Disbelief", icon: Eye },
  { id: "shush", label: "Shush", icon: Hand },
];
type Props = {
  room: RoomState | null;
  players: ScenePlayer[];
  flow: TablePresentation;
  feedback: TurnFeedback;
  now: number;
  theme: string;
  camera: string;
  setCamera: (value: string) => void;
  voice: boolean;
  setVoice: (value: boolean) => void;
  sounds: boolean;
  setSounds: (value: boolean) => void;
  voiceMix: { dealer: number; players: number };
  setVoiceMix: (part: "dealer" | "players", value: number) => void;
  voiceApi: ReturnType<typeof useDealerVoice>;
  music: boolean;
  setMusic: (value: boolean) => void;
  musicLevel: number;
  setMusicLevel: (value: number) => void;
  busy: boolean;
  connected: boolean;
  send: (event: string, data?: unknown) => Promise<Ack>;
  onEmote: (id: Emote) => void;
  onHost: (practice: boolean) => void;
  onJoin: () => void;
  onSettings: () => void;
  onInvite: () => void;
  onLeave: () => void;
};
export function GameTable(p: Props) {
  const { room, players, flow, feedback, now } = p;
  const [panel, setPanel] = useState<"log" | "seats" | "audio" | null>(null),
    [raise, setRaise] = useState(0),
    [chat, setChat] = useState("");
  const logPane = useRef<HTMLDivElement>(null),
    stick = useRef(true);
  const me = room?.players.find((v) => v.id === room.you),
    host = !!room && room.hostId === room.you,
    actions = room?.actions;
  const seated =
    room?.players.filter((v) => v.seat >= 0 && v.status !== "spectator") || [];
  const log = useTableLog(room, now, p.voiceApi.error);
  const odds = useHeadsUpOdds(flow.motions, flow.board, now);
  const showdown = showdownPresentation(room, odds, flow.board, flow.settled, now);
  // Server settlement precedes the animated river. Awarded stacks must not
  // identify the winner while the public cards are still running out.
  const tablePlayers = flow.pendingAward ? players.map(player => ({...player, stack: Math.max(0, player.stack - (room?.winners.find(w => w.playerId === player.id)?.amount || 0))})) : players;
  const [dismissedReveal, setDismissedReveal] = useState<string | null>(null);
  const revealCamera = !!showdown && dismissedReveal !== showdown.key;
  const camera = revealCamera ? 'showdown' : p.camera;
  const ownHand = useMemo(
    () =>
      me?.holeCards.length
        ? describeHand([...me.holeCards, ...flow.board])
        : "",
    [me?.holeCards.join(""), flow.board.join("")],
  );
  const displayActor = players.find(
    (v) => v.id === (flow.focusActorId || room?.turnPlayerId),
  );
  const firstPerson = camera === 'first-person' || camera === 'firstPerson';
  const cardsOnFelt = firstPerson && ['preflop', 'flop', 'turn', 'river'].includes(room?.stage || '') && canHoldPrivateCards(me?.holeCards || [], me?.status);
  const canPeek = !!room && p.connected && !room.paused && ['preflop', 'flop', 'turn', 'river'].includes(room.stage)
    && canHoldPrivateCards(me?.holeCards || [], me?.status)
    && now >= privateCardsReadyAt(flow.motions, room.you)
    && !flow.motions.some(m => 'playerId' in m && m.playerId === room.you && !('forced' in m && m.forced) && now >= m.startAt && now < m.startAt + m.duration);
  const peek = useCardPeek(canPeek, `${room?.code}:${room?.handNumber}:${p.camera}`, room?.handNumber || 0, p.send);
  const seconds = room?.nextHandAt
    ? Math.max(0, Math.ceil((room.nextHandAt - now) / 1000))
    : null;
  const stage = room?.paused
    ? "Paused"
    : flow.settled
      ? room?.stage === "finished"
        ? "Tournament complete"
        : "Hand complete"
      : flow.active?.type === "hand-start"
        ? "Dealing"
        : odds
          ? "All in"
          : room?.stage || "Lobby";
  const readyToDeal = flow.award
    ? now >= Math.max(flow.award.startAt + flow.award.duration, room?.handReview?.endsAt || 0)
    : true;
  const choosingCards = !!room?.handReview && now >= room.handReview.startsAt && now < room.handReview.endsAt && (room.canShowCards || room.canMuckCards);
  const reviewSeconds = room?.handReview ? Math.max(0, Math.ceil((room.handReview.endsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (actions) setRaise(actions.minRaiseTo);
  }, [room?.turnId, actions?.minRaiseTo]);
  useEffect(() => {
    if (stick.current && logPane.current)
      logPane.current.scrollTop = logPane.current.scrollHeight;
  }, [log.at(-1)?.id, panel]);
  const toggle = (next: typeof panel) =>
    setPanel((value) => (value === next ? null : next));
  const voiceNotice =
    p.voiceApi.status === "error" ||
    p.voiceApi.status === "blocked" ||
    p.voiceApi.status === "unavailable";
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector(".app-shell")?.requestFullscreen();
    } catch {
      setPanel("audio");
    }
  };
  return (
    <section className="poker-game" aria-label="Poker table">
      <div className={`game-stage ${firstPerson ? 'first-person' : ''} ${showdown ? 'showdown-active' : ''}`}>
        <PokerScene
          players={tablePlayers}
          heroCards={me?.holeCards || []}
          peeking={peek.peeking}
          onPeekStart={peek.start}
          board={room?.board || []}
          pot={flow.pot}
          currentPlayerId={
            feedback.live ? room?.turnPlayerId || undefined : undefined
          }
          followPlayerId={flow.focusActorId || room?.turnPlayerId || undefined}
          dealerIndex={players.findIndex((v) => v.id === room?.dealerId)}
          roomTheme={p.theme}
          cameraMode={
            camera === "follow" && flow.focusTable ? "table" : camera
          }
          showdown={showdown}
          heroId={room?.you || "juan"}
          handNumber={room?.handNumber || 0}
          turnRemaining={feedback.seconds}
          turnProgress={feedback.progress}
          paused={room?.paused}
          motions={flow.motions}
          effectNow={room?.paused ? now : undefined}
          soundEffects={p.sounds && p.connected && !room?.paused}
          settled={flow.settled}
          focusTable={flow.focusTable}
          onSeatClick={() => setPanel("seats")}
          onRenderStats={
            import.meta.env.DEV &&
            new URLSearchParams(location.search).has("inspect")
              ? (stats) => {
                  const w = window as unknown as { __tableProbe?: unknown[] };
                  w.__tableProbe = [
                    ...(w.__tableProbe || []),
                    {
                      at: Date.now(),
                      ...stats,
                      focusName: players.find((v) => v.id === stats.focusActor)
                        ?.name,
                      nextName: feedback.player?.name,
                      turnLive: feedback.live,
                      action: flow.latestAction?.type,
                      voice: p.voiceApi.speaking?.actor,
                    },
                  ].slice(-60);
                }
              : undefined
          }
        />
        <div className="game-topbar">
          <div className="table-identity">
            <span className={`live-dot ${p.connected ? "online" : ""}`} />
            <strong>{room?.settings.name || "The Turf"}</strong>
            {room && (
              <button
                onClick={p.onInvite}
                title="Copy or share the table link"
                className="table-code"
              >
                {room.code}
              </button>
            )}
          </div>
          <div className="table-tools">
            <label className="camera-select">
              <Eye size={15} />
              <select
                aria-label="Camera"
                value={camera}
                onChange={(e) => {
                  if (e.target.value === 'showdown') setDismissedReveal(null);
                  else { setDismissedReveal(showdown?.key || null); p.setCamera(e.target.value); }
                }}
              >
                {showdown && <option value="showdown">Showdown</option>}
                <option value="follow">Follow turn</option>
                <option value="table">Table</option>
                <option value="first-person">My seat</option>
                <option value="overhead">Overhead</option>
                <option value="cinematic">Cinema</option>
                <option value="free">Free orbit</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <button
              className={panel === "seats" ? "selected" : ""}
              aria-label="Players"
              aria-expanded={panel === "seats"}
              onClick={() => toggle("seats")}
            >
              <Users size={18} />
              {room && <small>{seated.length}</small>}
            </button>
            <button
              className={panel === "log" ? "selected" : ""}
              aria-label="Chat and event log"
              aria-expanded={panel === "log"}
              onClick={() => toggle("log")}
            >
              <MessageSquare size={18} />
            </button>
            <button
              className={`${panel === "audio" ? "selected" : ""} ${voiceNotice ? "needs-attention" : ""}`}
              aria-label="Audio settings"
              aria-expanded={panel === "audio"}
              onClick={() => toggle("audio")}
            >
              <AudioLines size={18} />
            </button>
            <button
              aria-label="Toggle fullscreen table"
              onClick={() => void fullscreen()}
            >
              <Fullscreen size={18} />
            </button>
          </div>
        </div>
        {room && room.stage !== "lobby" && !showdown && (
          <HandPositions room={room} />
        )}
        {room && room.stage !== "lobby" && (
          <div className="round-status">
            <span>
              #{room.handNumber} <b>{stage}</b>
              {flow.settled && seconds !== null && (
                <small>Next {seconds}s</small>
              )}
            </span>
            {!flow.settled && (
              <strong>
                Pot <em>{n(flow.pot)}</em>
              </strong>
            )}
          </div>
        )}
        {room && !showdown && !flow.focusTable && !flow.settled && displayActor && (
          <div
            className={`actor-status ${feedback.myTurn ? "your-action" : ""}`}
          >
            <img src={getCharacter(displayActor.avatar).portrait} alt="" />
            <span>
              {displayActor.id === room.you ? "You" : displayActor.name}
            </span>
            {feedback.live ? (
              <b
                style={
                  {
                    "--turn-progress": `${feedback.progress * 100}%`,
                  } as React.CSSProperties
                }
              >
                {feedback.seconds}s
              </b>
            ) : (
              <small>
                {flow.latestAction?.type === "bet"
                  ? flow.latestAction.action || "Bet"
                  : flow.latestAction?.type}
              </small>
            )}
          </div>
        )}
        {!room && (
          <div className="table-entry">
            <h1>Take a seat.</h1>
            <button
              className="game-primary"
              disabled={!p.connected || p.busy}
              onClick={() => p.onHost(false)}
            >
              Host table
            </button>
            <button onClick={p.onJoin}>Join table</button>
            <button
              className="entry-practice"
              disabled={!p.connected || p.busy}
              onClick={() => p.onHost(true)}
            >
              <Play size={14} /> Practice
            </button>
          </div>
        )}
        {room?.stage === "lobby" && (
          <div className="table-entry lobby-entry">
            <h1>{seated.length} at the table</h1>
            <button className="game-primary" onClick={p.onInvite}>
              Invite friends
            </button>
            {host && (
              <>
                <button
                  disabled={p.busy || seated.length >= room.settings.maxPlayers}
                  onClick={() => void p.send("add-bot")}
                >
                  <Plus size={15} /> Add bot
                </button>
                <button
                  disabled={p.busy || seated.length < 2}
                  onClick={() => void p.send("start-game")}
                >
                  <Play size={15} /> Deal
                </button>
              </>
            )}
          </div>
        )}
        {showdown && <div className="showdown-footnote" role="status">
          {showdown.sidePots && <span>Main + side pots</span>}
          {showdown.allIn && showdown.split !== null && showdown.split > 0 && <span>Split {showdown.estimated ? '≈' : ''}{showdown.split.toFixed(1)}%</span>}
          <span className="sr-only">{showdown.settled ? 'Hand complete.' : showdown.allIn ? 'All in. Cards on the table.' : 'Showdown.'} {showdown.seats.filter(s => s.award).map(s => `${s.name} wins ${n(s.award)} chips.`).join(' ')}</span>
        </div>}
        {room && room.stage !== "lobby" && (
          <div className="cards-hud">
            {!(showdown?.seats.some(seat => seat.id === room.you && seat.cards.length === 2) && revealCamera) && <div
              className={`private-cards ${feedback.myTurn ? "your-action" : ""}`}
              aria-label="Your private hand"
            >
              {me?.holeCards.length ? (
                <>
                  <div className={`card-pair ${cardsOnFelt ? 'in-hand-summary' : ''}`}>
                    {me.holeCards.map((c) => (
                      <PlayingCard key={c} card={c} />
                    ))}
                  </div>
                  <div className="hand-value">
                    <strong>{ownHand}</strong>
                    <span>
                      {me.status === "folded" ? "Folded · " : ""}
                      {n(me.chips)} chips
                    </span>
                  </div>
                  {canPeek && <button
                    className={`peek-cards ${peek.peeking ? 'peeking' : ''}`}
                    aria-label="Hold to peek at your cards"
                    aria-pressed={peek.peeking}
                    title="Hold to peek at your cards (P)"
                    onPointerDown={event => {
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      peek.start();
                    }}
                    onPointerUp={peek.stop}
                    onPointerCancel={peek.stop}
                    onLostPointerCapture={peek.stop}
                    onBlur={peek.stop}
                    onContextMenu={event => event.preventDefault()}
                    onKeyDown={event => {
                      if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); if (!event.repeat) peek.start(); }
                    }}
                    onKeyUp={event => { if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); peek.stop(); } }}
                  ><Eye size={17}/><span>{peek.peeking ? 'Peeking' : 'Hold to peek'}</span><kbd>P</kbd></button>}
                </>
              ) : (
                <div className="hand-value">
                  <strong>
                    {me?.status === "waiting" ? "Next hand" : "Spectating"}
                  </strong>
                </div>
              )}
            </div>}
            {!!flow.board.length && !revealCamera && (
              <div className="community-hud" aria-label="Community cards">
                {Array.from({ length: 5 }, (_, i) =>
                  flow.board[i] ? (
                    <PlayingCard key={i} card={flow.board[i]} />
                  ) : (
                    <span className="card-slot" key={i} />
                  ),
                )}
              </div>
            )}
          </div>
        )}
        {panel && (
          <aside
            className={`game-drawer ${panel}`}
            aria-label={
              panel === "log"
                ? "Chat and event log"
                : panel === "seats"
                  ? "Players"
                  : "Audio settings"
            }
          >
            <div className="drawer-heading">
              <strong>
                {panel === "log"
                  ? "Table log"
                  : panel === "seats"
                    ? "Players"
                    : "Audio"}
              </strong>
              <button aria-label="Close panel" onClick={() => setPanel(null)}>
                <X size={18} />
              </button>
            </div>
            {panel === "log" && (
              <>
                <div
                  className="table-log"
                  ref={logPane}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    stick.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                  }}
                  role="log"
                  aria-live="polite"
                >
                  {log.map((item) => (
                    <div key={item.id} className={`log-item ${item.kind}`}>
                      <time>
                        {new Date(item.at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <p>
                        {item.name && <b>{item.name} </b>}
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chat.trim())
                      void p.send("chat", { text: chat }).then((ack) => {
                        if (ack.ok) setChat("");
                      });
                  }}
                >
                  <input
                    aria-label="Chat message"
                    placeholder={
                      me?.status === "spectator" || me?.status === "out"
                        ? "Rail chat…"
                        : "Message…"
                    }
                    value={chat}
                    maxLength={280}
                    onChange={(e) => setChat(e.target.value)}
                  />
                  <button
                    aria-label="Send chat"
                    disabled={!room || !chat.trim() || p.busy}
                  >
                    Send
                  </button>
                </form>
              </>
            )}
            {panel === "seats" && (
              <div className="seats-list">
                {(
                  room?.players ||
                  CHARACTERS.map((c, i) => ({
                    id: c.id,
                    name: c.name,
                    avatarId: c.id,
                    chips: 10000,
                    status: "preview",
                    isBot: false,
                    seat: SEAT_PREFERENCE[i],
                  }))
                ).map((v) => (
                  <div
                    key={v.id}
                    className={`seat-row ${v.id === room?.turnPlayerId && feedback.live ? "active" : ""}`}
                  >
                    <img src={getCharacter(v.avatarId).portrait} alt="" />
                    <div>
                      <b>
                        {v.name}
                        {v.id === room?.you ? " · you" : ""}
                      </b>
                      <small>
                        {v.isBot ? "Bot · " : ""}
                        {v.status === "active"
                          ? ""
                          : v.status === "preview"
                            ? ""
                            : v.status}
                      </small>
                    </div>
                    <strong>{n(v.chips)}</strong>
                  </div>
                ))}
                {host && room?.stage === "lobby" && (
                  <button
                    disabled={
                      p.busy || seated.length >= room.settings.maxPlayers
                    }
                    onClick={() => void p.send("add-bot")}
                  >
                    <Plus size={16} /> Add bot
                  </button>
                )}
                {room && (
                  <div className="table-management">
                    <span>
                      Blinds {n(room.currentLevel.small)} /{" "}
                      {n(room.currentLevel.big)}
                      {room.currentLevel.ante
                        ? ` · ante ${n(room.currentLevel.ante)}`
                        : ""}
                    </span>
                    {host && (
                      <>
                        <button onClick={p.onSettings}>
                          <Settings2 size={15} /> Table settings
                        </button>
                        <button
                          onClick={() =>
                            void p.send("pause-game", { paused: !room.paused })
                          }
                        >
                          {room.paused ? (
                            <Play size={15} />
                          ) : (
                            <Pause size={15} />
                          )}{" "}
                          {room.paused ? "Resume" : "Pause"}
                        </button>
                      </>
                    )}
                    <button onClick={p.onInvite}>Invite friends</button>
                    <button className="leave-control" onClick={p.onLeave}>
                      Leave table
                    </button>
                  </div>
                )}
              </div>
            )}
            {panel === "audio" && (
              <div className="audio-options">
                <label>
                  <button
                    aria-label={p.voice ? "Mute voices" : "Enable voices"}
                    onClick={() => p.setVoice(!p.voice)}
                  >
                    {p.voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                  <b>Voices</b>
                </label>
                {(["dealer", "players"] as const).map((part) => (
                  <label className="mix-level" key={part}>
                    <span>{part === "dealer" ? "Monty" : "Players"}</span>
                    <input
                      aria-label={`${part} volume`}
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={p.voiceMix[part]}
                      onChange={(e) => p.setVoiceMix(part, +e.target.value)}
                    />
                    <output>{Math.round(p.voiceMix[part] * 100)}</output>
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={p.sounds}
                    onChange={(e) => p.setSounds(e.target.checked)}
                  />{" "}
                  Cards & chips
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={p.music}
                    onChange={(e) => p.setMusic(e.target.checked)}
                  />
                  <Music2 size={16} /> Music
                </label>
                <label className="mix-level">
                  <span>Music</span>
                  <input
                    aria-label="Music volume"
                    type="range"
                    min="0"
                    max=".5"
                    step=".01"
                    value={p.musicLevel}
                    onChange={(e) => p.setMusicLevel(+e.target.value)}
                  />
                  <output>{Math.round(p.musicLevel * 100)}</output>
                </label>
                {voiceNotice && (
                  <p className="audio-error">
                    {p.voiceApi.error || "Voice service unavailable."}
                  </p>
                )}
                <button onClick={() => void p.voiceApi.preview("dealer")}>
                  <Play size={14} /> Test audio
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
      <div className="game-dock">
        <div className="reaction-controls" aria-label="Character reactions">
          {reactions.map((r) => (
            <button
              key={r.id}
              disabled={
                p.busy ||
                (!!room && !room.settings.banter) ||
                (!!me?.emote && now - me.emote.at < 2000)
              }
              onClick={() => p.onEmote(r.id)}
              title={r.label}
              aria-label={r.label}
            >
              <r.icon size={18} />
              <span>{r.label}</span>
            </button>
          ))}
        </div>
        <div
          className={`decision-controls ${feedback.myTurn ? "your-action" : ""}`}
        >
          {room && (room.preAction || !actions && room.canPreAct) ? (
            <PreActionControls room={room} busy={p.busy} connected={p.connected} send={p.send} />
          ) : actions ? (
            <>
              {actions.canRaise && actions.maxRaiseTo >= actions.minRaiseTo && (
                <div className="wager-range">
                  <input
                    aria-label="Raise total"
                    type="range"
                    min={actions.minRaiseTo}
                    max={actions.maxRaiseTo}
                    value={raise}
                    step="1"
                    onChange={(e) => setRaise(+e.target.value)}
                  />
                  <input
                    type="number"
                    aria-label="Raise to amount"
                    min={actions.minRaiseTo}
                    max={actions.maxRaiseTo}
                    value={raise}
                    onChange={(e) => setRaise(+e.target.value)}
                  />
                </div>
              )}
              <div className="decision-buttons">
                <button
                  className="fold-action"
                  disabled={p.busy}
                  onClick={() => void p.send("action", { type: "fold" })}
                >
                  Fold
                </button>
                <button
                  disabled={p.busy}
                  onClick={() =>
                    void p.send("action", {
                      type: actions.canCheck ? "check" : "call",
                    })
                  }
                >
                  {actions.canCheck ? "Check" : `Call ${n(actions.callAmount)}`}
                </button>
                {actions.canRaise &&
                  actions.maxRaiseTo >= actions.minRaiseTo && (
                    <button
                      className="game-primary"
                      disabled={
                        p.busy ||
                        raise < actions.minRaiseTo ||
                        raise > actions.maxRaiseTo
                      }
                      onClick={() =>
                        void p.send("action", { type: "raise", amount: raise })
                      }
                    >
                      Raise {n(raise)}
                    </button>
                  )}
                {(actions.canRaise ||
                  (actions.canCall &&
                    actions.maxRaiseTo <= room!.currentBet)) && (
                  <button
                    className="allin-action"
                    disabled={p.busy}
                    onClick={() => void p.send("action", { type: "all-in" })}
                  >
                    All in
                  </button>
                )}
              </div>
            </>
          ) : choosingCards && room ? (
            <div className="show-muck-controls" aria-label="Show or muck your cards">
              <span>Show the table?<small>{reviewSeconds}s · otherwise muck</small></span>
              <button className="game-primary" disabled={p.busy || !p.connected || room.paused || !room.canShowCards} onClick={() => void p.send('show-cards', { choice: 'show', handNumber: room.handNumber })}><Eye size={16} /> Show cards</button>
              <button disabled={p.busy || !p.connected || room.paused || !room.canMuckCards} onClick={() => void p.send('show-cards', { choice: 'muck', handNumber: room.handNumber })}>Muck</button>
            </div>
          ) : (
            <div className="decision-wait">
              {room
                ? room.paused
                  ? "Paused"
                  : flow.settled
                    ? seconds !== null
                      ? `Next hand in ${seconds}s`
                      : room.stage === 'finished' ? 'Tournament complete' : reviewSeconds > 0 ? `Next deal available in ${reviewSeconds}s` : "Hand complete"
                    : room.stage === "lobby"
                      ? "Lobby"
                      : feedback.live
                        ? `${displayActor?.name || "Player"} · ${feedback.seconds}s`
                        : stage
                : "No-limit Texas Hold’em"}
              {room?.canRebuy && flow.settled && (
                <button
                  className="game-primary"
                  onClick={() => void p.send("rebuy")}
                >
                  Rebuy {n(room.settings.startingStack)}
                </button>
              )}
              {host &&
                room?.stage === "showdown" &&
                !room.settings.autoNextHand &&
                readyToDeal && (
                  <button
                    className="game-primary"
                    onClick={() => void p.send("next-hand")}
                  >
                    Deal next hand
                  </button>
                )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
