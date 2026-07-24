export type ServerMsg =
  | { type: "config"; tts_engine?: string; llm_model?: string; output_mode?: string }
  | { type: "ack"; use_context?: boolean; include_imagegen?: boolean; include_mood?: boolean; include_animation?: boolean; system_prompt_updated?: boolean; voice?: string; llm_model?: string; lorebook_entries?: number; author_note_set?: boolean; response_length?: ResponseLength; narration_perspective?: NarrationPerspective; pacing?: Pacing; director_beat?: string; presence_mode?: PresenceMode; presence_idle_seconds?: number }
  | { type: "director_beat_consumed" }
  | { type: "presence_beat"; accepted: boolean; reason?: string }
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
  | { type: "memory_updated"; summary: string; covered: number; total: number; pending: number; enabled: boolean; auto: boolean; keep_recent: number; trigger: number; unchanged?: boolean }
  | { type: "memory_status"; busy: boolean }
  | { type: "canon_updated"; facts: CanonFact[]; enabled: boolean; auto: boolean; covered: number; total: number; added?: number; unchanged?: boolean }
  | { type: "continuity_status"; busy: boolean }
  | { type: "continuity_alert"; items: ContinuityReport[] }
  | { type: "continuity_resolved"; action: string }
  | { type: "story_threads_updated"; threads: StoryThread[]; enabled: boolean; auto: boolean; covered: number; total: number; added?: number; unchanged?: boolean }
  | { type: "story_threads_status"; busy: boolean }
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
  unprompted?: boolean;     // The character spoke first, into a silence
  bookmarked?: boolean;     // A user-saved story moment, persisted with the transcript
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

/**
 * Story Memory — the rolling record the model writes of everything that has
 * scrolled out of its context window. `summary` is the record itself (editable);
 * `covered` is how many messages it stands in for, and `pending` how many are
 * waiting to be folded in.
 */
export interface MemoryState {
  enabled: boolean;
  auto: boolean;
  summary: string;
  covered: number;
  total: number;
  pending: number;
  keepRecent: number;
  trigger: number;
}

export const DEFAULT_MEMORY: MemoryState = {
  enabled: true,
  auto: true,
  summary: "",
  covered: 0,
  total: 0,
  pending: 0,
  keepRecent: 12,
  trigger: 20,
};

/**
 * Continuity Guard — the story's canon and the check that guards it.
 *
 * A `CanonFact` is one durable detail the story established: an eye colour, who
 * holds the key, who is dead, what was promised. The ledger is injected into
 * every turn so contradictions mostly never get written, and each new reply is
 * read back against it so the ones that slip through are caught while they are
 * still the latest message. `pinned` marks a fact as yours — never auto-revised,
 * never evicted when the ledger fills up.
 */
export interface CanonFact {
  id: string;
  subject: string;
  text: string;
  turn: number;
  pinned: boolean;
}

/** One reported conflict between the latest reply and an established fact. */
export interface ContinuityReport {
  fact_id: string;
  /** The canon line as it stands, rendered for display. */
  fact: string;
  /** The words in the reply that broke it. */
  quote: string;
  why: string;
  /** What the fact would become if the new reply is accepted as true. */
  revised: string;
}

export interface ContinuityState {
  enabled: boolean;
  auto: boolean;
  facts: CanonFact[];
  covered: number;
}

export const DEFAULT_CONTINUITY: ContinuityState = {
  enabled: false,
  auto: true,
  facts: [],
  covered: 0,
};

/**
 * An unresolved dramatic hook the story can return to: a promise, goal,
 * mystery, secret, threat, or relationship tension. Resolved and dropped
 * threads stay in the story archive so they can be reviewed or reopened.
 */
export type StoryThreadKind =
  | "goal"
  | "promise"
  | "mystery"
  | "secret"
  | "threat"
  | "relationship"
  | "other";

export type StoryThreadStatus = "active" | "resolved" | "dropped";

export interface StoryThread {
  id: string;
  title: string;
  summary: string;
  kind: StoryThreadKind;
  status: StoryThreadStatus;
  /** Pinned threads are retained and prioritized, including after they are archived. */
  pinned: boolean;
  /** Transcript message count when the thread first appeared. */
  createdTurn: number;
  /** Transcript message count when the thread last materially changed. */
  updatedTurn: number;
  /** Present when the thread was resolved or dropped against a specific turn. */
  resolvedTurn?: number;
}

export interface StoryThreadsState {
  enabled: boolean;
  auto: boolean;
  threads: StoryThread[];
  /** Number of transcript messages already examined by automatic tracking. */
  covered: number;
}

export const DEFAULT_STORY_THREADS: StoryThreadsState = {
  enabled: true,
  auto: true,
  threads: [],
  covered: 0,
};

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

/**
 * Idle presence — whether the character may take a turn of their own when the
 * conversation goes quiet, instead of waiting to be spoken to. "rarely" waits
 * out a much longer silence and speaks up once; "often" is more forward and may
 * stack a few beats before falling quiet again. The browser owns the clock (it
 * can see typing, the mic, and window focus); the backend decides whether an
 * ask is granted.
 */
export type PresenceMode = "off" | "rarely" | "often";

export interface PresenceState {
  mode: PresenceMode;
  /** Quiet stretch, in seconds, before the character may speak up. */
  idleSeconds: number;
}

export const DEFAULT_PRESENCE: PresenceState = { mode: "off", idleSeconds: 90 };

/** How much longer "rarely" waits than the configured quiet window. */
export const PRESENCE_WAIT_FACTOR: Record<PresenceMode, number> = {
  off: 0,
  rarely: 2.5,
  often: 1,
};

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
