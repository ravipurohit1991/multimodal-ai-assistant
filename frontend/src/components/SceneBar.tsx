import { useEffect, useState } from "react";
import { Theme } from "../theme";
import { SceneState, SceneTime, SceneWeather } from "../types";
import {
  TIME_OPTIONS,
  WEATHER_OPTIONS,
  timeIcon,
  weatherIcon,
  timeLabel,
  weatherLabel,
  hasScene,
} from "../atmosphere";

interface SceneBarProps {
  connected: boolean;
  scene: SceneState;
  /** Whether the character may advance the scene itself via [SCENE: ...] tags. */
  autoScene: boolean;
  theme: Theme;
  onSceneChange: (next: SceneState) => void;
  onToggleAutoScene: (enabled: boolean) => void;
}

/**
 * Scene Bar — a persistent sense of place for the roleplay.
 *
 * Setting the time of day, weather, and location grounds the character's prose
 * (the values are injected into every turn) and tints the conversation's ambient
 * background so the app visually reflects where the story is happening. Clicking
 * an already-active time/weather chip clears it, so scenes stay optional.
 */
export function SceneBar({
  connected,
  scene,
  autoScene,
  theme,
  onSceneChange,
  onToggleAutoScene,
}: SceneBarProps) {
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(scene.location);

  // Keep the local location draft in sync when the scene is replaced externally
  // (e.g. loading a saved session).
  useEffect(() => setLoc(scene.location), [scene.location]);

  const active = hasScene(scene.time, scene.weather, scene.location);

  const commit = (patch: Partial<SceneState>) => onSceneChange({ ...scene, ...patch });

  // Clicking the current value again clears it, keeping scenes toggle-able.
  const pickTime = (v: Exclude<SceneTime, "">) => commit({ time: scene.time === v ? "" : v });
  const pickWeather = (v: Exclude<SceneWeather, "">) =>
    commit({ weather: scene.weather === v ? "" : v });

  const commitLocation = () => {
    const next = loc.trim();
    if (next !== scene.location) commit({ location: next });
  };

  const chip = (activeChip: boolean, icon: string, label: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 999,
    border: `1px solid ${activeChip ? "transparent" : theme.colors.border}`,
    background: activeChip ? theme.colors.secondary : theme.colors.surface,
    color: activeChip ? "white" : theme.colors.textSecondary,
    cursor: connected ? "pointer" : "not-allowed",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  });

  return (
    <div
      style={{
        padding: "8px 24px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
      }}
    >
      {/* Summary row — always visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? "Close scene setup" : "Set the scene"}
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
          <span
            style={{
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
              display: "inline-block",
            }}
          >
            ▶
          </span>
          🎞️ Scene
        </button>

        {active ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12.5,
              color: theme.colors.textSecondary,
            }}
          >
            {scene.time && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 15 }}>{timeIcon(scene.time)}</span>
                {timeLabel(scene.time)}
              </span>
            )}
            {scene.weather && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 15 }}>{weatherIcon(scene.weather)}</span>
                {weatherLabel(scene.weather)}
              </span>
            )}
            {scene.location && (
              <span
                title={scene.location}
                style={{
                  fontStyle: "italic",
                  maxWidth: 340,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                — {scene.location}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: theme.colors.textTertiary }}>
            Ground the story in a time, weather &amp; place — the character stays in it
          </span>
        )}

        {active && (
          <button
            onClick={() => {
              setLoc("");
              onSceneChange({ time: "", weather: "", location: "" });
            }}
            title="Clear the scene"
            disabled={!connected}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: theme.colors.textTertiary,
              cursor: connected ? "pointer" : "not-allowed",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Time" theme={theme}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TIME_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  disabled={!connected}
                  onClick={() => pickTime(o.v)}
                  style={chip(scene.time === o.v, o.icon, o.label)}
                >
                  <span style={{ fontSize: 15 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Weather" theme={theme}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {WEATHER_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  disabled={!connected}
                  onClick={() => pickWeather(o.v)}
                  style={chip(scene.weather === o.v, o.icon, o.label)}
                >
                  <span style={{ fontSize: 15 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Place" theme={theme}>
            <input
              type="text"
              value={loc}
              disabled={!connected}
              placeholder="Where are we? (e.g. a candlelit tavern, a rain-soaked rooftop)"
              onChange={(e) => setLoc(e.target.value)}
              onBlur={commitLocation}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              style={{
                flex: 1,
                minWidth: 260,
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.surface,
                color: theme.colors.textPrimary,
                outline: "none",
              }}
            />
          </Field>

          {/* Let the story drive the setting on its own */}
          <label
            title="The character can advance the time, weather, or location during the scene"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: theme.colors.textSecondary,
              cursor: connected ? "pointer" : "not-allowed",
            }}
          >
            <input
              type="checkbox"
              checked={autoScene}
              disabled={!connected}
              onChange={(e) => onToggleAutoScene(e.target.checked)}
              style={{ cursor: connected ? "pointer" : "not-allowed" }}
            />
            <span style={{ fontWeight: 600 }}>🪄 Let the story change the scene</span>
            <span style={{ color: theme.colors.textTertiary }}>
              — the character can move the time, weather &amp; place as the story unfolds
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: theme.colors.textTertiary,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          minWidth: 62,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
