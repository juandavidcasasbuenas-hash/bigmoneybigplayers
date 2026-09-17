import { useState } from "react";
import { useModal } from "../hooks/useModal";
import { readStored, writeStored } from "../hooks/storage";
import {
  X,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  Users,
  Timer,
  SlidersHorizontal,
} from "lucide-react";
import { DEFAULT_SETTINGS, type GameSettings } from "../../shared/types";
import { CHARACTERS } from "../data/characters";
export function SetupModal({
  mode,
  initial,
  code,
  busy,
  onClose,
  onSubmit,
}: {
  mode: "host" | "join" | "settings";
  initial?: GameSettings;
  code?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    avatarId: string;
    settings: GameSettings;
    roomCode: string;
    spectator: boolean;
  }) => void;
}) {
  const dialogRef = useModal(onClose);
  const [tab, setTab] = useState("table");
  const [settings, setSettings] = useState<GameSettings>(() =>
    structuredClone(initial || DEFAULT_SETTINGS),
  );
  const [name, setName] = useState(() => readStored("bigmoney:name") || "");
  const [avatarId, setAvatar] = useState(() => {
    const saved = readStored("bigmoney:avatar");
    return CHARACTERS.some((c) => c.id === saved) ? saved! : "juan";
  });
  const [roomCode, setCode] = useState(code || "");
  const [spectator, setSpectator] = useState(false);
  const update = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  const num = (
    key: keyof GameSettings,
    label: string,
    min: number,
    max: number,
    help?: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={1}
        min={min}
        max={max}
        required
        value={settings[key] as number}
        onChange={(e) => update(key, Number(e.target.value) as never)}
      />
      {help && <small>{help}</small>}
    </label>
  );
  const toggle = (key: keyof GameSettings, label: string, desc: string) => (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{desc}</small>
      </span>
      <input
        type="checkbox"
        checked={settings[key] as boolean}
        onChange={(e) => update(key, e.target.checked as never)}
      />
      <i />
    </label>
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <button
          className="icon-btn close"
          onClick={onClose}
          aria-label="Close setup"
        >
          <X size={20} />
        </button>
        <h2 id="setup-title">
          {mode === "join"
            ? "Join table"
            : mode === "settings"
              ? "Table settings"
              : "Host table"}
        </h2>
        <form
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            writeStored("bigmoney:name", name.trim());
            writeStored("bigmoney:avatar", avatarId);
            onSubmit({
              name: name.trim(),
              avatarId,
              settings,
              roomCode: roomCode.trim().toUpperCase(),
              spectator,
            });
          }}
        >
          {mode !== "settings" && (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>Your display name</span>
                  <input
                    data-autofocus
                    required
                    pattern=".*\S.*"
                    maxLength={24}
                    placeholder="What do your mates call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {mode === "join" ? (
                  <label className="field">
                    <span>Table code</span>
                    <input
                      required
                      minLength={4}
                      maxLength={8}
                      placeholder="ABCDEF"
                      value={roomCode}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                  </label>
                ) : (
                  <label className="field">
                    <span>Table name</span>
                    <input
                      required
                      maxLength={48}
                      value={settings.name}
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                )}
              </div>
              <label className="field">
                <span>Choose your alter ego</span>
              </label>
              <div className="character-picker">
                {CHARACTERS.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-label={`Play as ${c.name}`}
                    aria-pressed={avatarId === c.id}
                    className={avatarId === c.id ? "selected" : ""}
                    onClick={() => setAvatar(c.id)}
                  >
                    <img src={c.portrait || c.photo} alt="" />
                    <span>{c.name}</span>
                    {avatarId === c.id && (
                      <i>
                        <Check size={11} />
                      </i>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === "join" ? (
            <label className="toggle-row">
              <span>
                <strong>Just here for the commentary</strong>
                <small>Join the spectator rail with no hole-card access.</small>
              </span>
              <input
                type="checkbox"
                checked={spectator}
                onChange={(e) => setSpectator(e.target.checked)}
              />
              <i />
            </label>
          ) : (
            <>
              <div className="setup-tabs" aria-label="Setup sections">
                {[
                  { id: "table", label: "The essentials", icon: Users },
                  { id: "blinds", label: "Blinds & timing", icon: Timer },
                  {
                    id: "rules",
                    label: "House rules",
                    icon: SlidersHorizontal,
                  },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={tab === t.id}
                    className={tab === t.id ? "active" : ""}
                    onClick={() => setTab(t.id)}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>
              {tab === "table" && (
                <div className="setup-panel">
                  <div className="form-grid">
                    {mode === "settings" && (
                      <label className="field">
                        <span>Table name</span>
                        <input
                          required
                          value={settings.name}
                          onChange={(e) => update("name", e.target.value)}
                        />
                      </label>
                    )}
                    {num("startingStack", "Starting chips", 100, 1000000)}
                    {num("maxPlayers", "Seats at the table", 2, 12)}
                    {num("turnSeconds", "Seconds per decision", 10, 120)}
                    <label className="field">
                      <span>Your surroundings</span>
                      <select
                        value={settings.roomTheme}
                        onChange={(e) =>
                          update(
                            "roomTheme",
                            e.target.value as GameSettings["roomTheme"],
                          )
                        }
                      >
                        <option value="turf">The Turf · Oxford pub</option>
                        <option value="penthouse">
                          The High Roller · Penthouse
                        </option>
                        <option value="basement">
                          The Garden Shed · Bare essentials
                        </option>
                      </select>
                    </label>
                  </div>
                  <div className="note">
                    ♠ &nbsp; No-limit Texas Hold’em. One table. Up to 12
                    legends.
                  </div>
                </div>
              )}
              {tab === "blinds" && (
                <div className="setup-panel">
                  <div className="blind-table">
                    <div className="blind-head">
                      <span>Level</span>
                      <span>Small</span>
                      <span>Big</span>
                      <span>Ante</span>
                      <span>Mins</span>
                      <span />
                    </div>
                    {settings.levels.map((level, i) => (
                      <div className="blind-row" key={i}>
                        <b>{String(i + 1).padStart(2, "0")}</b>
                        {(["small", "big", "ante", "minutes"] as const).map(
                          (k) => (
                            <input
                              key={k}
                              aria-label={`Level ${i + 1} ${k}`}
                              required
                              type="number"
                              min={k === "ante" ? 0 : 1}
                              max={k === "minutes" ? 120 : 1000000}
                              value={level[k]}
                              onChange={(e) =>
                                update(
                                  "levels",
                                  settings.levels.map((l, j) =>
                                    i === j
                                      ? { ...l, [k]: Number(e.target.value) }
                                      : l,
                                  ),
                                )
                              }
                            />
                          ),
                        )}
                        <button
                          type="button"
                          aria-label={`Remove level ${i + 1}`}
                          disabled={settings.levels.length === 1}
                          onClick={() =>
                            update(
                              "levels",
                              settings.levels.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => {
                      const l = settings.levels.at(-1)!;
                      update("levels", [
                        ...settings.levels,
                        {
                          small: l.small * 2,
                          big: l.big * 2,
                          ante: l.ante * 2,
                          minutes: l.minutes,
                        },
                      ]);
                    }}
                  >
                    <Plus size={14} /> Add blind level
                  </button>
                  <div className="form-grid">
                    {num(
                      "breakEveryLevels",
                      "Break every N levels",
                      0,
                      24,
                      "0 = no scheduled breaks",
                    )}
                    {num("breakMinutes", "Break length (minutes)", 1, 30)}
                  </div>
                  <div className="note">
                    New blinds and scheduled breaks take effect between hands.
                    The last blind level repeats.
                  </div>
                </div>
              )}
              {tab === "rules" && (
                <div className="setup-panel">
                  {toggle(
                    "rebuys",
                    "Second chances",
                    "Allow busted players to rebuy with play chips.",
                  )}
                  {settings.rebuys && (
                    <div className="form-grid">
                      {num("maxRebuys", "Rebuys per player", 1, 10)}
                      {num(
                        "rebuyUntilLevel",
                        "Rebuy through level",
                        1,
                        settings.levels.length,
                      )}
                    </div>
                  )}
                  {toggle(
                    "lateRegistration",
                    "Fashionably late",
                    "New players wait for the next hand to be seated.",
                  )}
                  {settings.lateRegistration &&
                    num(
                      "lateRegistrationUntilLevel",
                      "Registration through level",
                      1,
                      settings.levels.length,
                    )}
                  {toggle(
                    "allowSpectators",
                    "A seat on the rail",
                    "Let spectators and eliminated players watch.",
                  )}
                  {toggle(
                    "banter",
                    "Bring the banter",
                    "Voluntary character animations and table one-liners.",
                  )}
                  {toggle(
                    "dealerVoice",
                    "Voices around the table",
                    "Monty calls the game. Each character voices their own actions and banter.",
                  )}
                  {toggle(
                    "autoNextHand",
                    "Keep the cards coming",
                    "Deal the next hand automatically after showdown.",
                  )}
                  <div className="form-grid">
                    {num("nextHandSeconds", "Show / muck & celebration (seconds)", 8, 60)}
                    <label className="field">
                      <span>Spectator chat</span>
                      <select
                        value={settings.spectatorChat}
                        onChange={(e) =>
                          update(
                            "spectatorChat",
                            e.target.value as "separate" | "table",
                          )
                        }
                      >
                        <option value="separate">
                          Separate rail (recommended)
                        </option>
                        <option value="table">Shared table chat</option>
                      </select>
                    </label>
                  </div>
                  <div className="note">
                    The action clock checks when possible, otherwise folds.
                    Spectators never receive hidden cards.
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="modal-footer">
            <span>NO BUY-IN. ALL BRAGGING RIGHTS.</span>
            <button className="btn primary" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "settings"
                  ? "Save house rules"
                  : mode === "join"
                    ? spectator
                      ? "Join the rail"
                      : "Take my seat"
                    : "Create my table"}
              <ArrowRight size={17} />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
