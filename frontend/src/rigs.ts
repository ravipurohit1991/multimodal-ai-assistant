import { Character, RigBone, RiggedCharacter, RigLayer, RigLayerKind, RigAssetSource } from "./types";

interface CreateRigOptions {
  id?: string;
  seed?: string;
  source?: RigAssetSource;
  sourceImage?: string | null;
}

const PALETTES = [
  { skin: "#d79a73", hair: "#29211d", outfit: "#2f6f73", outfitAlt: "#d8b45f", accent: "#eb6f92" },
  { skin: "#b77957", hair: "#5a3429", outfit: "#4d5f9e", outfitAlt: "#eef0f5", accent: "#f0a35e" },
  { skin: "#f0c7a6", hair: "#74513a", outfit: "#7b4c88", outfitAlt: "#54b399", accent: "#f7d154" },
  { skin: "#8c5a43", hair: "#1c1a22", outfit: "#405c3f", outfitAlt: "#c7d4d8", accent: "#d65f5f" },
  { skin: "#c88d62", hair: "#e7d38b", outfit: "#2f5078", outfitAlt: "#cf615d", accent: "#79c6d0" },
  { skin: "#e0ad8b", hair: "#3b2b51", outfit: "#6d6b46", outfitAlt: "#f2eee4", accent: "#b86cbe" },
];

export function makeRigId(prefix = "rig"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function bone(id: string, parent: string | null, x: number, y: number, rotation = 0, length = 0): RigBone {
  return { id, parent, x, y, rotation, length };
}

function layer(
  id: string,
  boneId: string,
  kind: RigLayerKind,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  opts: Partial<RigLayer> = {},
): RigLayer {
  return { id, boneId, kind, x, y, width, height, zIndex, ...opts };
}

function withAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}

