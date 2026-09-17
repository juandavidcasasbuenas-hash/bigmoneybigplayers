import { SEAT_PREFERENCE } from "../shared/seats";
import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Coffee,
  Coins,
  Copy,
  Crown,
  DoorOpen,
  Spade,
  X,
} from "lucide-react";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { presentRoom } from "../shared/presentedRoom";
import {
  DEFAULT_SETTINGS,
  type Emote,
  type GameSettings,
  type RoomTheme,
} from "../shared/types";
import { GameTable } from "./components/GameTable";
import { CharacterPortrait } from "./components/PokerScene";
import { SetupModal } from "./components/SetupModal";
import { CHARACTERS, getCharacter } from "./data/characters";
import { readStored, writeStored } from "./hooks/storage";
import { useAmbientMusic } from "./hooks/useAmbientMusic";
import { useDealerVoice } from "./hooks/useDealerVoice";
import { useModal } from "./hooks/useModal";
import { usePoker } from "./hooks/usePoker";
import { useTableFeedback } from "./hooks/useTableFeedback";
import { useTablePresentation } from "./hooks/useTablePresentation";

const venues = [
  {
    id: "turf" as RoomTheme,
    name: "The Turf",
    place: "OXFORD, ENGLAND",
    tag: "THE HOUSE FAVOURITE",
    desc: "Low beams. Good pints. Highly questionable calls.",
    icon: Coffee,
    className: "pub",
  },
  {
    id: "penthouse" as RoomTheme,
    name: "The High Roller",
    place: "SOMEWHERE ABOVE YOUR PAY GRADE",
    tag: "DRESS CODE: OVERCONFIDENT",
    desc: "Champagne surroundings. Lemonade poker skills.",
    icon: Crown,
    className: "penthouse",
  },
  {
    id: "basement" as RoomTheme,
    name: "The Garden Shed",
    place: "AT THE BOTTOM OF THE GARDEN",
    tag: "ABSOLUTELY NO FRILLS",
    desc: "One extension lead. Twelve oversized egos.",
    icon: DoorOpen,
    className: "shed",
  },
];
const n = (v: number) => v.toLocaleString("en-GB");
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <Spade size={70} />
        <h3>The cards still work.</h3>
        <p>
          Your browser couldn’t start 3D. Try enabling hardware acceleration.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function App() {
  const poker = usePoker();
  const { room: serverRoom, send, connected, busy, error, setError } = poker;
  const [tab, setTab] = useState("table");
  const [theme, setTheme] = useState<RoomTheme>("turf");
  const [camera, setCamera] = useState("follow");
  const [voice, setVoice] = useState(
    () => readStored("bigmoney:voice") !== "off",
  );
  const [modal, setModal] = useState<"host" | "join" | "settings" | null>(null);
  const [practice, setPractice] = useState(false);
  const [help, setHelp] = useState(false);
  const [invite, setInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [previewEmote, setPreviewEmote] = useState("");
  const [toast, setToast] = useState("");
  const [crewCharacter, setCrewCharacter] = useState("juan");
  const [sounds, setSounds] = useState(
    () => readStored("bigmoney:sounds") !== "off",
  );
  const feedback = useTableFeedback(serverRoom, sounds, connected);
  const [voiceMix, setVoiceMix] = useState(() => {
    const level = (key: string, fallback: number) => {
      const raw = readStored(key);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : fallback;
    };
    return {
      dealer: level("bigmoney:dealer-level-v2", 0.78),
      players: level("bigmoney:player-level", 0.88),
    };
  });
  const voiceApi = useDealerVoice(serverRoom, voice && connected, voiceMix);
  const [music, setMusic] = useState(
    () => readStored("bigmoney:music") !== "off",
  );
  const [musicLevel, setMusicLevel] = useState(() => {
    const raw = readStored("bigmoney:music-level");
    return raw === null ? 0.16 : Math.max(0, Math.min(0.5, Number(raw) || 0));
  });
  useAmbientMusic(music, musicLevel, !!voiceApi.speaking);
  const presentationNow = serverRoom?.paused
    ? (serverRoom.pausedAt ?? feedback.now)
    : feedback.now;
  const flow = useTablePresentation(
    serverRoom,
    presentationNow,
    sounds,
    connected,
  );
  const room = useMemo(
    () => presentRoom(serverRoom, flow.pendingAward, flow.board.length),
    [serverRoom, flow.pendingAward, flow.board.length],
  );
  const helpRef = useModal(() => setHelp(false), help);
  const inviteRef = useModal(() => setInvite(false), invite && !!room);
  useEffect(() => {
    if (!room) setInvite(false);
  }, [room?.code]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (room) setTheme(room.settings.roomTheme);
  }, [room?.settings.roomTheme]);
  useEffect(() => {
    if (room) setModal((current) => (current === "join" ? null : current));
    else if (poker.joinCode) setModal("join");
  }, [poker.joinCode, room?.code]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(""), 7000);
      return () => clearTimeout(t);
    }
  }, [error]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const me = room?.players.find((p) => p.id === room.you);
  const host = room?.hostId === room?.you;
  const previewPlayers = useMemo(
    () =>
      CHARACTERS.slice(0, 6).map((c, i) => ({
        id: c.id,
        name: c.name,
        avatar: c.id,
        stack: 10000,
        status: "preview",
        seat: SEAT_PREFERENCE[i],
        emote: i === 0 ? previewEmote : undefined,
      })),
    [previewEmote],
  );
  const emoteTick = room?.players.some(
    (p) => p.emote && now - p.emote.at < 5000,
  )
    ? now
    : 0;
  const scenePlayers = useMemo(
    () =>
      room
        ? room.players
            .filter(
              (p) =>
                p.seat >= 0 && p.status !== "spectator" && (p.status !== "out" || p.cardCount === 2),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatarId,
              stack: p.chips,
              status: p.status,
              bet: p.bet,
              seat: p.seat,
              smallBlind: p.id === room.smallBlindId,
              bigBlind: p.id === room.bigBlindId,
              emoteAt: p.emote?.at,
              emote:
                p.emote && now - p.emote.at < 4500 ? p.emote.type : undefined,
            }))
        : previewPlayers,
    [room?.players, room?.smallBlindId, room?.bigBlindId, previewPlayers, emoteTick],
  );
  const doSubmit = async (data: {
    name: string;
    avatarId: string;
    settings: GameSettings;
    roomCode: string;
    spectator: boolean;
  }) => {
    const ack = await send(
      modal === "settings"
        ? "update-settings"
        : modal === "join"
          ? "join-room"
          : "create-room",
      modal === "settings"
        ? data.settings
        : modal === "join"
          ? {
              roomCode: data.roomCode,
              name: data.name,
              avatarId: data.avatarId,
              spectator: data.spectator,
            }
          : {
              name: data.name,
              avatarId: data.avatarId,
              settings: data.settings,
            },
    );
    if (!ack.ok) return;
    setModal(null);
    setTab("table");
    if (practice && modal === "host") {
      for (const c of CHARACTERS.filter((c) => c.id !== data.avatarId).slice(
        0,
        Math.min(5, data.settings.maxPlayers - 1),
      )) {
        const added = await send("add-bot", { name: c.name, avatarId: c.id });
        if (!added.ok) {
          setPractice(false);
          return;
        }
      }
      await send("start-game");
      setPractice(false);
    }
  };
  const openHost = (demo = false) => {
    setPractice(demo);
    setModal("host");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?room=${room?.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setToast("Select and copy the invitation link below.");
    }
  };
  const doEmote = async (id: Emote) => {
    if (room) {
      await send("emote", { type: id });
    } else {
      setPreviewEmote(id);
      setTimeout(() => setPreviewEmote(""), 5000);
      void voiceApi.preview("juan", id);
    }
  };
  const changeTheme = async (t: RoomTheme) => {
    if (room) {
      if (!host || room.stage !== "lobby") {
        setToast("The host can change the room before the tournament begins.");
        return;
      }
      const ack = await send("update-settings", { roomTheme: t });
      if (!ack.ok) return;
    }
    setTheme(t);
    setTab("table");
  };
  return (
    <div className={`app-shell ${tab === "table" ? "table-mode" : ""}`}>
      <header className="site-header">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("table");
          }}
          aria-label="Big Money home"
        >
          <img src="/favicon.svg" alt="" />
          <span>
            BIG MONEY<small>POKER CLUB</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            { id: "table", label: "Table" },
            { id: "rooms", label: "Rooms" },
            { id: "crew", label: "Characters" },
          ].map((t) => (
            <button
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
              key={t.id}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <button
            className="icon-btn help-btn"
            aria-label="How to play"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="profile"
            aria-label="Choose character"
            onClick={() => setTab("crew")}
          >
            <img
              src={
                getCharacter(me?.avatarId || crewCharacter).portrait ||
                getCharacter(me?.avatarId || crewCharacter).photo
              }
              alt="Your character"
            />
            <ChevronDown size={14} />
          </button>
        </div>
      </header>
      <main>
        {tab !== "table" && (
          <div className="page-heading">
            <h1>{tab === "rooms" ? "Rooms" : "Characters"}</h1>
          </div>
        )}
        {tab === "table" && (
          <GameTable
            room={room}
            players={scenePlayers}
            flow={flow}
            feedback={feedback}
            now={presentationNow}
            theme={theme}
            camera={camera}
            setCamera={setCamera}
            voice={voice}
            setVoice={(value) => {
              setVoice(value);
              writeStored("bigmoney:voice", value ? "on" : "off");
            }}
            sounds={sounds}
            setSounds={(value) => {
              setSounds(value);
              writeStored("bigmoney:sounds", value ? "on" : "off");
            }}
            voiceMix={voiceMix}
            setVoiceMix={(part, value) => {
              setVoiceMix((previous) => ({ ...previous, [part]: value }));
              writeStored(
                part === "dealer"
                  ? "bigmoney:dealer-level-v2"
                  : "bigmoney:player-level",
                String(value),
              );
            }}
            voiceApi={voiceApi}
            music={music}
            setMusic={(value) => {
              setMusic(value);
              writeStored("bigmoney:music", value ? "on" : "off");
            }}
            musicLevel={musicLevel}
            setMusicLevel={(value) => {
              setMusicLevel(value);
              writeStored("bigmoney:music-level", String(value));
            }}
            busy={busy}
            connected={connected}
            send={send}
            onEmote={(id) => void doEmote(id)}
            onHost={openHost}
            onJoin={() => {
              setPractice(false);
              setModal("join");
            }}
            onSettings={() => setModal("settings")}
            onInvite={() => setInvite(true)}
            onLeave={() => void poker.leave()}
          />
        )}
        {tab === "rooms" && (
          <div className="rooms-grid">
            {venues.map((v, i) => (
              <article className={`venue-card ${v.className}`} key={v.id}>
                <div className="venue-art">
                  <div className="art-window" />
                  <div className="art-lamp" />
                  <div className="art-table">
                    <span>
                      BIG MONEY
                      <br />
                      BIG PLAYERS
                    </span>
                    <i />
                    <b />
                  </div>
                  <div className="art-picture">
                    <v.icon size={36} />
                  </div>
                  <span className="venue-number">0{i + 1}</span>
                  <span className="room-tag">{v.tag}</span>
                </div>
                <div className="venue-copy">
                  <div className="eyebrow">{v.place}</div>
                  <h2>{v.name}</h2>
                  <p>{v.desc}</p>
                  <button
                    className={`btn ${theme === v.id ? "dark" : "outline"} wide`}
                    onClick={() => void changeTheme(v.id)}
                  >
                    {theme === v.id ? "Back to your table" : "Pull up a chair"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {tab === "crew" && (
          <div className="crew-layout">
            <div className="crew-grid">
              {CHARACTERS.map((c) => (
                <button
                  className={`crew-card ${crewCharacter === c.id ? "selected" : ""}`}
                  key={c.id}
                  onClick={() => setCrewCharacter(c.id)}
                >
                  <div className="crew-photo" style={{ background: c.color }}>
                    <img
                      src={c.portrait || c.photo}
                      alt={`${c.name}, cartoon character`}
                    />
                    <span>0{CHARACTERS.indexOf(c) + 1}</span>
                    {crewCharacter === c.id && (
                      <i>
                        <Check size={15} />
                      </i>
                    )}
                  </div>
                  <div>
                    <h3>{c.name}</h3>
                    <p>{c.tagline}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="character-preview">
              <div className="scene-frame crew-scene">
                <SceneBoundary>
                  <Suspense fallback={null}>
                    <CharacterPortrait
                      avatar={crewCharacter}
                      emote={previewEmote}
                    />
                  </Suspense>
                </SceneBoundary>
              </div>
              <div className="character-preview-copy">
                <h2>{getCharacter(crewCharacter).name}</h2>
                <p>{getCharacter(crewCharacter).tagline}</p>
                <button
                  className="btn primary"
                  onClick={() => {
                    writeStored("bigmoney:avatar", crewCharacter);
                    if (room) setToast("Character saved for your next table.");
                    else openHost(false);
                  }}
                >
                  Choose character <ArrowRight size={17} />
                </button>
                <button
                  className="text-btn character-voice"
                  onClick={() => {
                    setPreviewEmote("chips");
                    window.setTimeout(() => setPreviewEmote(""), 4000);
                  }}
                >
                  {" "}
                  <Coins size={15} />
                  See {getCharacter(crewCharacter).name}’s chip trick
                </button>
                <button
                  className="text-btn character-voice"
                  disabled={voiceApi.status === "loading"}
                  onClick={() => void voiceApi.preview(crewCharacter, "cheers")}
                >
                  <AudioLines size={15} /> Hear{" "}
                  {getCharacter(crewCharacter).name}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {modal && (
        <SetupModal
          key={modal}
          mode={modal}
          initial={room?.settings || { ...DEFAULT_SETTINGS, roomTheme: theme }}
          code={poker.joinCode}
          busy={busy}
          onClose={() => {
            setModal(null);
            poker.setJoinCode("");
            setPractice(false);
          }}
          onSubmit={(data) => void doSubmit(data)}
        />
      )}
      {invite && room && (
        <div className="modal-backdrop">
          <section
            ref={inviteRef}
            className="modal invite-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <button
              className="icon-btn close"
              aria-label="Close invitation"
              onClick={() => setInvite(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              THE GROUP CHAT IS ABOUT TO GET INTERESTING
            </span>
            <h2 id="invite-title">Save them a seat.</h2>
            <p>
              Your mates just open the link, enter a name, and choose a face.
            </p>
            <div className="share-code">{room.code}</div>
            <label className="field">
              <span>Your private table link</span>
              <input
                readOnly
                onFocus={(e) => e.target.select()}
                value={`${window.location.origin}/?room=${room.code}`}
              />
            </label>
            <button className="btn primary wide" onClick={() => void copy()}>
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied
                ? "Copied. Get the gang together."
                : "Copy invitation link"}
            </button>
            <div className="note">
              {window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1"
                ? "You’re running locally. Friends need the same network using your computer’s network address, or a publicly hosted server."
                : "Anyone with this link can request a seat or join the rail. Keep it in the group chat."}
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            ref={helpRef}
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="icon-btn close"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A QUICK WORD FROM THE DEALER</span>
            <h2 id="help-title">Welcome to the club.</h2>
            <div className="help-items">
              <p>
                <b>01 · Get the gang in</b>Host a table, choose the house rules,
                and share the invitation. Add practice bots for any spare
                chairs.
              </p>
              <p>
                <b>02 · Play your hand</b>Two private cards. Five community
                cards. Make your best five-card hand, or convince everyone else
                you have. Fold, check, call, raise, or go all in.
              </p>
              <p>
                <b>03 · Know the pecking order</b>Royal flush → straight flush →
                four of a kind → full house → flush → straight → three of a kind
                → two pair → pair → high card.
              </p>
              <p>
                <b>04 · Lose chips, keep your friends</b>Busted players join the
                rail. Their chat stays separate by default, and nobody can peek
                at hidden cards. Rebuy only if your host enabled it.
              </p>
              <p>
                <b>05 · Make a scene</b>Choose a camera, turn on the dealer’s
                voice, and click a banter button. Standing up is theatre: it
                doesn’t fold your hand.
              </p>
            </div>
            <div className="note">
              All chips are imaginary. There are no deposits, withdrawals,
              purchases, or cash prizes. This table is for fun.
            </div>
            <button className="btn dark wide" onClick={() => setHelp(false)}>
              Right, let’s play <Spade size={16} />
            </button>
          </section>
        </div>
      )}
      {(error || toast) && (
        <div
          role={error ? "alert" : "status"}
          className={`toast ${error ? "error" : ""}`}
        >
          <span>{error || toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setError("");
              setToast("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
