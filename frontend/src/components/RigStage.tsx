import { useEffect, useMemo, useState } from "react";
import { Character, Message, RigBone, RiggedCharacter, RigLayer, StageAnimationDirective } from "../types";
import { Theme } from "../theme";
import { moodToColor } from "../mood";
import { createFallbackRig } from "../rigs";

type ActorAction = "speaking" | "reacting" | "listening" | "idle";
type MoodFamily =
  | "happy"
  | "sad"
  | "angry"
  | "nervous"
  | "surprised"
  | "confident"
  | "flirty"
  | "tired"
  | "calm";

interface RigStageProps {
  characters: Character[];
  selectedId: string;
  rigAssets: RiggedCharacter[];
  conversationHistory: Message[];
  assistantMood: string;
  stageDirective: StageAnimationDirective | null;
  isStreaming: boolean;
  immersive?: boolean;
  theme: Theme;
}

interface BonePose {
  x?: number;
  y?: number;
  rotation?: number;
}

interface WorldBone {
  x: number;
  y: number;
  rotation: number;
}

interface RigExpression {
  family: MoodFamily;
  mouthOpen: number;
  gazeX: number;
  blink: boolean;
}

const SLOT_X: Record<number, number[]> = {
  1: [450],
  2: [330, 570],
  3: [245, 450, 655],
  4: [190, 365, 535, 710],
};

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0";
}

function rotate(x: number, y: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function familyFromMood(mood: string): MoodFamily {
  const m = mood.toLowerCase();
  if (/(happy|joy|cheer|delight|content|excited|eager|thrill)/.test(m)) return "happy";
  if (/(sad|hurt|melancholy|gloom|down|sorrow)/.test(m)) return "sad";
  if (/(angry|mad|furious|irritat|annoy)/.test(m)) return "angry";
  if (/(nervous|anxious|worried|uneasy|afraid|scared|fear)/.test(m)) return "nervous";
  if (/(surpris|shock|amaze|astonish)/.test(m)) return "surprised";
  if (/(confident|proud|smug)/.test(m)) return "confident";
  if (/(flirt|charm|teas|bashful|shy|fluster)/.test(m)) return "flirty";
  if (/(tired|sleep|exhaust|bored)/.test(m)) return "tired";
  return "calm";
}

function lastAssistantMessage(history: Message[]): Message | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i];
  }
  return null;
}

function lastMoodForCharacter(history: Message[], character: Character, solo: boolean): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant" || !msg.mood) continue;
    if (solo || msg.speaker === character.name) return msg.mood;
  }
  return "";
}

function computeWorldBones(rig: RiggedCharacter, pose: Record<string, BonePose>): Record<string, WorldBone> {
  const world: Record<string, WorldBone> = {};
  const pending = [...rig.bones];
  let guard = 0;

  while (pending.length && guard < rig.bones.length * 3) {
    guard += 1;
    const b = pending.shift() as RigBone;
    const parent = b.parent ? world[b.parent] : null;
    if (b.parent && !parent) {
      pending.push(b);
      continue;
    }
    const p = pose[b.id] ?? {};
    const localX = b.x + (p.x ?? 0);
    const localY = b.y + (p.y ?? 0);
    const localRotation = b.rotation + (p.rotation ?? 0);
    if (!parent) {
      world[b.id] = { x: localX, y: localY, rotation: localRotation };
    } else {
      const offset = rotate(localX, localY, parent.rotation);
      world[b.id] = {
        x: parent.x + offset.x,
        y: parent.y + offset.y,
        rotation: parent.rotation + localRotation,
      };
    }
  }

  return world;
}

