import { useState } from "react";
import { Theme } from "../theme";
import { ResponseLength, NarrationPerspective, Pacing, PresenceState, PresenceMode } from "../types";
import { IconChevronRight, IconClapper, IconX } from "./Icons";

interface DirectorBarProps {
  connected: boolean;
  responseLength: ResponseLength;
  narrationPerspective: NarrationPerspective;
  pacing: Pacing;
  /** The one-shot cue currently queued for the next reply ("" when none). */
  pendingBeat: string;
  /** Whether — and after how long a silence — the character may speak first. */
  presence: PresenceState;
  theme: Theme;
  onLengthChange: (v: ResponseLength) => void;
  onPerspectiveChange: (v: NarrationPerspective) => void;
  onPacingChange: (v: Pacing) => void;
  onBeat: (cue: string) => void;
  onClearBeat: () => void;
  onPresenceChange: (next: PresenceState) => void;
}

// One-shot scene beats. `cue` is the instruction sent to the model for the next
// reply only; {{char}} is expanded server-side. Keep labels short and punchy.
const BEATS: { label: string; cue: string; title: string }[] = [
  { label: "Advance time", cue: "Skip ahead in time and resume the scene at a meaningful later moment.", title: "Jump the story forward in time" },
  { label: "Raise stakes", cue: "Raise the tension or stakes — introduce a complication, threat, or obstacle.", title: "Add tension or a complication" },
  { label: "Lighten up", cue: "Lighten the mood with warmth, banter, or a touch of humor.", title: "Bring in levity / humor" },
  { label: "Surprise me", cue: "Introduce an unexpected but fitting twist or new development.", title: "Throw in an unexpected twist" },
  { label: "Romance", cue: "Increase the romantic tension between the characters.", title: "Increase romantic tension" },
  { label: "More dialogue", cue: "Lean into spoken dialogue and {{char}}'s voice this reply.", title: "Favor dialogue this reply" },
  { label: "Set the scene", cue: "Pause to richly describe the setting, atmosphere, and {{char}}'s surroundings.", title: "Describe the environment vividly" },
  { label: "Inner thoughts", cue: "Reveal {{char}}'s private inner thoughts and feelings this reply.", title: "Surface the character's interiority" },
];

const LENGTHS: { v: ResponseLength; label: string; title: string }[] = [
  { v: "brief", label: "Brief", title: "~2-4 sentences" },
  { v: "normal", label: "Normal", title: "1-2 paragraphs" },
  { v: "detailed", label: "Detailed", title: "2-4 rich paragraphs" },
  { v: "novella", label: "Novella", title: "Long, novel-style prose" },
];

const PERSPECTIVES: { v: NarrationPerspective; label: string; title: string }[] = [
  { v: "default", label: "Auto", title: "Let the character decide" },
  { v: "first", label: "First person", title: 'Narrated as "I"' },
  { v: "third", label: "Third person", title: "Narrated like a novel" },
];

const PACINGS: { v: Pacing; label: string; title: string }[] = [
  { v: "slow", label: "Slow-burn", title: "Linger, build tension gradually" },
  { v: "steady", label: "Steady", title: "Natural pacing" },
  { v: "advance", label: "Advance", title: "Keep the plot moving" },
];

const PRESENCES: { v: PresenceMode; label: string; title: string }[] = [
  { v: "off", label: "Off", title: "The character only ever answers you" },
  { v: "rarely", label: "Rarely", title: "One quiet beat after a long silence" },
  { v: "often", label: "Often", title: "Speaks up readily, up to a few beats in a row" },
];

// Offered quiet windows. Anything shorter than half a minute reads as impatience
// rather than presence, so the shortest option is deliberately not shorter.
const QUIET_WINDOWS = [30, 60, 90, 120, 300, 600];

