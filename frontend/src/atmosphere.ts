// Turns the scene (time of day, weather) and the character's mood into ambient
// UI cues: option lists for the SceneBar, icons, and — most importantly — the
// soft reactive gradient that tints the conversation's reading area so the app
// visually breathes with the story.

import { SceneTime, SceneWeather } from "./types";

export interface SceneOption<T> {
  v: T;
  label: string;
  icon: string;
}

// Ordered so the segmented picker reads like a natural day/weather cycle.
export const TIME_OPTIONS: SceneOption<Exclude<SceneTime, "">>[] = [
  { v: "dawn", label: "Dawn", icon: "🌅" },
  { v: "morning", label: "Morning", icon: "🌤️" },
  { v: "midday", label: "Midday", icon: "☀️" },
  { v: "afternoon", label: "Afternoon", icon: "🌇" },
  { v: "dusk", label: "Dusk", icon: "🌆" },
  { v: "night", label: "Night", icon: "🌙" },
];

export const WEATHER_OPTIONS: SceneOption<Exclude<SceneWeather, "">>[] = [
  { v: "clear", label: "Clear", icon: "☀️" },
  { v: "cloudy", label: "Cloudy", icon: "☁️" },
  { v: "rain", label: "Rain", icon: "🌧️" },
  { v: "storm", label: "Storm", icon: "⛈️" },
  { v: "snow", label: "Snow", icon: "❄️" },
  { v: "fog", label: "Fog", icon: "🌫️" },
  { v: "wind", label: "Wind", icon: "🌬️" },
];

// Per-time-of-day accent pair (top → bottom of the reading area). Kept as full
// hex; alpha is applied at render time so the tint stays subtle in both themes.
const TIME_TINTS: Record<Exclude<SceneTime, "">, [string, string]> = {
  dawn: ["#ff9e7d", "#ffd6a5"],
  morning: ["#ffe29a", "#cfe8ff"],
  midday: ["#bfe3ff", "#eaf6ff"],
  afternoon: ["#ffc98b", "#ff9e7d"],
  dusk: ["#a86bd6", "#ff7e5f"],
  night: ["#3b4a7a", "#131d38"],
};

export function timeIcon(time: SceneTime): string {
  return TIME_OPTIONS.find((o) => o.v === time)?.icon ?? "🕰️";
}

export function weatherIcon(weather: SceneWeather): string {
  return WEATHER_OPTIONS.find((o) => o.v === weather)?.icon ?? "";
}

export function timeLabel(time: SceneTime): string {
  return TIME_OPTIONS.find((o) => o.v === time)?.label ?? "";
}

export function weatherLabel(weather: SceneWeather): string {
  return WEATHER_OPTIONS.find((o) => o.v === weather)?.label ?? "";
}

/** True when the scene carries any atmosphere worth rendering. */
export function hasScene(time: SceneTime, weather: SceneWeather, location: string): boolean {
  return Boolean(time || weather || (location && location.trim()));
}

// Append an alpha byte (0..1) to a #RRGGBB color, yielding #RRGGBBAA.
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/**
 * Build the ambient reading-area background: a mood-tinted glow overhead layered
 * over a gentle time-of-day wash, all resolved down onto the theme's base color
 * so text stays readable. Returns `base` unchanged when there is nothing to show.
 */
export function buildAmbient(opts: {
  time: SceneTime;
  moodColor: string | null;
  base: string;
  themeName: "light" | "dark";
}): string {
  const { time, moodColor, base, themeName } = opts;
  const dark = themeName === "dark";
  const layers: string[] = [];

  // Mood glow — a soft aura at the top-center that colors the emotional tone.
  if (moodColor) {
    layers.push(
      `radial-gradient(135% 85% at 50% -20%, ${withAlpha(moodColor, dark ? 0.22 : 0.16)}, transparent 55%)`
    );
  }

  // Time-of-day wash.
  if (time && time in TIME_TINTS) {
    const [top, bottom] = TIME_TINTS[time as Exclude<SceneTime, "">];
    const alpha = dark ? 0.24 : 0.14;
    layers.push(
      `linear-gradient(180deg, ${withAlpha(top, alpha)} 0%, ${withAlpha(bottom, alpha * 0.65)} 100%)`
    );
  }

  if (layers.length === 0) return base;
  return `${layers.join(", ")}, ${base}`;
}
