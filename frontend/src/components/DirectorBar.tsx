import { useState } from "react";
import { Theme } from "../theme";
import { ResponseLength, NarrationPerspective, Pacing } from "../types";

interface DirectorBarProps {
  connected: boolean;
  responseLength: ResponseLength;
  narrationPerspective: NarrationPerspective;
  pacing: Pacing;
  /** The one-shot cue currently queued for the next reply ("" when none). */
  pendingBeat: string;
  theme: Theme;
  onLengthChange: (v: ResponseLength) => void;
  onPerspectiveChange: (v: NarrationPerspective) => void;
  onPacingChange: (v: Pacing) => void;
  onBeat: (cue: string) => void;
  onClearBeat: () => void;
}

// One-shot scene beats. `cue` is the instruction sent to the model for the next
// reply only; {{char}} is expanded server-side. Keep labels short and punchy.
const BEATS: { label: string; cue: string; title: string }[] = [
  { label: "⏩ Advance time", cue: "Skip ahead in time and resume the scene at a meaningful later moment.", title: "Jump the story forward in time" },
  { label: "🔥 Raise stakes", cue: "Raise the tension or stakes — introduce a complication, threat, or obstacle.", title: "Add tension or a complication" },
  { label: "😂 Lighten up", cue: "Lighten the mood with warmth, banter, or a touch of humor.", title: "Bring in levity / humor" },
  { label: "🔀 Surprise me", cue: "Introduce an unexpected but fitting twist or new development.", title: "Throw in an unexpected twist" },
  { label: "💞 Romance", cue: "Increase the romantic tension between the characters.", title: "Increase romantic tension" },
  { label: "💬 More dialogue", cue: "Lean into spoken dialogue and {{char}}'s voice this reply.", title: "Favor dialogue this reply" },
  { label: "🎬 Set the scene", cue: "Pause to richly describe the setting, atmosphere, and {{char}}'s surroundings.", title: "Describe the environment vividly" },
  { label: "🧠 Inner thoughts", cue: "Reveal {{char}}'s private inner thoughts and feelings this reply.", title: "Surface the character's interiority" },
];

const LENGTHS: { v: ResponseLength; label: string; title: string }[] = [
  { v: "brief", label: "✂️ Brief", title: "~2-4 sentences" },
  { v: "normal", label: "📄 Normal", title: "1-2 paragraphs" },
  { v: "detailed", label: "📚 Detailed", title: "2-4 rich paragraphs" },
  { v: "novella", label: "📖 Novella", title: "Long, novel-style prose" },
];

const PERSPECTIVES: { v: NarrationPerspective; label: string; title: string }[] = [
  { v: "default", label: "Auto", title: "Let the character decide" },
  { v: "first", label: "1st · I", title: 'First person ("I")' },
  { v: "third", label: "3rd", title: "Third person, novel-style" },
];

const PACINGS: { v: Pacing; label: string; title: string }[] = [
  { v: "slow", label: "🐢 Slow-burn", title: "Linger, build tension gradually" },
  { v: "steady", label: "🚶 Steady", title: "Natural pacing" },
  { v: "advance", label: "⏩ Advance", title: "Keep the plot moving" },
];

/**
 * Director Bar — live, in-the-moment control over how the character writes.
 *
 * The length / perspective / pacing dials are persistent (sent as `set_style`)
 * and shape every reply; the scene beats are one-shot cues (`set_director_beat`)
 * that steer only the next response, then clear themselves. Together they let
 * the user steer the story without leaving the conversation or editing prompts.
 */
export function DirectorBar({
  connected,
  responseLength,
  narrationPerspective,
  pacing,
  pendingBeat,
  theme,
  onLengthChange,
  onPerspectiveChange,
  onPacingChange,
  onBeat,
  onClearBeat,
}: DirectorBarProps) {
  const [open, setOpen] = useState(true);
  const [customCue, setCustomCue] = useState("");

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: connected ? "pointer" : "not-allowed",
    border: "none",
    borderRight: `1px solid ${theme.colors.border}`,
    background: active ? theme.colors.secondary : "transparent",
    color: active ? "white" : theme.colors.textSecondary,
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  });

  const Segmented = <T extends string>({
    value,
    options,
    onChange,
  }: {
    value: T;
    options: { v: T; label: string; title: string }[];
    onChange: (v: T) => void;
  }) => (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${theme.colors.border}`,
        opacity: connected ? 1 : 0.6,
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.v}
          disabled={!connected}
          title={o.title}
          onClick={() => onChange(o.v)}
          style={{ ...segBtn(value === o.v), ...(i === options.length - 1 ? { borderRight: "none" } : {}) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </span>
      {children}
    </div>
  );

  return (
    <div
      style={{
        padding: "10px 24px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
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
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: theme.colors.textPrimary,
            fontWeight: 700,
            fontSize: 13,
            padding: 0,
          }}
        >
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
          🎬 Director
        </button>

        {pendingBeat ? (
          <span
            title={pendingBeat}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 360,
              padding: "3px 8px 3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: `${theme.colors.secondary}22`,
              color: theme.colors.secondary,
              border: `1px solid ${theme.colors.secondary}`,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🎬 Cue queued: {pendingBeat}
            </span>
            <button
              onClick={onClearBeat}
              title="Cancel queued cue"
              style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ✕
            </button>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: theme.colors.textTertiary }}>
            Steer length, voice &amp; pacing — or drop a one-shot scene cue
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Persistent dials */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
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

          {/* One-shot scene beats */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {BEATS.map((b) => (
              <button
                key={b.label}
                disabled={!connected}
                title={b.title}
                onClick={() => onBeat(b.cue)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  cursor: connected ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (connected) { e.currentTarget.style.background = theme.colors.secondary; e.currentTarget.style.color = "white"; e.currentTarget.style.borderColor = "transparent"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = theme.colors.surface; e.currentTarget.style.color = theme.colors.textPrimary; e.currentTarget.style.borderColor = theme.colors.border; }}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Custom one-shot cue */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
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
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.surface,
                color: theme.colors.textPrimary,
                outline: "none",
              }}
            />
            <button
              disabled={!connected || !customCue.trim()}
              onClick={() => { onBeat(customCue.trim()); setCustomCue(""); }}
              title="Queue this cue for the next reply"
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                border: "none",
                background: connected && customCue.trim() ? theme.colors.buttonPrimary : theme.colors.buttonDisabled,
                color: "white",
                cursor: connected && customCue.trim() ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              🎬 Queue cue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