function formatQuiet(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

/**
 * Director Bar — live, in-the-moment control over how the character writes.
 *
 * The length / perspective / pacing dials are persistent (sent as `set_style`)
 * and shape every reply; the scene beats are one-shot cues (`set_director_beat`)
 * that steer only the next response, then clear themselves.
 */
export function DirectorBar({
  connected,
  responseLength,
  narrationPerspective,
  pacing,
  pendingBeat,
  presence,
  theme,
  onLengthChange,
  onPerspectiveChange,
  onPacingChange,
  onBeat,
  onClearBeat,
  onPresenceChange,
}: DirectorBarProps) {
  const [open, setOpen] = useState(false);
  const [customCue, setCustomCue] = useState("");

  const Segmented = <T extends string>({
    value,
    options,
    onChange,
  }: {
    value: T;
    options: { v: T; label: string; title: string }[];
    onChange: (v: T) => void;
  }) => (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.v}
          disabled={!connected}
          title={o.title}
          data-active={value === o.v}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );

  return (
    <div
      style={{
        padding: "7px 20px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
      }}
    >
      {/* Header / collapse toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? "Collapse director controls" : "Expand director controls"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: theme.colors.textPrimary,
            padding: 0,
          }}
        >
          <span style={{
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s",
            display: "inline-flex",
            color: theme.colors.textTertiary,
          }}>
            <IconChevronRight size={13} />
          </span>
          <span className="label-caps" style={{ color: theme.colors.textSecondary }}>Director</span>
        </button>

        {pendingBeat ? (
          <span
            title={pendingBeat}
            className="fade-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 420,
              padding: "3px 6px 3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: theme.colors.primaryLight,
              color: theme.colors.primary,
              border: `1px solid ${theme.colors.primary}`,
            }}
          >
            <IconClapper size={12} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Next reply: {pendingBeat}
            </span>
            <button
              onClick={onClearBeat}
              title="Cancel queued cue"
              style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", padding: 2 }}
            >
              <IconX size={12} />
            </button>
          </span>
        ) : (
          <span style={{ fontSize: 12, color: theme.colors.textTertiary }}>
            Steer length, voice &amp; pacing — or cue the next beat
          </span>
        )}
      </div>

      {open && (
        <div className="fade-up" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
          {/* Persistent dials */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <Field label="Length">
              <Segmented value={responseLength} options={LENGTHS} onChange={onLengthChange} />
            </Field>
            <Field label="Voice">
              <Segmented value={narrationPerspective} options={PERSPECTIVES} onChange={onPerspectiveChange} />
            </Field>
            <Field label="Pacing">
              <Segmented value={pacing} options={PACINGS} onChange={onPacingChange} />
            </Field>
          </div>

          {/* Idle presence — whether the character fills a silence on their own */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <Field label="Presence">
              <Segmented
                value={presence.mode}
                options={PRESENCES}
                onChange={(mode) => onPresenceChange({ ...presence, mode })}
              />
            </Field>
            {presence.mode !== "off" && (
              <Field label="After">
                <select
                  className="input"
                  disabled={!connected}
                  value={presence.idleSeconds}
                  title="How long the room stays quiet before the character speaks first"
                  onChange={(e) => onPresenceChange({ ...presence, idleSeconds: Number(e.target.value) })}
                  style={{ fontSize: 12, padding: "4px 6px" }}
                >
                  {QUIET_WINDOWS.map((s) => (
                    <option key={s} value={s}>{formatQuiet(s)} of quiet</option>
                  ))}
                </select>
              </Field>
            )}
            <span style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              {presence.mode === "off"
                ? "The character waits to be spoken to."
                : presence.mode === "rarely"
                  ? "After a long silence, one quiet beat — then they wait again."
                  : "They'll fill a lull on their own, a few beats before falling quiet."}
            </span>
          </div>

          {/* One-shot scene beats */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span className="label-caps">Beats</span>
            {BEATS.map((b) => (
              <button
                key={b.label}
                className="chip"
                disabled={!connected}
                title={b.title}
                onClick={() => onBeat(b.cue)}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Custom one-shot cue */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              className="input"
              value={customCue}
              disabled={!connected}
              placeholder="Direct the scene… (e.g. a knock at the door interrupts you)"
              onChange={(e) => setCustomCue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customCue.trim()) {
                  onBeat(customCue.trim());
                  setCustomCue("");
                }
              }}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost"
              disabled={!connected || !customCue.trim()}
              onClick={() => { onBeat(customCue.trim()); setCustomCue(""); }}
              title="Queue this cue for the next reply"
            >
              <IconClapper size={14} /> Queue cue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
