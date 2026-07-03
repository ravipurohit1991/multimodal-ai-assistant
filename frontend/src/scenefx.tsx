import { useEffect, useRef } from "react";
import { SceneTime, SceneWeather } from "./types";

/**
 * SceneFX — the living stage.
 *
 * A lightweight canvas layer over the conversation that renders the current
 * scene as motion: rain streaks, drifting snow, fog banks, wind, lightning,
 * stars at night, fireflies at dusk. Purely decorative (pointer-events: none),
 * capped particle counts, paused when the tab is hidden, and disabled entirely
 * for prefers-reduced-motion.
 */

interface SceneFXProps {
  time: SceneTime;
  weather: SceneWeather;
  themeName: "light" | "dark";
  enabled: boolean;
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  alpha: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function SceneFX({ time, weather, themeName, enabled }: SceneFXProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dark = themeName === "dark";
    // What plays on stage: weather wins; otherwise the night sky / dusk glow.
    const mode: string =
      weather === "rain" || weather === "storm" || weather === "snow" ||
      weather === "fog" || weather === "wind"
        ? weather
        : time === "night"
          ? "stars"
          : time === "dusk"
            ? "fireflies"
            : "";
    if (!mode) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // ----- Particle setup per mode -----
    const parts: Particle[] = [];
    const count =
      mode === "rain" ? 80 :
      mode === "storm" ? 130 :
      mode === "snow" ? 60 :
      mode === "wind" ? 34 :
      mode === "fog" ? 7 :
      mode === "stars" ? 90 :
      mode === "fireflies" ? 16 : 0;

    for (let i = 0; i < count; i++) {
      if (mode === "rain" || mode === "storm") {
        parts.push({
          x: rand(-40, width + 40), y: rand(-height, height),
          vx: mode === "storm" ? rand(-160, -90) : rand(-60, -30),
          vy: mode === "storm" ? rand(950, 1300) : rand(650, 950),
          size: rand(9, 17), phase: 0, alpha: rand(0.12, 0.3),
        });
      } else if (mode === "snow") {
        parts.push({
          x: rand(0, width), y: rand(-height, height),
          vx: 0, vy: rand(22, 55),
          size: rand(1, 2.8), phase: rand(0, Math.PI * 2), alpha: rand(0.25, 0.7),
        });
      } else if (mode === "wind") {
        parts.push({
          x: rand(-60, width), y: rand(0, height),
          vx: rand(240, 430), vy: rand(-12, 12),
          size: rand(16, 42), phase: rand(0, Math.PI * 2), alpha: rand(0.06, 0.16),
        });
      } else if (mode === "fog") {
        parts.push({
          x: rand(-0.3 * width, width), y: rand(0.1 * height, 0.95 * height),
          vx: rand(6, 17) * (Math.random() < 0.5 ? -1 : 1), vy: 0,
          size: rand(0.28, 0.55) * Math.max(width, 480), phase: rand(0, Math.PI * 2), alpha: rand(0.04, 0.085),
        });
      } else if (mode === "stars") {
        parts.push({
          x: rand(0, width), y: rand(0, height * 0.7),
          vx: 0, vy: 0,
          size: rand(0.5, 1.6), phase: rand(0, Math.PI * 2), alpha: rand(0.3, 0.9),
        });
      } else if (mode === "fireflies") {
        parts.push({
          x: rand(0, width), y: rand(height * 0.25, height * 0.95),
          vx: rand(-14, 14), vy: rand(-9, 9),
          size: rand(1.2, 2.2), phase: rand(0, Math.PI * 2), alpha: rand(0.4, 0.9),
        });
      }
    }

    // Lightning state for storms.
    let flash = 0;
    let nextFlash = performance.now() + rand(3500, 9000);

    const rainColor = dark ? "rgba(178, 196, 224, A)" : "rgba(112, 132, 164, A)";
    const snowColor = dark ? "rgba(232, 238, 248, A)" : "rgba(255, 255, 255, A)";
    const windColor = dark ? "rgba(200, 210, 228, A)" : "rgba(130, 142, 164, A)";
    const fogColor = dark ? "216, 222, 236" : "244, 244, 248";
    const starColor = dark ? "rgba(235, 240, 252, A)" : "rgba(120, 134, 168, A)";
    const flyColor = "rgba(224, 186, 100, A)";

    let raf = 0;
    let last = performance.now();
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const p of parts) {
        if (mode === "rain" || mode === "storm") {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > height + 20) { p.y = rand(-40, -10); p.x = rand(-40, width + 60); }
          ctx.strokeStyle = rainColor.replace("A", String(p.alpha));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.02, p.y + p.size);
          ctx.stroke();
        } else if (mode === "snow") {
          p.phase += dt * 0.9;
          p.x += Math.sin(p.phase) * 14 * dt + 6 * dt;
          p.y += p.vy * dt;
          if (p.y > height + 4) { p.y = -4; p.x = rand(0, width); }
          if (p.x > width + 4) p.x = -4;
          ctx.fillStyle = snowColor.replace("A", String(p.alpha));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === "wind") {
          p.phase += dt * 2;
          p.x += p.vx * dt; p.y += (p.vy + Math.sin(p.phase) * 16) * dt;
          if (p.x > width + 60) { p.x = -60; p.y = rand(0, height); }
          ctx.strokeStyle = windColor.replace("A", String(p.alpha));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + p.size * 0.5, p.y - 3, p.x + p.size, p.y);
          ctx.stroke();
        } else if (mode === "fog") {
          p.x += p.vx * dt;
          if (p.vx > 0 && p.x - p.size > width) p.x = -p.size;
          if (p.vx < 0 && p.x + p.size < 0) p.x = width + p.size;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, `rgba(${fogColor}, ${p.alpha})`);
          g.addColorStop(1, `rgba(${fogColor}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === "stars") {
          p.phase += dt * rand(0.4, 1.2);
          const tw = 0.5 + 0.5 * Math.sin(p.phase);
          ctx.fillStyle = starColor.replace("A", String(p.alpha * (0.35 + 0.65 * tw) * (dark ? 1 : 0.5)));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === "fireflies") {
          p.phase += dt * rand(1.2, 2.2);
          p.vx += rand(-30, 30) * dt; p.vy += rand(-24, 24) * dt;
          p.vx = Math.max(-22, Math.min(22, p.vx));
          p.vy = Math.max(-16, Math.min(16, p.vy));
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 0) p.x = width; if (p.x > width) p.x = 0;
          if (p.y < height * 0.15) p.y = height * 0.95;
          if (p.y > height) p.y = height * 0.3;
          const glow = 0.25 + 0.75 * Math.max(0, Math.sin(p.phase));
          const a = p.alpha * glow * (dark ? 1 : 0.55);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
          g.addColorStop(0, flyColor.replace("A", String(a)));
          g.addColorStop(1, flyColor.replace("A", "0"));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Storm lightning: a soft double-flash washing the stage.
      if (mode === "storm") {
        if (now >= nextFlash) {
          flash = rand(0.14, 0.24);
          nextFlash = now + (Math.random() < 0.3 ? rand(120, 260) : rand(4000, 11000));
        }
        if (flash > 0.003) {
          ctx.fillStyle = `rgba(226, 232, 250, ${flash})`;
          ctx.fillRect(0, 0, width, height);
          flash *= Math.pow(0.0018, dt); // fast exponential decay
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.clearRect(0, 0, width, height);
    };
  }, [time, weather, themeName, enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
