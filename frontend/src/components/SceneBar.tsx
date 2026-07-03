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
import { IconChevronRight, IconX, IconVolume, IconVolumeOff, IconSparkles } from "./Icons";

interface SceneBarProps {
  connected: boolean;
  scene: SceneState;
  /** Whether the character may advance the scene itself via [SCENE: ...] tags. */
  autoScene: boolean;
  /** Stage effects — weather/night particles over the reading area. */
  fxEnabled: boolean;
  /** Synthesized scene ambience (rain, wind, thunder, crickets). */
  soundOn: boolean;
  soundVolume: number;
  theme: Theme;
  onSceneChange: (next: SceneState) => void;
  onToggleAutoScene: (enabled: boolean) => void;
  onToggleFx: (enabled: boolean) => void;
  onToggleSound: (enabled: boolean) => void;
  onSoundVolume: (v: number) => void;
}

/**
 * Scene Bar — a persistent sense of place for the roleplay.
 *
 * Time, weather, and location ground the character's prose (injected into
 * every turn) and drive the stage itself: the ambient backdrop, the particle
 * effects, and the synthesized soundscape. Clicking an active chip clears it.
 */
export function SceneBar({
  connected,
  scene,
  autoScene,
  fxEnabled,
  soundOn,
  soundVolume,
  theme,
  onSceneChange,
  onToggleAutoScene,
  onToggleFx,
  onToggleSound,
  onSoundVolume,
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

  return (
    <div
      style={{
        padding: "7px 20px",
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
          <span className="label-caps" style={{ color: theme.colors.textSecondary }}>Scene</span>
        </button>

        {active ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 12.5,
              color: theme.colors.textSecondary,
              minWidth: 0,
            }}
          >
            {scene.time && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 14 }}>{timeIcon(scene.time)}</span>
                {timeLabel(scene.time)}
              </span>
            )}
            {scene.weather && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 14 }}>{weatherIcon(scene.weather)}</span>
                {weatherLabel(scene.weather)}
              </span>
            )}
            {scene.location && (
              <span
                title={scene.location}
                style={{
                  fontFamily: theme.fonts.prose,
                  fontStyle: "italic",
                  maxWidth: 320,
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
          <span style={{ fontSize: 12, color: theme.colors.textTertiary }}>
            Ground the story in a time, weather &amp; place
          </span>
        )}

        {/* Stage controls — effects & ambience, right-aligned */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
          {soundOn && (
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(soundVolume * 100)}
              onChange={(e) => onSoundVolume(Number(e.target.value) / 100)}
              title="Ambience volume"
              style={{ width: 74, height: 4, cursor: "pointer" }}
            />
          )}
          <button
            className="icon-btn"
            onClick={() => onToggleSound(!soundOn)}
            data-active={soundOn}
            title={soundOn ? "Mute scene ambience" : "Play scene ambience (rain, wind, thunder, crickets — synthesized locally)"}
          >
            {soundOn ? <IconVolume size={15} /> : <IconVolumeOff size={15} />}
          </button>
          <button
            className="icon-btn"
            onClick={() => onToggleFx(!fxEnabled)}
            data-active={fxEnabled}
            title={fxEnabled ? "Hide stage effects (weather & night particles)" : "Show stage effects (weather & night particles)"}
          >
            <IconSparkles size={15} />
          </button>
          {active && (
            <button
              className="icon-btn"
              onClick={() => {
                setLoc("");
                onSceneChange({ time: "", weather: "", location: "" });
              }}
              title="Clear the scene"
              disabled={!connected}
            >
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="fade-up" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
          <Field label="Time">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {TIME_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  className="chip"
                  disabled={!connected}
                  data-active={scene.time === o.v}
                  onClick={() => pickTime(o.v)}
                >
                  <span style={{ fontSize: 13 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Weather">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {WEATHER_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  className="chip"
                  disabled={!connected}
                  data-active={scene.weather === o.v}
                  onClick={() => pickWeather(o.v)}
                >
                  <span style={{ fontSize: 13 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Place">
            <input
              type="text"
              className="input"
              value={loc}
              disabled={!connected}
              placeholder="Where are we? (e.g. a candlelit tavern, a rain-soaked rooftop)"
              onChange={(e) => setLoc(e.target.value)}
              onBlur={commitLocation}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              style={{ flex: 1, minWidth: 260 }}
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
              paddingLeft: 72,
            }}
          >
            <input
              type="checkbox"
              checked={autoScene}
              disabled={!connected}
              onChange={(e) => onToggleAutoScene(e.target.checked)}
            />
            <span style={{ fontWeight: 500 }}>Let the story change the scene</span>
            <span style={{ color: theme.colors.textTertiary }}>
              — the character can move time, weather &amp; place as the story unfolds
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="label-caps" style={{ minWidth: 62 }}>{label}</span>
      {children}
    </div>
  );
}
