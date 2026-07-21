export type ServerMsg =
  | { type: "config"; tts_engine?: string; llm_model?: string; output_mode?: string }
  | { type: "ack"; use_context?: boolean; include_imagegen?: boolean; include_mood?: boolean; include_animation?: boolean; system_prompt_updated?: boolean; voice?: string; llm_model?: string; lorebook_entries?: number; author_note_set?: boolean; response_length?: ResponseLength; narration_perspective?: NarrationPerspective; pacing?: Pacing; director_beat?: string }
  | { type: "director_beat_consumed" }
  | { type: "ack_recording"; recording: boolean }
  | { type: "mood"; mood: string }
  | { type: "animation_directive"; directive: StageAnimationDirective }
  | { type: "transcript"; text: string }
  | { type: "assistant_start" }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_end"; elapsed_ms?: number; approx_tokens?: number }
  | { type: "speaker_chosen"; name: string }
  | { type: "assistant_cancelled" }
  | { type: "audio_start"; sample_rate: number; format: "pcm16le" }
  | { type: "audio_end" }
  | { type: "interrupted" }
  | { type: "chat_cleared" }
  | { type: "tts_engine_changed"; tts_engine: string; message?: string }
  | { type: "available_voices"; voices: string[]; current: string }
  | { type: "llm_payload"; payload: any }
  | { type: "image_generating"; prompt: string }
  | { type: "image_generated"; image: string; prompt: string; format: string }
  | { type: "image_error"; error: string; prompt: string }
  | { type: "impersonation_start" }
  | { type: "impersonation_end"; text: string }
  | { type: "suggestions"; items: string[] }
  | { type: "scene_updated"; time: string; weather: string; location: string }
  | { type: "wiped_all"; summary?: any }
  | { type: "error"; message: string };

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  image?: string;
  imagePrompt?: string;
  characterImage?: string;  // Character image for this message
  swipes?: string[];        // Alternative generated variants of this message
  swipeIndex?: number;      // Currently displayed variant index
  mood?: string;            // Character mood captured when this reply arrived
  animation?: StageAnimationDirective; // High-level acting direction for the rig stage
  speaker?: string;         // Which cast character authored this reply (group scenes)
  narrator?: boolean;       // Rendered as omniscient scene narration, not dialogue
  genMs?: number;           // Generation wall time reported by the backend
  genTokens?: number;       // Approximate token count of this generation
}

export type RigAssetSource = "generated" | "uploaded" | "fallback";
export type RigLayerKind = "capsule" | "ellipse" | "rect" | "image";
export type RigExpressionRole =
  | "head"
  | "hair"
  | "eye-left"
  | "eye-right"
  | "brow-left"
  | "brow-right"
  | "mouth";

export interface RigBone {
  id: string;
  parent: string | null;
  x: number;
  y: number;
  rotation: number;
  length: number;
}

export interface RigLayer {
  id: string;
  boneId: string;
  kind: RigLayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  rx?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  image?: string | null;
  zIndex: number;
  role?: RigExpressionRole;
}

export interface RiggedCharacter {
  id: string;
  name: string;
  source: RigAssetSource;
  createdAt: string;
  anatomy: "humanoid-2d";
  bounds: { width: number; height: number };
  bones: RigBone[];
  layers: RigLayer[];
  palette: {
    skin: string;
    hair: string;
    outfit: string;
    outfitAlt: string;
    accent: string;
  };
  sourceImage?: string | null;
}

export interface StageAnimationDirective {
  raw?: string;
  speaker?: string;
  emotion?: string;
  gesture?: string;
  posture?: string;
  gaze?: string;
  target?: string;
  intensity?: number;
  duration?: number;
  startedAt?: number;
  pose?: Record<string, StageBoneOffset>;
  motion?: Record<string, StageMotionOffset>;
}

export interface StageBoneOffset {
  x?: number;
  y?: number;
  rotation?: number;
}

export interface StageMotionOffset extends StageBoneOffset {
  speed?: number;
  phase?: number;
}

/** A saved conversation in the server-side session library. */
export interface SessionSummary {
  id: string;
  name: string;
  saved_at: string;
  message_count: number;
  character: string;
  preview: string;
}

/**
 * A roleplay character in the roster. Each carries its own identity and, when
 * multiple are "in scene", forms the cast you can direct. The optional
 * per-character systemPrompt overrides the global base instructions.
 */
export interface Character {
  id: string;
  name: string;
  description: string;   // character definition / description
  personality: string;
  systemPrompt: string;  // per-character base instruction ("" = use global default)
  firstMessage: string;
  avatar: string | null; // data URL, purely for display
  rigId?: string | null; // reusable 2D rig asset for the animated stage
  inScene: boolean;      // part of the active cast for the current scene
}

/**
 * Lorebook / World Info entry. Keyword-triggered (or always-on "constant")
 * facts that get injected into the LLM context to keep long roleplays
 * consistent without cluttering the visible chat.
 */
export interface LorebookEntry {
  id: string;
  title: string;
  keys: string;       // Comma/newline separated trigger keywords (UI form)
  content: string;
  enabled: boolean;
  constant: boolean;  // Always inject, ignore keywords
}

export interface VoiceInfo {
  name: string;
  metadata: any;
}

/** Scene atmosphere — a persistent sense of place that grounds the roleplay and
 * drives the app's ambient theming. Empty values mean "unset". */
export type SceneTime = "" | "dawn" | "morning" | "midday" | "afternoon" | "dusk" | "night";
export type SceneWeather = "" | "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "wind";

export interface SceneState {
  time: SceneTime;
  weather: SceneWeather;
  location: string;
}

export type InputMode = "voice" | "text" | "call";
export type OutputMode = "voice" | "text";
export type TtsEngine = "piper" | "chatterbox" | "soprano";

/** Director controls — persistent dials that shape how the character writes. */
export type ResponseLength = "brief" | "normal" | "detailed" | "novella";
export type NarrationPerspective = "default" | "first" | "third";
export type Pacing = "slow" | "steady" | "advance";

export interface ModelInfo {
  name: string;
  model?: string;
  voice?: string;
  host?: string;
  device: string;
  loaded: boolean;
  memory_mb: number;
  lora?: boolean;
}

export interface GPUInfo {
  device_id: number;
  name: string;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  utilization_percent: number;
  temperature_c?: number;
  power_usage_w?: number;
}

export interface SystemInfo {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  process_ram_mb: number;
  process_cpu_percent: number;
}

export interface ModelStatus {
  low_vram_mode: boolean;
  models: {
    stt?: ModelInfo;
    tts?: ModelInfo;
    llm?: ModelInfo;
    image_explainer?: ModelInfo;
    image_generator?: ModelInfo;
  };
  gpus?: GPUInfo[];
  system?: SystemInfo;
  cuda?: {
    available: boolean;
    device_count?: number;
    current_device?: number;
  };
}