function addPose(target: Record<string, BonePose>, id: string, patch: BonePose) {
  const prev = target[id] ?? {};
  target[id] = {
    x: (prev.x ?? 0) + (patch.x ?? 0),
    y: (prev.y ?? 0) + (patch.y ?? 0),
    rotation: (prev.rotation ?? 0) + (patch.rotation ?? 0),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function motionEnvelope(directive: StageAnimationDirective, time: number): { age: number; scale: number } {
  const duration = clampNumber(directive.duration, 0.2, 8) ?? 1.8;
  const startedAt = clampNumber(directive.startedAt, 0, Number.POSITIVE_INFINITY);
  if (startedAt === null) return { age: time, scale: 1 };

  const age = Math.max(0, time - startedAt);
  const attack = Math.min(0.35, duration * 0.2);
  let scale = 1;
  if (attack > 0 && age < attack) {
    scale = age / attack;
  }
  return { age, scale: clamp01(scale) };
}

function addModelOffset(
  bones: Record<string, BonePose>,
  id: string,
  patch: BonePose,
  scale: number,
  translationGain = 1,
  rotationGain = 1,
) {
  if (scale <= 0) return;
  const x = clampNumber(patch.x, -80, 80);
  const y = clampNumber(patch.y, -80, 80);
  const rotation = clampNumber(patch.rotation, -120, 120);
  const scaled: BonePose = {
    ...(x !== null ? { x: x * scale * translationGain } : {}),
    ...(y !== null ? { y: y * scale * translationGain } : {}),
    ...(rotation !== null ? { rotation: rotation * scale * rotationGain } : {}),
  };
  if (scaled.x === undefined && scaled.y === undefined && scaled.rotation === undefined) return;
  addPose(bones, id, scaled);
}

function applyModelMotion(
  bones: Record<string, BonePose>,
  directive: StageAnimationDirective | null | undefined,
  time: number,
  intensity: number,
) {
  if (!directive?.pose && !directive?.motion) return;

  const { age, scale } = motionEnvelope(directive, time);
  const baseScale = clamp01(intensity) * scale;

  for (const [id, offset] of Object.entries(directive.pose ?? {})) {
    addModelOffset(bones, id, offset, baseScale, 1.35, 1.15);
  }

  for (const [id, offset] of Object.entries(directive.motion ?? {})) {
    const speed = clampNumber(offset.speed, 0, 8) ?? 2.2;
    const phase = clampNumber(offset.phase, -Math.PI * 2, Math.PI * 2) ?? 0;
    const wave = Math.sin(age * speed + phase);
    addModelOffset(bones, id, offset, baseScale * wave, 3.2, 1.8);
  }
}

function buildPose(
  action: ActorAction,
  mood: string,
  time: number,
  index: number,
  directive?: StageAnimationDirective | null,
): {
  bones: Record<string, BonePose>;
  expression: RigExpression;
} {
  const phase = time + index * 0.71;
  const family = familyFromMood(mood);
  const idle = Math.sin(phase * 2.1);
  const breathe = Math.sin(phase * 1.35);
  const talk = action === "speaking" ? (Math.sin(time * 13 + index) + 1) / 2 : 0;
  const gesture = (directive?.gesture || "").toLowerCase();
  const posture = (directive?.posture || "").toLowerCase();
  const intensity = clamp01(typeof directive?.intensity === "number" ? directive.intensity : 0.65);
  const bones: Record<string, BonePose> = {};

  addPose(bones, "root", { y: idle * 1.8 });
  addPose(bones, "hips", { rotation: breathe * 1.1 });
  addPose(bones, "torso", { rotation: -breathe * 1.2 });
  addPose(bones, "chest", { rotation: breathe * 1.4 });
  addPose(bones, "head", { rotation: Math.sin(phase * 1.7) * 2.2 });
  addPose(bones, "leftUpperArm", { rotation: Math.sin(phase * 1.1) * 2 });
  addPose(bones, "rightUpperArm", { rotation: -Math.sin(phase * 1.05) * 2 });
  addPose(bones, "leftForearm", { rotation: Math.sin(phase * 1.4) * 1.6 });
  addPose(bones, "rightForearm", { rotation: -Math.sin(phase * 1.35) * 1.6 });

  if (action === "speaking") {
    const sway = Math.sin(time * 4.2 + index);
    addPose(bones, "root", { y: -2 + Math.sin(time * 6) * 1.4 });
    addPose(bones, "chest", { rotation: sway * 2.2 });
    addPose(bones, "head", { rotation: sway * 2.8 });
    addPose(bones, "rightUpperArm", { rotation: -22 - sway * 8 });
    addPose(bones, "rightForearm", { rotation: -22 + sway * 12 });
    addPose(bones, "leftUpperArm", { rotation: 8 + sway * 4 });
    addPose(bones, "leftForearm", { rotation: 8 - sway * 4 });
  } else if (action === "listening") {
    addPose(bones, "head", { rotation: -4 + Math.sin(phase * 1.2) * 1.2 });
    addPose(bones, "torso", { rotation: -1.5 });
  } else if (action === "reacting") {
    addPose(bones, "head", { rotation: Math.sin(time * 3 + index) * 3 });
    addPose(bones, "rightForearm", { rotation: -10 });
  }

  if (family === "happy") {
    addPose(bones, "root", { y: -3 + Math.sin(time * 6 + index) * 2.5 });
    addPose(bones, "leftUpperArm", { rotation: -12 });
    addPose(bones, "rightUpperArm", { rotation: 12 });
    addPose(bones, "head", { rotation: Math.sin(time * 2.7) * 3 });
  } else if (family === "sad") {
    addPose(bones, "root", { y: 7 });
    addPose(bones, "torso", { rotation: 4 });
    addPose(bones, "chest", { rotation: 3 });
    addPose(bones, "head", { rotation: 9 });
    addPose(bones, "leftUpperArm", { rotation: 12 });
    addPose(bones, "rightUpperArm", { rotation: -12 });
  } else if (family === "angry") {
    addPose(bones, "root", { y: -1 });
    addPose(bones, "torso", { rotation: -4 });
    addPose(bones, "head", { rotation: -5 });
    addPose(bones, "leftUpperArm", { rotation: -16 });
    addPose(bones, "rightUpperArm", { rotation: 16 });
  } else if (family === "nervous") {
    const jitter = Math.sin(time * 18 + index) * 2;
    addPose(bones, "root", { x: jitter * 0.5 });
    addPose(bones, "head", { rotation: jitter });
    addPose(bones, "leftForearm", { rotation: 14 + jitter * 1.3 });
    addPose(bones, "rightForearm", { rotation: -14 - jitter * 1.3 });
  } else if (family === "surprised") {
    addPose(bones, "head", { rotation: -8 });
    addPose(bones, "leftUpperArm", { rotation: -34 });
    addPose(bones, "rightUpperArm", { rotation: 34 });
    addPose(bones, "leftForearm", { rotation: -18 });
    addPose(bones, "rightForearm", { rotation: 18 });
  } else if (family === "confident") {
    addPose(bones, "torso", { rotation: -3 });
    addPose(bones, "head", { rotation: -4 });
    addPose(bones, "leftForearm", { rotation: 24 });
    addPose(bones, "rightForearm", { rotation: -18 });
  } else if (family === "flirty") {
    addPose(bones, "head", { rotation: -9 + Math.sin(time * 2.2) * 2 });
    addPose(bones, "rightUpperArm", { rotation: -16 });
    addPose(bones, "rightForearm", { rotation: -32 });
  } else if (family === "tired") {
    addPose(bones, "root", { y: 5 });
    addPose(bones, "head", { rotation: 7 });
    addPose(bones, "leftUpperArm", { rotation: 8 });
    addPose(bones, "rightUpperArm", { rotation: -8 });
  }

  if (/(lean[_ -]?in|close|forward)/.test(posture)) {
    addPose(bones, "torso", { rotation: -7 * intensity });
    addPose(bones, "head", { rotation: -4 * intensity });
  }
  if (/(lean[_ -]?back|step[_ -]?back|withdraw|recoil)/.test(posture)) {
    addPose(bones, "root", { y: 3 * intensity });
    addPose(bones, "torso", { rotation: 7 * intensity });
    addPose(bones, "head", { rotation: 5 * intensity });
  }
  if (/(turn|look[_ -]?away)/.test(posture)) {
    addPose(bones, "head", { rotation: 11 * intensity });
  }
  if (/(reclin|lounge|slouch|relax|laid[_ -]?back)/.test(posture)) {
    addPose(bones, "root", { y: 5 * intensity });
    addPose(bones, "hips", { rotation: -4 * intensity });
    addPose(bones, "torso", { rotation: 8 * intensity });
    addPose(bones, "chest", { rotation: 5 * intensity });
    addPose(bones, "head", { rotation: -5 * intensity });
    addPose(bones, "leftThigh", { rotation: 5 * intensity });
    addPose(bones, "rightThigh", { rotation: -6 * intensity });
  }

  if (/(reach|offer|touch|hold[_ -]?out)/.test(gesture)) {
    addPose(bones, "rightUpperArm", { rotation: -36 * intensity });
    addPose(bones, "rightForearm", { rotation: -18 * intensity });
    addPose(bones, "rightHand", { rotation: -8 * intensity });
  }
  if (/(point|indicate)/.test(gesture)) {
    addPose(bones, "rightUpperArm", { rotation: -46 * intensity });
    addPose(bones, "rightForearm", { rotation: -35 * intensity });
    addPose(bones, "head", { rotation: -3 * intensity });
  }
  if (/(wave|greet)/.test(gesture)) {
    addPose(bones, "rightUpperArm", { rotation: -64 * intensity });
    addPose(bones, "rightForearm", { rotation: (-28 + Math.sin(time * 9) * 18) * intensity });
  }
  if (/(fold|cross).*arm|arms.*cross/.test(gesture)) {
    addPose(bones, "leftUpperArm", { rotation: -28 * intensity });
    addPose(bones, "leftForearm", { rotation: 64 * intensity });
    addPose(bones, "rightUpperArm", { rotation: 28 * intensity });
    addPose(bones, "rightForearm", { rotation: -64 * intensity });
  }
  if (/(shrug|uncertain)/.test(gesture)) {
    addPose(bones, "leftUpperArm", { rotation: -22 * intensity });
    addPose(bones, "rightUpperArm", { rotation: 22 * intensity });
    addPose(bones, "leftForearm", { rotation: -18 * intensity });
    addPose(bones, "rightForearm", { rotation: 18 * intensity });
    addPose(bones, "head", { rotation: Math.sin(time * 3) * 4 * intensity });
  }
  if (/(hand[_ -]?to[_ -]?(chest|heart)|touch[_ -]?chest)/.test(gesture)) {
    addPose(bones, "rightUpperArm", { rotation: -22 * intensity });
    addPose(bones, "rightForearm", { rotation: -58 * intensity });
  }
  if (/(foot|nudge|kick|tap|toe)/.test(gesture)) {
    const foot = Math.sin(time * 5.6 + index);
    addPose(bones, "rightThigh", { rotation: -7 * intensity });
    addPose(bones, "rightShin", { rotation: (10 + foot * 5) * intensity });
    addPose(bones, "rightFoot", {
      x: (7 + foot * 9) * intensity,
      y: -Math.abs(foot) * 3 * intensity,
      rotation: (-8 + foot * 14) * intensity,
    });
  }

  applyModelMotion(bones, directive, time, intensity);

  return {
    bones,
    expression: {
      family,
      mouthOpen: action === "speaking" ? 0.35 + talk * 0.85 : family === "surprised" ? 0.85 : 0.08,
      gazeX: action === "speaking" ? Math.sin(time * 3.3) * 0.8 : 0,
      blink: family !== "surprised" && Math.sin(time * 2.9 + index * 1.7) > 0.965,
    },
  };
}

function expressionLayer(layer: RigLayer, expression: RigExpression, gazeToActive: number) {
  let x = layer.x;
  let y = layer.y;
  let rotation = layer.rotation ?? 0;
  let scaleX = 1;
  let scaleY = 1;
  let opacity = layer.opacity ?? 1;

  if (layer.role === "eye-left" || layer.role === "eye-right") {
    x += gazeToActive * 2.4 + expression.gazeX;
    if (expression.blink || expression.family === "tired") scaleY = expression.blink ? 0.18 : 0.5;
    if (expression.family === "surprised") scaleY = 1.25;
    if (expression.family === "sad") {
      y += 2;
      scaleY = Math.min(scaleY, 0.72);
    }
  }

  if (layer.role === "brow-left") {
    if (expression.family === "angry") rotation -= 14;
    if (expression.family === "sad") rotation += 10;
    if (expression.family === "surprised") y -= 5;
  }
  if (layer.role === "brow-right") {
    if (expression.family === "angry") rotation += 14;
    if (expression.family === "sad") rotation -= 10;
    if (expression.family === "surprised") y -= 5;
  }

  if (layer.role === "mouth") {
    scaleY = Math.max(0.45, expression.mouthOpen * 2.2);
    scaleX = expression.family === "happy" || expression.family === "flirty" ? 1.35 : 1;
    if (expression.family === "sad") {
      scaleX = 0.78;
      rotation = 180;
      y += 1;
    }
    if (expression.family === "angry") scaleX = 0.72;
    if (expression.family === "surprised") {
      scaleX = 0.82;
      scaleY = 2.6;
    }
  }

  if (layer.kind === "image" && layer.role === "head") {
    opacity = expression.family === "angry" ? opacity * 0.94 : opacity;
  }

  return { x, y, rotation, scaleX, scaleY, opacity };
}

function renderLayer(layer: RigLayer, clipId: string) {
  const common = {
    fill: layer.fill ?? "transparent",
    stroke: layer.stroke ?? "none",
    strokeWidth: layer.strokeWidth ?? 0,
  };

  if (layer.kind === "ellipse") {
    return <ellipse cx={0} cy={0} rx={layer.width / 2} ry={layer.height / 2} {...common} />;
  }
  if (layer.kind === "rect") {
    return (
      <rect
        x={-layer.width / 2}
        y={-layer.height / 2}
        width={layer.width}
        height={layer.height}
        rx={layer.rx ?? 5}
        {...common}
      />
    );
  }
  if (layer.kind === "image" && layer.image) {
    return (
      <>
        <clipPath id={clipId}>
          <ellipse cx={0} cy={0} rx={layer.width / 2} ry={layer.height / 2} />
        </clipPath>
        <image
          href={layer.image}
          x={-layer.width / 2}
          y={-layer.height / 2}
          width={layer.width}
          height={layer.height}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      </>
    );
  }
  return (
    <rect
      x={-layer.width / 2}
      y={-layer.height / 2}
      width={layer.width}
      height={layer.height}
      rx={layer.rx ?? Math.min(layer.width, layer.height) / 2}
      {...common}
    />
  );
}

function RigFigure({
  rig,
  instanceId,
  mood,
  action,
  directive,
  time,
  index,
  gazeToActive,
}: {
  rig: RiggedCharacter;
  instanceId: string;
  mood: string;
  action: ActorAction;
  directive?: StageAnimationDirective | null;
  time: number;
  index: number;
  gazeToActive: number;
}) {
  const { bones, expression } = buildPose(action, mood, time, index, directive);
  const world = computeWorldBones(rig, bones);
  const sorted = [...rig.layers].sort((a, b) => a.zIndex - b.zIndex);
  const safeRigId = `${instanceId}_${rig.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  return (
    <g>
      {sorted.map((layer) => {
        const w = world[layer.boneId] ?? world.root ?? { x: 0, y: 0, rotation: 0 };
        const expr = expressionLayer(layer, expression, gazeToActive);
        const clipId = `${safeRigId}_${layer.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_clip`;
        const transform = [
          `translate(${fmt(w.x)} ${fmt(w.y)})`,
          `rotate(${fmt(w.rotation)})`,
          `translate(${fmt(expr.x)} ${fmt(expr.y)})`,
          `rotate(${fmt(expr.rotation)})`,
          `scale(${fmt(expr.scaleX)} ${fmt(expr.scaleY)})`,
        ].join(" ");
        return (
          <g key={layer.id} transform={transform} opacity={expr.opacity}>
            {renderLayer(layer, clipId)}
          </g>
        );
      })}
    </g>
  );
}

function useStageClock() {
  const [time, setTime] = useState(() => performance.now() / 1000);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    let frame = 0;
    const tick = () => {
      setTime(performance.now() / 1000);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return time;
}

export function RigStage({
  characters,
  selectedId,
  rigAssets,
  conversationHistory,
  assistantMood,
  stageDirective,
  isStreaming,
  immersive = false,
  theme,
}: RigStageProps) {
  const time = useStageClock();
  const latestAssistant = useMemo(() => lastAssistantMessage(conversationHistory), [conversationHistory]);
  const latest = conversationHistory[conversationHistory.length - 1];
  const rigById = useMemo(() => new Map(rigAssets.map((rig) => [rig.id, rig])), [rigAssets]);
  const actors = useMemo(
    () => characters.slice(0, 4).map((character) => ({
      character,
      rig: character.rigId && rigById.has(character.rigId)
        ? rigById.get(character.rigId) as RiggedCharacter
        : createFallbackRig(character),
    })),
    [characters, rigById],
  );

  if (actors.length === 0) return null;

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0];
  const solo = actors.length === 1;
  const activeName = isStreaming
    ? selected?.name
    : (latestAssistant?.speaker || (solo && latestAssistant ? actors[0].character.name : selected?.name));
  const slotXs = SLOT_X[actors.length] ?? SLOT_X[4];
  const activeIndex = Math.max(0, actors.findIndex((a) => a.character.name === activeName || a.character.id === selectedId));
  const activeSlotX = slotXs[Math.min(activeIndex, slotXs.length - 1)];
  const moodAccent = assistantMood || latestAssistant?.mood || "";
  const accent = moodAccent ? moodToColor(moodAccent) : theme.colors.secondary;
  const stageHeight = immersive ? 260 : 220;
  const stageWidth = immersive ? "min(620px, 74vw)" : "min(520px, 58vw)";

  return (
    <div
      aria-label="Animated character stage"
      style={{
        position: "sticky",
        top: 12,
        height: 0,
        zIndex: 4,
        display: "flex",
        justifyContent: immersive ? "center" : "flex-end",
        alignItems: "flex-start",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <div
        style={{
          width: stageWidth,
          height: stageHeight,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 10,
          overflow: "hidden",
          background: theme.name === "dark"
            ? "rgba(18, 20, 29, 0.74)"
            : "rgba(250, 249, 247, 0.78)",
          boxShadow: theme.colors.shadowLg,
          backdropFilter: "blur(8px)",
        }}
      >
        <svg
          viewBox="0 0 900 320"
          width="100%"
          height={stageHeight}
          role="img"
          aria-label="Rigged cast animation"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id="rig-stage-floor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={theme.colors.surfaceElevated} stopOpacity={theme.name === "dark" ? 0.08 : 0.18} />
              <stop offset="100%" stopColor={theme.colors.surfaceElevated} stopOpacity={theme.name === "dark" ? 0.22 : 0.35} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="900" height="320" fill="transparent" />
          <path
            d="M80 282 C230 258 670 258 820 282 L820 320 L80 320 Z"
            fill="url(#rig-stage-floor)"
            stroke={theme.colors.border}
            strokeOpacity={0.45}
          />
          <path
            d="M130 284 C280 270 620 270 770 284"
            fill="none"
            stroke={accent}
            strokeOpacity={0.32}
            strokeWidth={2}
          />
          {actors.map(({ character, rig }, index) => {
            const slotX = slotXs[index] ?? 450;
            const active = character.name === activeName || (character.id === selectedId && !activeName);
            const latestDirective = latestAssistant?.animation ?? null;
            const directive = active && stageDirective && (!stageDirective.speaker || stageDirective.speaker === character.name)
              ? stageDirective
              : latestDirective && (!latestDirective.speaker || latestDirective.speaker === character.name || solo)
                ? latestDirective
                : null;
            const charMood = active
              ? directive?.emotion || assistantMood || lastMoodForCharacter(conversationHistory, character, solo)
              : lastMoodForCharacter(conversationHistory, character, solo);
            const action: ActorAction = active && isStreaming
              ? "speaking"
              : active && latestAssistant
                ? "reacting"
                : latest?.role === "user"
                  ? "listening"
                  : "idle";
            const scale = actors.length === 1 ? 0.88 : actors.length === 2 ? 0.78 : 0.68;
            const bob = action === "speaking" ? Math.sin(time * 5 + index) * 1.5 : 0;
            const gazeToActive = active ? 0 : Math.sign(activeSlotX - slotX);
            const nameColor = active ? accent : theme.colors.textSecondary;
            return (
              <g key={character.id}>
                <g transform={`translate(${slotX} ${288 + bob}) scale(${scale}) translate(-110 -318)`}>
                  <RigFigure
                    rig={rig}
                    instanceId={character.id}
                    mood={charMood}
                    action={action}
                    directive={directive}
                    time={time}
                    index={index}
                    gazeToActive={gazeToActive}
                  />
                </g>
                <text
                  x={slotX}
                  y={306}
                  textAnchor="middle"
                  fill={nameColor}
                  fontFamily={theme.fonts.ui}
                  fontSize={12}
                  fontWeight={active ? 700 : 500}
                >
                  {character.name || "Unnamed"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
