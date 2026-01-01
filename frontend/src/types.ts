export type ServerMsg =
  | { type: "config"; tts_engine?: string; llm_model?: string; output_mode?: string }
  | { type: "ack"; use_context?: boolean; include_imagegen?: boolean; system_prompt_updated?: boolean; voice?: string; llm_model?: string }
  | { type: "ack_recording"; recording: boolean }
  | { type: "transcript"; text: string }
  | { type: "assistant_start" }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_end" }
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
  | { type: "error"; message: string };

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  image?: string;
  imagePrompt?: string;
  characterImage?: string;  // Character image for this message
}

export interface VoiceInfo {
  name: string;
  metadata: any;
}

export type InputMode = "voice" | "text" | "call";
export type OutputMode = "voice" | "text";
export type TtsEngine = "piper" | "chatterbox" | "soprano";

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
