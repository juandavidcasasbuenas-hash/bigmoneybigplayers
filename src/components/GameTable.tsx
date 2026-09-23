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
  Minus,
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
import { seatHudAt } from "../../shared/seatHud";
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
  const [panel, setPanel] = useState<"log" | "seats" | "audio" | "react" | null>(null),
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
          : room ? ({ lobby: "Lobby", preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown", finished: "Finished" } as const)[room.stage] : "Lobby";
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
  const decisionKey = `${room?.code}:${room?.handNumber}:${room?.stage}:${room?.turnId}:${room?.currentBet}:${me?.chips}:${room?.paused}:${p.connected}`;
  const [confirmation, setConfirmation] = useState<{key:string; event:string; data:unknown; allIn:boolean} | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setConfirmation(null); }, [decisionKey]);
  useEffect(() => {
    const dialog = confirmDialog.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    if (!confirmation && dialog?.open) dialog.close();
  }, [confirmation]);
  const decision = async (event: string, data?: unknown): Promise<Ack> => {
    const action = data as {type?:string; amount?:number} | undefined;
    const queued = event === 'pre-action';
    if ((event === 'action' || queued) && action?.type && me) {
      const call = queued ? Math.min(me.chips, Math.max(0, (room?.currentBet || 0) - me.bet)) : actions?.callAmount || 0;
      const allIn = action.type === 'all-in' || action.type === 'call' && call >= me.chips && me.chips > 0 || action.type === 'raise' && (action.amount || 0) >= me.chips + me.bet;
      const freeFold = action.type === 'fold' && (queued ? call === 0 : actions?.canCheck);
      if (allIn || freeFold) { setConfirmation({key:decisionKey,event,data,allIn}); return {ok:false}; }
    }
    return p.send(event, data);
  };
  const seatHud = useMemo(
    () => room ? seatHudAt(room, flow.motions, now, flow.settled) : undefined,
    [room, flow.motions, now, flow.settled],
  );
  const canBet = !!actions && actions.canRaise && actions.maxRaiseTo >= actions.minRaiseTo;
  const callIsAllIn = !!actions && !!me && !actions.canCheck && actions.callAmount >= me.chips;
  const clampRaise = (value: number) => actions ? Math.round(Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, value || 0))) : 0;
  const big = room?.currentLevel.big || 1;
  const step = big;
  const presets = useMemo(() => {
    if (!actions || !room || !canBet) return [];
    const toCall = actions.canCheck ? 0 : actions.callAmount;
    const potAfterCall = room.pot + toCall;
    const potRaise = (f: number) => room.currentBet + Math.round(f * potAfterCall);
    const options = room.stage === 'preflop'
      ? [{ label: 'Min', to: actions.minRaiseTo }, { label: '2.5 BB', to: Math.round(2.5 * big) }, { label: '3 BB', to: 3 * big }, { label: 'Pot', to: potRaise(1) }]
      : [{ label: 'Min', to: actions.minRaiseTo }, { label: '½ Pot', to: potRaise(0.5) }, { label: '¾ Pot', to: potRaise(0.75) }, { label: 'Pot', to: potRaise(1) }];
    const seen = new Set<number>();
    return [...options.map(o => ({ ...o, to: clampRaise(o.to) })), { label: 'All in', to: actions.maxRaiseTo }]
      .filter(o => (o.label === 'Min' || o.label === 'All in' || (o.to > actions.minRaiseTo && o.to < actions.maxRaiseTo)) && !seen.has(o.to) && !!seen.add(o.to));
  }, [actions, room?.pot, room?.currentBet, room?.stage, big, canBet]);
  const [seenChat, setSeenChat] = useState(0);
  const chatCount = room?.chat.length || 0;
  useEffect(() => { if (panel === 'log') setSeenChat(chatCount); }, [panel, chatCount]);
  useEffect(() => { setSeenChat(0); }, [room?.code]);
  const unread = panel === 'log' ? 0 : Math.max(0, chatCount - seenChat);
  const winners = flow.settled ? room?.winners || [] : [];
  const winnerLine = winners.length
    ? `${winners.map(w => w.playerId === room?.you ? 'You' : room?.players.find(pl => pl.id === w.playerId)?.name || 'Player').join(' & ')} ${winners.length === 1 && winners[0].playerId !== room?.you ? 'wins' : 'win'} ${n(winners.reduce((sum, w) => sum + w.amount, 0))}${winners[0].hand && winners[0].hand !== 'Not shown' ? ` · ${winners[0].hand}` : ''}`
    : '';
  // Keyboard play: F fold, C check/call, R bet/raise. Ignored while typing.
  const keyActions = useRef<Record<string, () => void>>({});
  keyActions.current = feedback.myTurn && actions && !p.busy && !confirmation ? {
    KeyF: () => void decision('action', { type: 'fold' }),
    KeyC: () => void decision('action', { type: actions.canCheck ? 'check' : 'call' }),
    ...(canBet ? { KeyR: () => void decision('action', raise >= actions.maxRaiseTo ? { type: 'all-in' } : { type: 'raise', amount: clampRaise(raise) }) } : {}),
  } : {};
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.closest('input:not([type=range]), textarea, select, dialog, [contenteditable]'))) return;
      const run = keyActions.current[event.code];
      if (run) { event.preventDefault(); run(); }
      if (event.code === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (panel !== 'react') return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.react-anchor')) setPanel(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [panel]);
  const lastAction = [...log].reverse().find(item => item.kind === 'event' && item.name && now - item.at < 6000);
  const levelClock = room?.paused ? room.pausedAt ?? now : now;
  const blindSeconds = room?.levelEndsAt ? Math.max(0, Math.ceil((room.levelEndsAt - levelClock) / 1000)) : null;
  const nextLevel = room?.settings.levels[(room?.levelIndex || 0) + 1];
  const celebrateAt = flow.award ? flow.award.startAt + flow.award.duration : 0;
  const celebrating = !!room && flow.settled && now >= celebrateAt && now < celebrateAt + 4200;
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
      <div className={`game-stage ${firstPerson ? 'first-person' : ''} ${showdown ? 'showdown-active' : ''} ${feedback.myTurn ? 'my-turn' : ''}`}>
        <PokerScene
          players={tablePlayers}
          heroCards={me?.holeCards || []}
          peeking={peek.peeking}
          onPeekStart={peek.start}
          board={room?.board || []}
          pot={flow.pot}
          potLabel={room && room.stage !== 'lobby' && !flow.settled && flow.pot > 0 ? n(flow.pot) : undefined}
          seatHud={seatHud}
          currentPlayerId={
            feedback.live ? room?.turnPlayerId || undefined : undefined
          }
          followPlayerId={celebrating && revealCamera ? room?.winners[0]?.playerId : flow.focusActorId || room?.turnPlayerId || undefined}
          dealerIndex={players.findIndex((v) => v.id === room?.dealerId)}
          roomTheme={p.theme}
          cameraMode={
            celebrating && revealCamera ? 'winner' : camera === "follow" && flow.focusTable ? "table" : camera
          }
          showdown={showdown}
          celebration={celebrating ? {ids: room!.winners.map(w => w.playerId), at: celebrateAt} : null}
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
        <header className="hud-top">
          <div className="hud-table">
            <div className="table-identity">
              <span className={`live-dot ${p.connected ? "online" : ""}`} title={p.connected ? 'Connected' : 'Reconnecting…'} />
              <strong>{room?.settings.name || "The Turf"}</strong>
              {room && (
                <button
                  onClick={p.onInvite}
                  title="Invite friends to this table"
                  className="table-code"
                >
                  {room.code}
                </button>
              )}
            </div>
            {room && room.stage !== "lobby" && (
              <div className="hand-meta">
                <span className="hand-stage"><small>Hand {room.handNumber}</small><b>{stage}</b></span>
                <span className="blind-clock">
                  <small>Blinds{room.currentLevel.ante ? ` · ante ${n(room.currentLevel.ante)}` : ''}</small>
                  <b>{n(room.currentLevel.small)}/{n(room.currentLevel.big)}</b>
                </span>
                <span className="level-clock">
                  <small>Level {room.levelIndex + 1}</small>
                  <b>{room.breakEndsAt ? `Break ${Math.max(0, Math.ceil((room.breakEndsAt-levelClock)/1000))}s` : nextLevel ? blindSeconds === null ? '—' : blindSeconds === 0 ? `Next: ${n(nextLevel.small)}/${n(nextLevel.big)}` : `${Math.floor((blindSeconds || 0)/60)}:${String((blindSeconds || 0)%60).padStart(2,'0')}` : 'Final'}</b>
                </span>
              </div>
            )}
          </div>
          <div className="table-tools">
            <label className="camera-select" title="Camera">
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
                <option value="table">My view</option>
                <option value="follow">Follow action</option>
                <option value="first-person">In my seat</option>
                <option value="overhead">Overhead</option>
                <option value="cinematic">Cinema</option>
                <option value="free">Free orbit</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <div className="react-anchor">
              <button
                className={panel === "react" ? "selected" : ""}
                aria-label="Reactions"
                title="Reactions"
                aria-expanded={panel === "react"}
                disabled={!!room && !room.settings.banter}
                onClick={() => toggle("react")}
              >
                <Smile size={18} />
              </button>
              {panel === "react" && (
                <div className="react-popover" role="menu" aria-label="Character reactions">
                  {reactions.map((r) => (
                    <button
                      key={r.id}
                      role="menuitem"
                      disabled={p.busy || (!!me?.emote && now - me.emote.at < 2000)}
                      onClick={() => { p.onEmote(r.id); setPanel(null); }}
                    >
                      <r.icon size={18} />
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className={panel === "seats" ? "selected" : ""}
              aria-label="Players and table"
              title="Players and table"
              aria-expanded={panel === "seats"}
              onClick={() => toggle("seats")}
            >
              <Users size={18} />
              {room && <small className="tool-count">{seated.length}</small>}
            </button>
            <button
              className={panel === "log" ? "selected" : ""}
              aria-label="Chat and hand history"
              title="Chat and hand history"
              aria-expanded={panel === "log"}
              onClick={() => toggle("log")}
            >
              <MessageSquare size={18} />
              {unread > 0 && <small className="tool-badge">{unread > 9 ? '9+' : unread}</small>}
            </button>
            <button
              className={`${panel === "audio" ? "selected" : ""} ${voiceNotice ? "needs-attention" : ""}`}
              aria-label="Sound settings"
              title="Sound"
              aria-expanded={panel === "audio"}
              onClick={() => toggle("audio")}
            >
              {p.voice || p.sounds || p.music ? <AudioLines size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              aria-label="Toggle fullscreen table"
              title="Fullscreen"
              onClick={() => void fullscreen()}
            >
              <Fullscreen size={18} />
            </button>
          </div>
        </header>
        <div className="sr-only" role="status" aria-live="polite">{lastAction ? `${lastAction.name} ${lastAction.text}` : ''}</div>
        {room?.paused && <div className="table-banner paused"><Pause size={16}/> Game paused{host ? '' : ' by the host'}</div>}
        {!room?.paused && feedback.myTurn && <div className={`table-banner your-turn ${feedback.urgent ? 'urgent' : ''}`}>Your turn <b>{feedback.seconds}s</b></div>}
        {!room?.paused && celebrating && winnerLine && <div className="table-banner winner">{winnerLine}</div>}
        {!room && (
          <div className="table-entry">
            <span className="entry-eyebrow">No-limit Texas Hold’em · 2–12 players</span>
            <h1>Take a seat.</h1>
            <p>Host a private table for friends, join with an invite code, or warm up against bots.</p>
            <button
              className="game-primary"
              disabled={!p.connected || p.busy}
              onClick={() => p.onHost(false)}
            >
              <Users size={16}/> Host a table
            </button>
            <div className="entry-row">
              <button onClick={p.onJoin}>Join with code</button>
              <button
                disabled={!p.connected || p.busy}
                onClick={() => p.onHost(true)}
              >
                <Play size={14} /> Practice vs bots
              </button>
            </div>
            {!p.connected && <small className="entry-note">Connecting to the table server…</small>}
          </div>
        )}
        {room?.stage === "lobby" && (
          <div className="table-entry lobby-entry">
            <span className="entry-eyebrow">Table {room.code} · waiting to start</span>
            <h1>{seated.length} of {room.settings.maxPlayers} seated</h1>
            <p>{host ? seated.length < 2 ? 'Invite friends or add a bot — you need at least two players to deal.' : 'Everyone in? Deal the first hand when you’re ready.' : 'Waiting for the host to deal the first hand.'}</p>
            <button className={host && seated.length >= 2 ? '' : 'game-primary'} onClick={p.onInvite}>
              <Plus size={15} /> Invite friends
            </button>
            {host && (
              <div className="entry-row">
                <button
                  disabled={p.busy || seated.length >= room.settings.maxPlayers}
                  onClick={() => void p.send("add-bot")}
                >
                  <Plus size={15} /> Add bot
                </button>
                <button
                  className={seated.length >= 2 ? 'game-primary' : ''}
                  disabled={p.busy || seated.length < 2}
                  onClick={() => void p.send("start-game")}
                >
                  <Play size={15} /> Deal
                </button>
              </div>
            )}
          </div>
        )}
        {showdown && <div className="showdown-footnote" role="status">
          {showdown.sidePots && <span>Main + side pots</span>}
          {showdown.allIn && showdown.split !== null && showdown.split > 0 && <span>Split {showdown.estimated ? '≈' : ''}{showdown.split.toFixed(1)}%</span>}
          <span className="sr-only">{showdown.settled ? 'Hand complete.' : showdown.allIn ? 'All in. Cards on the table.' : 'Showdown.'} {showdown.seats.filter(s => s.award).map(s => `${s.name} wins ${n(s.award)} chips.`).join(' ')}</span>
        </div>}
        {panel && panel !== "react" && (
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
      <dialog ref={confirmDialog} className="decision-confirm" onCancel={() => setConfirmation(null)} aria-labelledby="decision-confirm-title">
        <h2 id="decision-confirm-title">{confirmation?.allIn ? 'Commit all your chips?' : 'You can check for free'}</h2>
        <p>{confirmation?.allIn ? `This puts your remaining ${n(me?.chips || 0)} chips at risk.` : 'Folding gives up your hand even though checking costs nothing.'}</p>
        <div><button autoFocus onClick={() => setConfirmation(null)}>Go back</button><button className="game-primary" onClick={() => { const pending=confirmation; setConfirmation(null); if(pending?.key===decisionKey && p.connected && !room?.paused) void p.send(pending.event,pending.data); }}>{confirmation?.allIn ? 'Confirm all in' : 'Fold anyway'}</button></div>
      </dialog>
      {room && <footer className={`game-dock ${feedback.myTurn ? "your-action" : ""} ${feedback.urgent ? "urgent" : ""}`}>
        {feedback.myTurn && <span className="dock-timer" style={{ transform: `scaleX(${feedback.progress})` }} aria-hidden="true" />}
        <div className="dock-hand" aria-label="Your hand">
          {me?.holeCards.length ? (
            <>
              <div className={`card-pair ${me.status === 'folded' ? 'folded' : ''}`}>
                {me.holeCards.map((c) => (
                  <PlayingCard key={c} card={c} />
                ))}
              </div>
              <div className="hand-value">
                <small>{me.status === "folded" ? "Folded" : "Your hand"}</small>
                <strong>{ownHand}</strong>
                <span>{n(me.chips)} chips</span>
              </div>
              {canPeek && <button
                className={`peek-cards ${peek.peeking ? 'peeking' : ''}`}
                aria-label="Hold to peek at your cards"
                aria-pressed={peek.peeking}
                title="Hold to lift your cards at the table (P)"
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
              ><Eye size={16}/><span>{peek.peeking ? 'Peeking' : 'Peek'}</span><kbd>P</kbd></button>}
            </>
          ) : (
            <div className="hand-value empty">
              <small>{room ? room.stage === 'lobby' ? 'Lobby' : me?.status === "waiting" ? "Seated" : me?.status === 'out' ? 'Eliminated' : me ? "Spectating" : "" : "Big Money Poker Club"}</small>
              <strong>
                {room ? room.stage === 'lobby' ? 'Waiting to deal' : me?.status === "waiting" ? "In next hand" : me?.status === 'out' ? 'On the rail' : "Watching" : "No-limit Hold’em"}
              </strong>
              {me && room && <span>{n(me.chips)} chips</span>}
            </div>
          )}
        </div>
        {room && room.stage !== 'lobby' && (
          <div className="dock-board" aria-label="Community cards">
            <div className="board-cards">
              {Array.from({ length: 5 }, (_, i) =>
                flow.board[i] ? (
                  <PlayingCard key={i} card={flow.board[i]} />
                ) : (
                  <span className="card-slot" key={i} />
                ),
              )}
            </div>
            <span className="board-pot">{flow.settled ? winnerLine || 'Hand complete' : <>Pot <b>{n(flow.pot)}</b></>}</span>
          </div>
        )}
        <div
          className={`decision-controls ${feedback.myTurn ? "your-action" : ""}`}
        >
          {room && (room.preAction || !actions && room.canPreAct) ? (
            <div className="waiting-with-pre">
              <span className="decision-status">{feedback.live && displayActor ? <>Waiting for <b>{displayActor.name}</b> · {feedback.seconds}s</> : stage}</span>
              <PreActionControls room={room} busy={p.busy} connected={p.connected} send={decision} />
            </div>
          ) : actions ? (
            <div className="turn-actions">
              {canBet && (
                <div className="bet-sizer">
                  <div className="bet-presets" role="group" aria-label="Bet size presets">
                    {presets.map((preset) => (
                      <button
                        key={preset.label}
                        className={raise === preset.to ? 'selected' : ''}
                        disabled={p.busy}
                        onClick={() => setRaise(preset.to)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="bet-slider">
                    <button aria-label="Decrease bet" disabled={p.busy || raise <= actions.minRaiseTo} onClick={() => setRaise(clampRaise(raise - step))}><Minus size={15}/></button>
                    <input
                      aria-label="Raise total"
                      type="range"
                      min={actions.minRaiseTo}
                      max={actions.maxRaiseTo}
                      value={raise}
                      step={1}
                      style={{ '--fill': `${((raise - actions.minRaiseTo) / Math.max(1, actions.maxRaiseTo - actions.minRaiseTo)) * 100}%` } as React.CSSProperties}
                      onChange={(e) => setRaise(+e.target.value)}
                    />
                    <button aria-label="Increase bet" disabled={p.busy || raise >= actions.maxRaiseTo} onClick={() => setRaise(clampRaise(raise + step))}><Plus size={15}/></button>
                    <input
                      type="number"
                      aria-label={room!.currentBet ? 'Raise to amount' : 'Bet amount'}
                      min={actions.minRaiseTo}
                      max={actions.maxRaiseTo}
                      value={raise}
                      onChange={(e) => setRaise(+e.target.value)}
                      onBlur={() => setRaise(clampRaise(raise))}
                    />
                  </div>
                </div>
              )}
              <div className="decision-buttons">
                <button
                  className="fold-action"
                  disabled={p.busy}
                  onClick={() => void decision("action", { type: "fold" })}
                >
                  <span>Fold</span><kbd>F</kbd>
                </button>
                <button
                  className="call-action"
                  disabled={p.busy}
                  onClick={() =>
                    void decision("action", {
                      type: actions.canCheck ? "check" : "call",
                    })
                  }
                >
                  <span>{actions.canCheck ? "Check" : callIsAllIn ? 'Call all in' : "Call"}{!actions.canCheck && <b>{n(actions.callAmount)}</b>}</span><kbd>C</kbd>
                </button>
                {canBet ? (
                  <button
                    className="raise-action"
                    disabled={
                      p.busy ||
                      raise < actions.minRaiseTo ||
                      raise > actions.maxRaiseTo
                    }
                    onClick={() =>
                      void decision("action", raise >= actions.maxRaiseTo ? { type: "all-in" } : { type: "raise", amount: raise })
                    }
                  >
                    <span>{raise >= actions.maxRaiseTo ? 'All in' : room!.currentBet ? 'Raise to' : 'Bet'}<b>{n(raise)}</b></span><kbd>R</kbd>
                  </button>
                ) : actions.canCall && !callIsAllIn && actions.maxRaiseTo <= room!.currentBet ? (
                  <button className="raise-action" disabled={p.busy} onClick={() => void decision("action", { type: "all-in" })}>
                    <span>All in<b>{n((me?.chips || 0) + (me?.bet || 0))}</b></span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : choosingCards && room ? (
            <div className="show-muck-controls" aria-label="Show or muck your cards">
              <span>Show your hand?<small>{reviewSeconds}s · otherwise mucked</small></span>
              <button className="game-primary" disabled={p.busy || !p.connected || room.paused || !room.canShowCards} onClick={() => void p.send('show-cards', { choice: 'show', handNumber: room.handNumber })}><Eye size={16} /> Show</button>
              <button disabled={p.busy || !p.connected || room.paused || !room.canMuckCards} onClick={() => void p.send('show-cards', { choice: 'muck', handNumber: room.handNumber })}>Muck</button>
            </div>
          ) : (
            <div className="decision-wait">
              <span className="decision-status">
              {room
                ? room.paused
                  ? "Game paused"
                  : flow.settled
                    ? seconds !== null
                      ? <>Next hand in <b>{seconds}s</b></>
                      : room.stage === 'finished' ? 'Tournament complete' : reviewSeconds > 0 ? <>Next deal in <b>{reviewSeconds}s</b></> : "Hand complete"
                    : room.stage === "lobby"
                      ? host ? 'Deal when everyone’s seated' : 'Waiting for the host'
                      : feedback.live && displayActor
                        ? <>Waiting for <b>{displayActor.id === room.you ? 'you' : displayActor.name}</b> · {feedback.seconds}s</>
                        : stage
                : "Pick a table to start playing"}
              </span>
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
      </footer>}
    </section>
  );
}