export function createGeneratedRig(name: string, options: CreateRigOptions = {}): RiggedCharacter {
  const id = options.id ?? makeRigId("rig");
  const random = mulberry32(hashString(options.seed ?? id));
  const palette = pick(PALETTES, random);
  const source = options.source ?? "generated";
  const sourceImage = options.sourceImage ?? null;

  const headW = 62 + Math.round(random() * 10);
  const headH = 68 + Math.round(random() * 10);
  const shoulderW = 58 + Math.round(random() * 10);
  const torsoH = 76 + Math.round(random() * 8);
  const handSize = 18 + Math.round(random() * 3);
  const boot = withAlpha(palette.hair, "ee");

  const bones: RigBone[] = [
    bone("root", null, 110, 220),
    bone("hips", "root", 0, 0, 0, 34),
    bone("torso", "hips", 0, -52, 0, 58),
    bone("chest", "torso", 0, -42, 0, shoulderW),
    bone("neck", "chest", 0, -37, 0, 18),
    bone("head", "neck", 0, -28, 0, 36),
    bone("leftUpperArm", "chest", -shoulderW / 2, -26, 8, 48),
    bone("leftForearm", "leftUpperArm", -9, 48, -8, 46),
    bone("leftHand", "leftForearm", -3, 45, 0, 10),
    bone("rightUpperArm", "chest", shoulderW / 2, -26, -8, 48),
    bone("rightForearm", "rightUpperArm", 9, 48, 8, 46),
    bone("rightHand", "rightForearm", 3, 45, 0, 10),
    bone("leftThigh", "hips", -19, 4, 2, 62),
    bone("leftShin", "leftThigh", 1, 58, -2, 58),
    bone("leftFoot", "leftShin", -2, 55, 0, 22),
    bone("rightThigh", "hips", 19, 4, -2, 62),
    bone("rightShin", "rightThigh", -1, 58, 2, 58),
    bone("rightFoot", "rightShin", 2, 55, 0, 22),
  ];

  const layers: RigLayer[] = [
    layer("left-shin", "leftShin", "capsule", 0, 27, 17, 58, 1, { fill: palette.outfitAlt }),
    layer("right-shin", "rightShin", "capsule", 0, 27, 17, 58, 1, { fill: palette.outfitAlt }),
    layer("left-foot", "leftFoot", "capsule", -7, 8, 34, 14, 2, { fill: boot, rotation: 4 }),
    layer("right-foot", "rightFoot", "capsule", 7, 8, 34, 14, 2, { fill: boot, rotation: -4 }),
    layer("left-thigh", "leftThigh", "capsule", 0, 30, 23, 64, 3, { fill: palette.outfit }),
    layer("right-thigh", "rightThigh", "capsule", 0, 30, 23, 64, 3, { fill: palette.outfit }),
    layer("left-upper-arm", "leftUpperArm", "capsule", 0, 24, 18, 52, 4, { fill: palette.outfit }),
    layer("right-upper-arm", "rightUpperArm", "capsule", 0, 24, 18, 52, 4, { fill: palette.outfit }),
    layer("hips", "hips", "capsule", 0, -4, 62, 37, 5, { fill: palette.outfit }),
    layer("torso", "torso", "capsule", 0, -8, 72, torsoH, 6, { fill: palette.outfit }),
    layer("chest-panel", "chest", "capsule", 0, -22, shoulderW + 36, 48, 7, {
      fill: palette.outfitAlt,
      opacity: 0.92,
    }),
    layer("neck", "neck", "capsule", 0, -4, 18, 24, 8, { fill: palette.skin }),
    layer("left-forearm", "leftForearm", "capsule", 0, 23, 16, 48, 9, { fill: palette.skin }),
    layer("right-forearm", "rightForearm", "capsule", 0, 23, 16, 48, 9, { fill: palette.skin }),
    layer("left-hand", "leftHand", "ellipse", 0, 4, handSize, handSize, 10, { fill: palette.skin }),
    layer("right-hand", "rightHand", "ellipse", 0, 4, handSize, handSize, 10, { fill: palette.skin }),
    layer("hair-back", "head", "ellipse", 0, -16, headW + 13, headH + 16, 11, {
      fill: palette.hair,
      role: "hair",
    }),
    layer("head", "head", "ellipse", 0, -8, headW, headH, 12, {
      fill: palette.skin,
      role: "head",
    }),
    layer("hair-fringe", "head", "capsule", 0, -38, headW + 6, 24, 13, {
      fill: palette.hair,
      rotation: -4 + random() * 8,
      role: "hair",
    }),
    layer("left-eye", "head", "ellipse", -15, -12, 7, 9, 14, {
      fill: "#151824",
      role: "eye-left",
    }),
    layer("right-eye", "head", "ellipse", 15, -12, 7, 9, 14, {
      fill: "#151824",
      role: "eye-right",
    }),
    layer("left-brow", "head", "capsule", -15, -25, 17, 4, 15, {
      fill: palette.hair,
      role: "brow-left",
    }),
    layer("right-brow", "head", "capsule", 15, -25, 17, 4, 15, {
      fill: palette.hair,
      role: "brow-right",
    }),
    layer("mouth", "head", "ellipse", 0, 12, 18, 6, 16, {
      fill: "#7a2c34",
      role: "mouth",
    }),
    layer("accent", "chest", "ellipse", 0, -18, 15, 15, 17, {
      fill: palette.accent,
      opacity: 0.95,
    }),
  ];

  if (sourceImage) {
    layers.push(
      layer("source-head-image", "head", "image", 0, -9, headW - 5, headH - 5, 13.5, {
        image: sourceImage,
        opacity: 0.96,
        role: "head",
      }),
    );
  }

  return {
    id,
    name: name.trim() ? `${name.trim()} rig` : "Generated rig",
    source,
    createdAt: new Date().toISOString(),
    anatomy: "humanoid-2d",
    bounds: { width: 220, height: 330 },
    bones,
    layers,
    palette,
    sourceImage,
  };
}

export function createUploadedRig(name: string, image: string): RiggedCharacter {
  return createGeneratedRig(name, {
    source: "uploaded",
    sourceImage: image,
  });
}

export function createFallbackRig(character: Character): RiggedCharacter {
  return createGeneratedRig(character.name || "Character", {
    id: `fallback_${character.id}`,
    seed: character.id || character.name || "fallback",
    source: "fallback",
    sourceImage: character.avatar,
  });
}

export function rigSummary(rig: RiggedCharacter): string {
  const source = rig.source === "uploaded" ? "uploaded picture" : rig.source;
  return `${rig.bones.length} bones, ${rig.layers.length} layers, ${source}`;
}
