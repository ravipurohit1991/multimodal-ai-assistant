import React, { useEffect, useMemo, useRef, useState } from "react";
import { startMic } from "./audio/mic";
import { PcmPlayer } from "./audio/player";
import { MicVAD } from "@ricky0123/vad-web";
import { ServerMsg, Message, VoiceInfo, InputMode, OutputMode, TtsEngine, LorebookEntry, ResponseLength, NarrationPerspective, Pacing, SceneState, Character, RiggedCharacter, StageAnimationDirective, MemoryState, DEFAULT_MEMORY } from "./types";
import { ControlSidebar } from "./components/ControlSidebar";
import { ConversationPanel } from "./components/ConversationPanel";
import { ModelStatusPanel } from "./components/ModelStatusPanel";
import { RealtimeStatusPanel } from "./components/RealtimeStatusPanel";
import { SettingsModal } from "./components/SettingsModal";
import { DebugModal } from "./components/DebugModal";
import { TextInputArea } from "./components/TextInputArea";
import { DirectorBar } from "./components/DirectorBar";
import { SceneBar } from "./components/SceneBar";
import { CastBar } from "./components/CastBar";
import { CharacterManager } from "./components/CharacterManager";
import { LorebookModal } from "./components/LorebookModal";
import { MemoryModal } from "./components/MemoryModal";
import { SessionsModal } from "./components/SessionsModal";
import { downloadJson, downloadText, readJsonFile } from "./io";
import { getTheme, applyThemeToDocument } from "./theme";
import { buildAmbient } from "./atmosphere";
import { moodToColor } from "./mood";
import { Soundscape } from "./soundscape";
import { createGeneratedRig, createUploadedRig } from "./rigs";
import { upgradeRoleplayPrompt } from "./prompts";

// Short, collision-unlikely id for roster characters.
function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Map a UI lorebook entry into the backend wire format (keys -> string[]).
function serializeLorebook(entries: LorebookEntry[]) {
  return entries.map((e) => ({
    title: e.title,
    keys: e.keys.split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
    content: e.content,
    enabled: e.enabled,
    constant: e.constant,
  }));
}

// Local storage persistence for conversation history
const HISTORY_STORAGE_KEY = "aiassistant_conversation_history";
const SETTINGS_STORAGE_KEY = "aiassistant_settings";

function saveHistoryToStorage(history: Message[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save conversation history:", e);
  }
}

function loadHistoryFromStorage(): Message[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert timestamp strings back to Date objects
      return parsed.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
    }
  } catch (e) {
    console.error("Failed to load conversation history:", e);
  }
  return [];
}

function loadSettings(): Record<string, any> {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return {};
}

function saveSettings(settings: Record<string, any>) {
  try {
    // Merge with existing settings to avoid losing other keys
    const existing = loadSettings();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...existing, ...settings }));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

function animationWithLocalStart(directive: StageAnimationDirective): StageAnimationDirective {
  return { ...directive, startedAt: performance.now() / 1000 };
}

function animationForHistory(directive: StageAnimationDirective | null): StageAnimationDirective | null {
  if (!directive) return null;
  const persistable = { ...directive };
  delete persistable.startedAt;
  return persistable;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");

  // Theme state — persisted. Dark ("ink & limelight") is the app's home look.
  const savedSettings = useMemo(() => loadSettings(), []);
  const [themeName, setThemeName] = useState<'light' | 'dark'>(savedSettings.themeName || 'dark');
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  // Mirror the theme into CSS variables so the global stylesheet follows it.
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // The active character as it was last saved. Used to seed the editable buffer
  // so a reload never loses per-character fields (system-prompt override, first
  // message, avatar) that now live only inside the roster.
  const savedActiveCharacter: Character | null = useMemo(() => {
    const roster = savedSettings.characters;
    if (Array.isArray(roster) && roster.length > 0) {
      return (roster.find((c: Character) => c.id === savedSettings.selectedCharacterId) || roster[0]) as Character;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conversation history — persisted in localStorage
  const [conversationHistory, setConversationHistory] = useState<Message[]>(loadHistoryFromStorage);
  // Immersive / cinematic reading mode — serif prose, a reactive scene/mood
  // ambient background, and collapsed side chrome. Persisted; when on, both side
  // panels start hidden so the story fills the view.
  const savedImmersive: boolean = savedSettings.immersive || false;
  const [immersive, setImmersive] = useState<boolean>(savedImmersive);
  const prevPanelsRef = useRef<{ left: boolean; right: boolean } | null>(null);

  const [showHistory, setShowHistory] = useState(true);
  const [showJsonPayload, setShowJsonPayload] = useState(false);
  const [showRealtimePanel, setShowRealtimePanel] = useState(!savedImmersive);
  const [showLeftPanel, setShowLeftPanel] = useState(!savedImmersive);
  const [showModelStatus, setShowModelStatus] = useState(false);
  const [showRealtimeUser, setShowRealtimeUser] = useState(true);
  const [showRealtimeAssistant, setShowRealtimeAssistant] = useState(true);
  const [lastLlmPayload, setLastLlmPayload] = useState<any>(null);
  const [lastLlmResponse, setLastLlmResponse] = useState<any>(null);
  const currentAssistantTextRef = useRef<string>("");
  const [editingMessage, setEditingMessage] = useState<{ index: number; text: string } | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const isImpersonatingRef = useRef(false);
  const impersonationTextRef = useRef<string>("");

  // Roleplaying settings — persisted in localStorage
  const [userName, setUserName] = useState(savedSettings.userName || "User");
  // The user's own persona — who *you* are in the scene. Optional; injected into
  // the prompt's "### User" section. Managed alongside the cast (you are part of it).
  const [userPersona, setUserPersona] = useState(savedSettings.userPersona || "");
  const [assistantName, setAssistantName] = useState(savedActiveCharacter?.name ?? (savedSettings.assistantName || "Assistant"));
  const [systemPrompt, setSystemPrompt] = useState(upgradeRoleplayPrompt(savedSettings.systemPrompt));
  const [characterDef, setCharacterDef] = useState(savedActiveCharacter?.description ?? (savedSettings.characterDef || ""));
  const [scenario, setScenario] = useState(savedSettings.scenario || "");
  const [personality, setPersonality] = useState(savedActiveCharacter?.personality ?? (savedSettings.personality || ""));
  const [firstMessage, setFirstMessage] = useState(savedActiveCharacter?.firstMessage ?? "");

  // Roleplay enrichment — Lorebook/Memory, Author's Note, and Mood indicator
  const [lorebook, setLorebook] = useState<LorebookEntry[]>(savedSettings.lorebook || []);
  const [showLorebook, setShowLorebook] = useState(false);
  const [authorNote, setAuthorNote] = useState(savedSettings.authorNote || "");
  const [authorNoteDepth, setAuthorNoteDepth] = useState<number>(
    typeof savedSettings.authorNoteDepth === "number" ? savedSettings.authorNoteDepth : 3
  );
  // Story memory — the rolling record the model keeps of everything that has
  // scrolled out of its context window. Persisted with the story so a reloaded
  // (or reopened) conversation resumes with its long-term recall intact.
  const [memory, setMemory] = useState<MemoryState>({
    ...DEFAULT_MEMORY,
    ...(savedSettings.memory as Partial<MemoryState> | undefined),
  });
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [includeMood, setIncludeMood] = useState<boolean>(savedSettings.includeMood || false);
  const [adultMode, setAdultMode] = useState<boolean>(savedSettings.adultMode === true);
  const [assistantMood, setAssistantMood] = useState("");
  const [stageEnabled, setStageEnabled] = useState<boolean>(savedSettings.stageEnabled === true);
  const [stageDirective, setStageDirective] = useState<StageAnimationDirective | null>(null);
  const swipeRegenRef = useRef<number | null>(null);

  // Director controls — persistent style dials + a one-shot scene cue.
  const [responseLength, setResponseLength] = useState<ResponseLength>(
    (savedSettings.responseLength as ResponseLength) || "normal"
  );
  const [narrationPerspective, setNarrationPerspective] = useState<NarrationPerspective>(
    (savedSettings.narrationPerspective as NarrationPerspective) || "default"
  );
  const [pacing, setPacing] = useState<Pacing>((savedSettings.pacing as Pacing) || "steady");
  const [pendingBeat, setPendingBeat] = useState("");

  // Scene atmosphere — a persistent sense of place (time / weather / location)
  // that grounds the character and drives the app's ambient theming.
  const [scene, setScene] = useState<SceneState>(
    (savedSettings.scene as SceneState) || { time: "", weather: "", location: "" }
  );
  // Auto-scene: let the character advance the setting via hidden [SCENE: ...] tags.
  const [autoScene, setAutoScene] = useState<boolean>(savedSettings.autoScene !== false);

  // The living stage — weather/night particles over the reading area, and a
  // synthesized ambience (rain, wind, thunder, crickets) that follows the scene.
  const [fxEnabled, setFxEnabled] = useState<boolean>(savedSettings.sceneFx !== false);
  const [soundOn, setSoundOn] = useState(false); // audio starts muted; enabling is a user gesture
  const [soundVolume, setSoundVolume] = useState<number>(
    typeof savedSettings.soundVolume === "number" ? savedSettings.soundVolume : 0.5
  );
  const soundscape = useMemo(() => new Soundscape(), []);
  useEffect(() => {
    soundscape.update({ time: scene.time, weather: scene.weather });
  }, [soundscape, scene.time, scene.weather]);
  useEffect(() => {
    soundscape.setVolume(soundVolume);
  }, [soundscape, soundVolume]);
  useEffect(() => () => soundscape.dispose(), [soundscape]);
  const toggleSound = (on: boolean) => {
    setSoundOn(on);
    soundscape.setEnabled(on);
  };

  // Auto-cast: in group scenes the model directs who answers. While a choice is
  // in flight, the composer text waits in this ref until `speaker_chosen` lands.
  const [autoCast, setAutoCast] = useState<boolean>(savedSettings.autoCast || false);
  const pendingAutoSendRef = useRef<{ text: string; image: string | null; asNarrator: boolean } | null>(null);

  // Server-side story library
  const [showSessions, setShowSessions] = useState(false);

  // Immersion: live streaming bubble, rich formatting, per-message mood, suggestions
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingActiveRef = useRef(false);
  const pendingMoodRef = useRef("");
  const pendingAnimationRef = useRef<StageAnimationDirective | null>(null);
  const [immersiveFormatting, setImmersiveFormatting] = useState<boolean>(
    savedSettings.immersiveFormatting !== false
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [useContext, setUseContext] = useState(true);
  const [includeImageGen, setIncludeImageGen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Character images
  const [userCharacterImage, setUserCharacterImage] = useState<string | null>(
    savedSettings.userCharacterImage || null
  );
  const [assistantCharacterImage, setAssistantCharacterImage] = useState<string | null>(
    savedActiveCharacter?.avatar ?? (savedSettings.assistantCharacterImage || null)
  );

  // ----- Character roster / cast -----
  // The active roleplay character is one entry in a roster. When two or more are
  // "in scene", they form a cast and you choose who speaks next. The active
  // character's sheet is mirrored by the buffer states above (assistantName,
  // characterDef, personality, assistantCharacterImage) plus the two below, and
  // a sync effect keeps its roster entry current.
  const [characterSystemPrompt, setCharacterSystemPrompt] = useState<string>(savedActiveCharacter?.systemPrompt ?? "");
  const [characterRigId, setCharacterRigId] = useState<string | null>(savedActiveCharacter?.rigId ?? null);
  const initialRigAssets = useMemo<RiggedCharacter[]>(() => {
    const saved = savedSettings.rigAssets;
    return Array.isArray(saved) ? saved as RiggedCharacter[] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rigAssets, setRigAssets] = useState<RiggedCharacter[]>(initialRigAssets);
  const initialRoster = useMemo<Character[]>(() => {
    const saved = savedSettings.characters;
    if (Array.isArray(saved) && saved.length > 0) return saved as Character[];
    // Migrate the pre-roster single character from existing settings.
    return [{
      id: makeId(),
      name: savedSettings.assistantName || "Assistant",
      description: savedSettings.characterDef || "",
      personality: savedSettings.personality || "",
      systemPrompt: "",
      firstMessage: "",
      avatar: savedSettings.assistantCharacterImage || null,
      rigId: null,
      inScene: true,
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [characters, setCharacters] = useState<Character[]>(initialRoster);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(() => {
    const savedId = savedSettings.selectedCharacterId;
    return savedId && initialRoster.some((c) => c.id === savedId) ? savedId : initialRoster[0].id;
  });
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  // Speaker captured at generation start, so the streamed reply is attributed to
  // the right cast member when it lands (streaming is async).
  const pendingSpeakerRef = useRef<{ name: string; avatar: string | null } | null>(null);

  const inSceneCharacters = useMemo(() => characters.filter((c) => c.inScene), [characters]);
  const isGroupScene = inSceneCharacters.length > 1;
  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId) ?? characters[0],
    [characters, selectedCharacterId]
  );

  // Call mode state
  const [inCall, setInCall] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const vadRef = useRef<MicVAD | null>(null);
  const callAudioBufferRef = useRef<Int16Array[]>([]);
  const isSendingAudioRef = useRef(false);
  const prevImageGenStateRef = useRef<boolean>(false);

  // Voice & Model settings — persisted
  const [llmHost, setLlmHost] = useState(savedSettings.llmHost || "http://localhost:11434");
  // No baked-in default: the model list comes from the configured Ollama host and
  // the user picks one, so an unknown model is never pinned behind their back.
  const [llmModel, setLlmModel] = useState<string>(savedSettings.llmModel || "");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
  const [currentVoice, setCurrentVoice] = useState(savedSettings.currentVoice || "en_GB-jenny_dioco-medium");
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>((savedSettings.ttsEngine as TtsEngine) || "piper");
  const [outputMode, setOutputMode] = useState<OutputMode>((savedSettings.outputMode as OutputMode) || "text");

  // Image Explainer settings
  const [imageExplainerProvider, setImageExplainerProvider] = useState<"local" | "ollama">("local");
  const [imageExplainerModel, setImageExplainerModel] = useState("Qwen/Qwen3-VL-2B-Instruct");

  const wsRef = useRef<WebSocket | null>(null);
  const micStopRef = useRef<null | (() => Promise<void>)>(null);

  const player = useMemo(() => new PcmPlayer(), []);
  const pendingAudioSr = useRef<number | null>(null);

  const connect = () => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws");
    ws.binaryType = "arraybuffer";
    ws.onopen = () => setConnected(true);

    ws.onmessage = async (ev) => {
      if (typeof ev.data === "string") {
        const msg: ServerMsg = JSON.parse(ev.data);
        if (msg.type === "config") {
          // Receive initial configuration from backend
          if (msg.tts_engine) setTtsEngine(msg.tts_engine as TtsEngine);
          if (msg.llm_model) setLlmModel(msg.llm_model);
          if (msg.output_mode && (msg.output_mode === "voice" || msg.output_mode === "text")) {
            setOutputMode(msg.output_mode as OutputMode);
          }
        }
        if (msg.type === "ack_recording") setRecording(msg.recording);
        if (msg.type === "transcript") {
          setTranscript(msg.text);
          if (msg.text) {
            setConversationHistory(prev => [...prev, { role: "user", content: msg.text, timestamp: new Date() }]);
          }
        }
        if (msg.type === "impersonation_start") {
          isImpersonatingRef.current = true;
          setIsImpersonating(true);
          setAssistantText("");
          impersonationTextRef.current = "";
          currentAssistantTextRef.current = "";
        }
        if (msg.type === "impersonation_end") {
          const generatedUserText = msg.text;
          isImpersonatingRef.current = false;
          setIsImpersonating(false);
          setAssistantText("");
          currentAssistantTextRef.current = "";
          impersonationTextRef.current = "";
          if (generatedUserText) {
            // Populate the text input so the user can edit before sending
            setTextInput(generatedUserText);
          }
        }
        if (msg.type === "assistant_cancelled") {
          setIsSendingMessage(false);
          setIsContinuing(false);
          swipeRegenRef.current = null;
          pendingAutoSendRef.current = null;
          pendingAnimationRef.current = null;
          setStageDirective(null);
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText("");
        }
        if (msg.type === "assistant_start") {
          if (!isImpersonatingRef.current) {
            setAssistantText("");
            currentAssistantTextRef.current = "";
            // Show the live, in-conversation streaming bubble for normal replies
            // (not for swipe regenerations, which update the existing bubble).
            if (swipeRegenRef.current === null) {
              streamingActiveRef.current = true;
              setIsStreaming(true);
              setStreamingText("");
            }
          }
        }
        if (msg.type === "assistant_delta") {
          if (isImpersonatingRef.current) {
            impersonationTextRef.current += msg.delta;
            setAssistantText("🎭 " + impersonationTextRef.current);
          } else {
            currentAssistantTextRef.current += msg.delta;
            setAssistantText(currentAssistantTextRef.current);
            if (streamingActiveRef.current) {
              setStreamingText(currentAssistantTextRef.current);
            }
          }
        }
        if (msg.type === "assistant_end") {
          const finalText = currentAssistantTextRef.current;
          const swipeTarget = swipeRegenRef.current;
          const mood = pendingMoodRef.current;
          const animation = animationForHistory(pendingAnimationRef.current);
          // Generation stats reported by the backend for this reply.
          const stats = {
            ...(msg.elapsed_ms ? { genMs: msg.elapsed_ms } : {}),
            ...(msg.approx_tokens ? { genTokens: msg.approx_tokens } : {}),
          };
          // Which cast member authored this reply (group scenes) — captured at
          // generation start so it lands on the right message.
          const sp = pendingSpeakerRef.current;
          const attribution = sp ? { speaker: sp.name, ...(sp.avatar ? { characterImage: sp.avatar } : {}) } : {};
          if (swipeTarget !== null) {
            // This generation was a "swipe" — fold the new text into the target
            // message's alternatives instead of appending a new message.
            if (finalText) {
              setConversationHistory(prev => {
                if (swipeTarget < 0 || swipeTarget >= prev.length) return prev;
                const updated = [...prev];
                const m = updated[swipeTarget];
                const existing = m.swipes ?? [m.content];
                const newSwipes = [...existing, finalText];
                updated[swipeTarget] = {
                  ...m,
                  content: finalText,
                  swipes: newSwipes,
                  swipeIndex: newSwipes.length - 1,
                  ...(mood && { mood }),
                  ...(animation && { animation }),
                  ...attribution,
                  ...stats,
                };
                return updated;
              });
              setLastLlmResponse({
                role: "assistant",
                content: finalText,
                timestamp: new Date().toISOString(),
                model: llmModel
              });
            }
            swipeRegenRef.current = null;
          } else if (finalText) {
            setConversationHistory(prev => [...prev, {
              role: "assistant",
              content: finalText,
              timestamp: new Date(),
              ...(mood && { mood }),
              ...(animation && { animation }),
              ...attribution,
              ...stats,
            }]);
            // Construct the received response object
            setLastLlmResponse({
              role: "assistant",
              content: finalText,
              timestamp: new Date().toISOString(),
              model: llmModel
            });
          }
          pendingMoodRef.current = "";
          pendingAnimationRef.current = null;
          currentAssistantTextRef.current = "";
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText("");
          setIsSendingMessage(false);
          setIsContinuing(false);
        }
        if (msg.type === "mood") {
          pendingMoodRef.current = msg.mood;
          setAssistantMood(msg.mood);
        }
        if (msg.type === "animation_directive") {
          const liveDirective = animationWithLocalStart(msg.directive);
          pendingAnimationRef.current = liveDirective;
          setStageDirective(liveDirective);
        }
        if (msg.type === "speaker_chosen") {
          // Auto-cast: the model picked who answers; release the queued message.
          autoCastDispatchRef.current(msg.name || "");
        }
        if (msg.type === "suggestions") {
          setSuggestions(msg.items || []);
          setIsSuggesting(false);
        }
        if (msg.type === "director_beat_consumed") {
          // The backend used the queued one-shot cue for this reply; clear the chip.
          setPendingBeat("");
        }
        if (msg.type === "scene_updated") {
          // Auto-scene: the character advanced the setting. Reflect it locally
          // (persistence rides the settings effect); don't echo set_scene back.
          setScene({
            time: (msg.time || "") as SceneState["time"],
            weather: (msg.weather || "") as SceneState["weather"],
            location: msg.location || "",
          });
        }
        if (msg.type === "memory_updated") {
          // The backend owns the record and the cursor; mirror its whole view so
          // the two can never drift after an edit, rewind, or reconnect.
          setMemory({
            enabled: msg.enabled,
            auto: msg.auto,
            summary: msg.summary || "",
            covered: msg.covered,
            total: msg.total,
            pending: msg.pending,
            keepRecent: msg.keep_recent,
            trigger: msg.trigger,
          });
        }
        if (msg.type === "memory_status") {
          setMemoryBusy(msg.busy);
        }
        if (msg.type === "image_generating") {
          console.log(`🎨 Generating image: ${msg.prompt}`);
          setAssistantText(current => current + "\n[Generating image...]");
        }
        if (msg.type === "image_generated") {
          console.log(`✅ Image generated: ${msg.prompt}`);
          // Add image to the last assistant message or create new one
          setConversationHistory(prev => {
            if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
              // Update last assistant message with image
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                image: msg.image,
                imagePrompt: msg.prompt
              };
              return updated;
            } else {
              // Create new assistant message with image
              return [...prev, {
                role: "assistant",
                content: `[Image: ${msg.prompt}]`,
                timestamp: new Date(),
                image: msg.image,
                imagePrompt: msg.prompt
              }];
            }
          });
        }
        if (msg.type === "image_error") {
          console.error(`❌ Image generation failed: ${msg.error}`);
          setAssistantText(current => current + `\n[Image generation failed: ${msg.error}]`);
        }
        if (msg.type === "tts_engine_changed") {
          // TTS engine changed, refetch available voices
          console.log(`TTS engine changed to: ${msg.tts_engine}`);
          fetchAvailableVoices();
        }
        if (msg.type === "audio_start") pendingAudioSr.current = msg.sample_rate;
        if (msg.type === "llm_payload") {
          setLastLlmPayload(msg.payload);
          // Store the actual model being used from the payload
          if (msg.payload && msg.payload.model) {
            setLlmModel(msg.payload.model);
          }
        }
        if (msg.type === "interrupted") {
          player.resetQueue();
          setAssistantText((s) => s + "\n[interrupted]\n");
        }
        if (msg.type === "chat_cleared") {
          setConversationHistory([]);
        }
        if (msg.type === "error") {
          console.error(`Backend error: ${msg.message}`);
          setAssistantText((s) => s + `\n[Error: ${msg.message}]\n`);
          setInputError(msg.message || "Request failed. Please try again.");

          // Reset all pending UI states so buttons never remain stuck.
          setIsSendingMessage(false);
          setIsContinuing(false);
          isImpersonatingRef.current = false;
          setIsImpersonating(false);
          currentAssistantTextRef.current = "";
          impersonationTextRef.current = "";
          swipeRegenRef.current = null;
          pendingAutoSendRef.current = null;
          pendingAnimationRef.current = null;
          setStageDirective(null);
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText("");
          setIsSuggesting(false);
        }
      } else {
        // binary audio chunk
        const sr = pendingAudioSr.current ?? 24000;
        await player.playPcm16le(ev.data, sr);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setIsSendingMessage(false);
      setIsContinuing(false);
      isImpersonatingRef.current = false;
      setIsImpersonating(false);
      swipeRegenRef.current = null;
      pendingAutoSendRef.current = null;
      pendingAnimationRef.current = null;
      setStageDirective(null);
      streamingActiveRef.current = false;
      setIsStreaming(false);
      setStreamingText("");
      setIsSuggesting(false);
      setMemoryBusy(false);
      wsRef.current = null;
    };

    wsRef.current = ws;
  };

  const disconnect = async () => {
    if (micStopRef.current) await micStopRef.current();
    micStopRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRecording(false);
  };

  const sendJson = (obj: any) => wsRef.current?.send(JSON.stringify(obj));

  // Replace the backend's working history with the given messages (role/content,
  // plus image when present). Used by edits, swipes, rewinds, and deletions.
  const syncHistoryToBackend = (history: Message[]) => {
    if (!wsRef.current) return;
    // In group scenes, prefix attributed assistant turns with the speaker's name
    // so the model can tell the cast apart (matches how the backend stores them).
    const hasSpeakers = history.some(m => m.role === "assistant" && m.speaker);
    const historyForBackend = history.map(msg => ({
      role: msg.role,
      content: hasSpeakers && msg.role === "assistant" && msg.speaker
        ? `${msg.speaker}: ${msg.content}`
        : msg.content,
      ...(msg.image && { image: msg.image })
    }));
    sendJson({ type: "sync_history", history: historyForBackend });
  };

  // Build the system prompt in SillyTavern's story_string style from explicit
  // values, so it can be composed from current state or from a loaded session.
  // Order: system -> scenario -> description -> personality -> user.
  const composeSystemPrompt = (vals: {
    systemPrompt: string;
    scenario: string;
    characterDef: string;
    personality: string;
    userName: string;
    userPersona?: string;
  }) => {
    let fullPrompt = "";
    if (vals.systemPrompt.trim()) fullPrompt += `${vals.systemPrompt.trim()}\n\n`;
    if (vals.scenario.trim()) fullPrompt += `### Scenario\n${vals.scenario.trim()}\n\n`;
    if (vals.characterDef.trim()) fullPrompt += `### Character Description\n${vals.characterDef.trim()}\n\n`;
    if (vals.personality.trim()) fullPrompt += `### Personality\n${vals.personality.trim()}\n\n`;
    fullPrompt += `### User\nYou are speaking with ${vals.userName}.`;
    if (vals.userPersona && vals.userPersona.trim()) {
      fullPrompt += ` ${vals.userName} is: ${vals.userPersona.trim()}`;
    }
    return fullPrompt;
  };

  const updateSystemPrompt = (overrides: {
    stageEnabled?: boolean;
    includeMood?: boolean;
    autoScene?: boolean;
    includeImageGen?: boolean;
    adultMode?: boolean;
  } = {}) => {
    if (!wsRef.current) return;
    sendJson({
      type: "set_system_prompt",
      content: composeSystemPrompt({ systemPrompt, scenario, characterDef, personality, userName, userPersona }),
      // Names drive {{char}} / {{user}} macro expansion on the backend.
      char: assistantName,
      user: userName,
      include_animation: overrides.stageEnabled ?? stageEnabled,
      include_mood: overrides.includeMood ?? includeMood,
      auto_scene: overrides.autoScene ?? autoScene,
      include_imagegen: overrides.includeImageGen ?? includeImageGen,
      adult_mode: overrides.adultMode ?? adultMode,
    });
  };

  // ----- Character roster / cast -----
  // Per-speaker system prompt for a group scene: the speaker's own (or the
  // global) base instructions + scenario + their sheet + the rest of the cast as
  // "also present", so the model stays in one character but is aware of the room.
  const composeSystemPromptForCharacter = (speaker: Character): string => {
    const base = speaker.systemPrompt && speaker.systemPrompt.trim()
      ? speaker.systemPrompt.trim()
      : systemPrompt.trim();
    let p = "";
    if (base) p += `${base}\n\n`;
    if (scenario.trim()) p += `### Scenario\n${scenario.trim()}\n\n`;
    if (speaker.description.trim()) p += `### Character Description\n${speaker.description.trim()}\n\n`;
    if (speaker.personality.trim()) p += `### Personality\n${speaker.personality.trim()}\n\n`;
    const others = inSceneCharacters.filter((c) => c.id !== speaker.id);
    if (others.length > 0) {
      p += "### Other Characters Present\n";
      p += `The following characters share this scene. You may reference and react to them, but only ever speak and act as ${speaker.name} — never voice their dialogue or decide their actions:\n`;
      for (const o of others) {
        const oneLine = o.description.trim().split("\n")[0].slice(0, 200);
        p += `- ${o.name}${oneLine ? `: ${oneLine}` : ""}\n`;
      }
      p += "\n";
    }
    p += `### User\nYou are speaking with ${userName}.`;
    if (userPersona.trim()) p += ` ${userName} is: ${userPersona.trim()}`;
    return p;
  };

  // Speaker attributed to the next reply — only in group scenes; "" keeps solo
  // history clean and unprefixed.
  const speakerNameForTurn = (speaker: Character | null = selectedCharacter): string =>
    isGroupScene && speaker ? speaker.name : "";

  // Before a group generation, point the backend at the chosen speaker's system
  // prompt and remember them for reply attribution. No-op for solo scenes.
  const prepareTurnForSpeaker = (speaker: Character | null = selectedCharacter) => {
    if (isGroupScene && speaker) {
      pendingSpeakerRef.current = { name: speaker.name, avatar: speaker.avatar };
      sendJson({
        type: "set_system_prompt",
        content: composeSystemPromptForCharacter(speaker),
        char: speaker.name,
        user: userName,
        include_animation: stageEnabled,
        include_mood: includeMood,
        auto_scene: autoScene,
        include_imagegen: includeImageGen,
        adult_mode: adultMode,
      });
    } else {
      pendingSpeakerRef.current = null;
    }
  };

  // Auto-cast dispatch: when the backend answers `choose_speaker`, hand the
  // queued message to the chosen character. Kept in a ref refreshed every
  // render so the ws handler (a stale closure) always sees current state.
  const autoCastDispatchRef = useRef<(name: string) => void>(() => {});
  useEffect(() => {
    autoCastDispatchRef.current = (name: string) => {
      const pending = pendingAutoSendRef.current;
      pendingAutoSendRef.current = null;
      if (!pending || !wsRef.current) return;
      const char =
        characters.find((c) => c.inScene && c.name.toLowerCase() === name.trim().toLowerCase()) ??
        inSceneCharacters[0] ?? null;
      if (char) {
        selectCharacter(char.id); // the cast bar highlights who's answering
        prepareTurnForSpeaker(char);
      }
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: pending.text,
        ...(pending.image ? {
          image: pending.image,
          image_explainer_model: imageExplainerProvider === "ollama" ? `ollama:${imageExplainerModel}` : undefined,
        } : {}),
        ...(pending.asNarrator ? { as_narrator: true } : {}),
        ...(char && inSceneCharacters.length > 1 ? { speaker_name: char.name } : {}),
      }));
    };
  });

  // Queue a message and ask the model who should answer it (group auto-cast).
  const sendViaAutoCast = (text: string, image: string | null, asNarrator: boolean) => {
    pendingAutoSendRef.current = { text, image, asNarrator };
    sendJson({
      type: "choose_speaker",
      candidates: inSceneCharacters.map((c) => c.name).filter(Boolean),
      user_name: userName,
    });
  };

  // Load a roster character into the editable buffer and make it the next speaker.
  const loadCharacterIntoBuffer = (c: Character) => {
    setAssistantName(c.name);
    setCharacterDef(c.description);
    setPersonality(c.personality);
    setCharacterSystemPrompt(c.systemPrompt);
    setFirstMessage(c.firstMessage);
    setAssistantCharacterImage(c.avatar);
    setCharacterRigId(c.rigId ?? null);
  };

  const selectCharacter = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setSelectedCharacterId(id);
    loadCharacterIntoBuffer(c);
    saveSettings({ selectedCharacterId: id });
  };

  const addCharacter = () => {
    const c: Character = {
      id: makeId(),
      name: `Character ${characters.length + 1}`,
      description: "",
      personality: "",
      systemPrompt: "",
      firstMessage: "",
      avatar: null,
      rigId: null,
      inScene: true,
    };
    setCharacters((prev) => [...prev, c]);
    setSelectedCharacterId(c.id);
    loadCharacterIntoBuffer(c);
  };

  const duplicateCharacter = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    const copy: Character = { ...c, id: makeId(), name: `${c.name} copy` };
    setCharacters((prev) => [...prev, copy]);
    setSelectedCharacterId(copy.id);
    loadCharacterIntoBuffer(copy);
  };

  const deleteCharacter = (id: string) => {
    if (characters.length <= 1) return; // always keep at least one character
    const remaining = characters.filter((c) => c.id !== id);
    setCharacters(remaining);
    if (id === selectedCharacterId) {
      const next = remaining[0];
      setSelectedCharacterId(next.id);
      loadCharacterIntoBuffer(next);
      saveSettings({ selectedCharacterId: next.id });
    }
  };

  const toggleCharacterInScene = (id: string) => {
    setCharacters((prev) => {
      const target = prev.find((c) => c.id === id);
      // Never let the last cast member leave the scene.
      if (target && target.inScene && prev.filter((c) => c.inScene).length <= 1) return prev;
      return prev.map((c) => (c.id === id ? { ...c, inScene: !c.inScene } : c));
    });
  };

  // Drop a character's opening line into the chat as their first message.
  const greetWithCharacter = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c || !c.firstMessage.trim()) return;
    const greeting: Message = {
      role: "assistant",
      content: c.firstMessage.trim(),
      timestamp: new Date(),
      ...(inSceneCharacters.length > 1 ? { speaker: c.name } : {}),
      ...(c.avatar ? { characterImage: c.avatar } : {}),
    };
    const next = [...conversationHistory, greeting];
    setConversationHistory(next);
    syncHistoryToBackend(next);
  };

  // Keep the selected character's roster entry in sync with the editable buffer.
  useEffect(() => {
    setCharacters((prev) => prev.map((c) => (
      c.id === selectedCharacterId
        ? {
            ...c,
            name: assistantName,
            description: characterDef,
            personality,
            systemPrompt: characterSystemPrompt,
            firstMessage,
            avatar: assistantCharacterImage,
            rigId: characterRigId,
          }
        : c
    )));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantName, characterDef, personality, characterSystemPrompt, firstMessage, assistantCharacterImage, characterRigId, selectedCharacterId]);

  const handleCharacterUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const data = json.spec === "chara_card_v2" ? json.data : json;

        // Populate fields from character card
        if (data.name) setAssistantName(data.name);
        if (data.description) setCharacterDef(data.description.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.personality) setPersonality(data.personality.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.scenario) setScenario(data.scenario.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.first_mes) setFirstMessage(data.first_mes.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        // A card's own system prompt becomes this character's per-character override.
        if (data.system_prompt) setCharacterSystemPrompt(data.system_prompt);

        alert(`Character "${data.name}" loaded successfully!`);
      } catch (error) {
        alert("Failed to parse character file. Please check the format.");
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  // Import a character card as a *new* roster character (rather than overwriting
  // the current one). addCharacter selects a fresh blank entry synchronously; the
  // card's fields then land on it when the async file read resolves.
  const importCharacterCard = (event: React.ChangeEvent<HTMLInputElement>) => {
    addCharacter();
    handleCharacterUpload(event);
  };

  // Uploaded rigs embed a full data-URL image and the whole library is persisted
  // to localStorage, so keep every rig the cast still points at but only a handful
  // of recent unused ones — otherwise repeated "Generate" clicks blow the quota.
  const MAX_SPARE_RIGS = 8;

  const assignRig = (rig: RiggedCharacter) => {
    setRigAssets((prev) => {
      const inUse = new Set(
        [characterRigId, ...characters.map((c) => c.rigId)].filter((id): id is string => !!id)
      );
      const referenced = prev.filter((r) => inUse.has(r.id));
      const spare = prev.filter((r) => !inUse.has(r.id)).slice(-MAX_SPARE_RIGS);
      return [...referenced, ...spare, rig];
    });
    setCharacterRigId(rig.id);
  };

  const generateRandomRig = () => {
    assignRig(createGeneratedRig(assistantName || selectedCharacter?.name || "Character"));
  };

  const generateRigFromAvatar = () => {
    if (!assistantCharacterImage) {
      alert("Upload an avatar first, then I can wrap it into a rig.");
      return;
    }
    assignRig(createUploadedRig(assistantName || selectedCharacter?.name || "Character", assistantCharacterImage));
  };

  const uploadRigImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = reader.result as string;
      assignRig(createUploadedRig(assistantName || selectedCharacter?.name || "Character", image));
      if (!assistantCharacterImage) setAssistantCharacterImage(image);
      event.target.value = "";
    };
    reader.onerror = () => {
      alert("Failed to read the image file.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const sendTextMessage = () => {
    if (!wsRef.current || (!textInput.trim() && !attachedImage)) return;
    setInputError(null);
    setSuggestions([]);
    setIsSendingMessage(true);
    setIsContinuing(false);

    // Display the text immediately in the user box
    setTranscript(textInput || "[Image attached]");

    // Add to history immediately for text mode with optional image
    setConversationHistory(prev => [...prev, {
      role: "user",
      content: textInput || "[Image attached]",
      timestamp: new Date(),
      ...(attachedImage && { image: attachedImage })
    }]);

    if (isGroupScene && autoCast) {
      // Auto-cast: ask the model who answers; the message goes out when
      // `speaker_chosen` comes back.
      sendViaAutoCast(textInput, attachedImage, false);
    } else {
      // In a group scene, point the backend at the chosen speaker before sending.
      prepareTurnForSpeaker();

      // Send to backend for LLM processing with optional image
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: textInput,
        image: attachedImage,  // Send base64 image if attached
        image_explainer_model: imageExplainerProvider === "ollama" ? `ollama:${imageExplainerModel}` : undefined,
        ...(speakerNameForTurn() ? { speaker_name: speakerNameForTurn() } : {})
      }));
    }

    setTextInput("");
    setAttachedImage(null);  // Clear attached image after sending
  };

  // Send the composer text as narration — an out-of-character, omniscient scene
  // beat the character reacts to (rendered as a centered scene line, not dialogue).
  const sendNarration = () => {
    const text = textInput.trim();
    if (!wsRef.current || !text) return;
    setInputError(null);
    setSuggestions([]);
    setIsSendingMessage(true);
    setIsContinuing(false);

    setTranscript(`🎬 ${text}`);
    setConversationHistory(prev => [...prev, {
      role: "user",
      content: text,
      timestamp: new Date(),
      narrator: true,
    }]);

    if (isGroupScene && autoCast) {
      sendViaAutoCast(text, null, true);
    } else {
      prepareTurnForSpeaker();
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text,
        as_narrator: true,
        ...(speakerNameForTurn() ? { speaker_name: speakerNameForTurn() } : {}),
      }));
    }

    setTextInput("");
  };

  const clearChat = () => {
    sendJson({ type: "clear_chat" });
    setTranscript("");
    setAssistantText("");
    setConversationHistory([]);
    setLastLlmPayload(null);
    setLastLlmResponse(null);
    setAssistantMood("");
    setStageDirective(null);
    setSuggestions([]);
    // The backend forgets the story with the chat; mirror that locally so the
    // record can't outlive the conversation it describes.
    setMemory((prev) => ({ ...prev, summary: "", covered: 0, total: 0, pending: 0 }));
    setMemoryBusy(false);
    pendingMoodRef.current = "";
    pendingAnimationRef.current = null;
  };

  // Nuke everything — leave no trace. Wipes local persistence (history, settings,
  // characters, lorebook, scene…) and asks the backend to reset its state and
  // erase on-disk data (saved/generated images, uploaded characters, and logs),
  // then hard-reloads into a pristine app.
  const wipeEverything = async () => {
    const ok = window.confirm(
      "⚠️ WIPE EVERYTHING?\n\n" +
      "This permanently erases all of it — there is NO undo:\n" +
      "• This conversation & history\n" +
      "• Every character in the cast + your persona\n" +
      "• Lorebook, Author's Note, scene & all settings\n" +
      "• Saved images, uploaded characters, and logs on disk\n\n" +
      "Continue?"
    );
    if (!ok) return;

    // Reset the live connection's server state (if connected).
    try { sendJson({ type: "wipe_all" }); } catch (e) { console.error(e); }

    // Erase on-disk data over HTTP — reliable even if the socket is closed.
    try {
      await fetch("http://127.0.0.1:8000/api/wipe", {
        method: "POST",
        headers: { "X-Wipe-Confirm": "yes" },
      });
    } catch (e) {
      console.error("Failed to wipe on-disk data:", e);
    }

    // Clear every local trace for this app.
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
      Object.keys(localStorage)
        .filter((k) => k.startsWith("aiassistant"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error("Failed to clear local storage:", e);
    }

    // Hard-reload into a pristine state (every store re-initializes to defaults).
    window.location.reload();
  };

  const toggleContext = (enabled: boolean) => {
    setUseContext(enabled);
    sendJson({ type: "set_context_mode", enabled });
  };

  const toggleImageGen = (enabled: boolean) => {
    setIncludeImageGen(enabled);
    sendJson({ type: "set_imagegen_mode", enabled });
    updateSystemPrompt({ includeImageGen: enabled });
  };

  // ----- Roleplay enrichment handlers -----
  const updateLorebook = (entries: LorebookEntry[]) => {
    setLorebook(entries);
    saveSettings({ lorebook: entries });
    sendJson({ type: "set_lorebook", entries: serializeLorebook(entries) });
  };

  const updateAuthorNote = (note: string) => {
    setAuthorNote(note);
    sendJson({ type: "set_author_note", note, depth: authorNoteDepth });
  };

  const updateAuthorNoteDepth = (depth: number) => {
    setAuthorNoteDepth(depth);
    sendJson({ type: "set_author_note", note: authorNote, depth });
  };

  // ----- Story memory -----
  // Settings apply optimistically so the sliders stay responsive; the backend
  // answers every change with its full view, which then becomes the truth.
  const pushMemorySettings = (patch: Partial<MemoryState>) => {
    const next = { ...memory, ...patch };
    setMemory(next);
    sendJson({
      type: "set_memory",
      enabled: next.enabled,
      auto: next.auto,
      keep_recent: next.keepRecent,
      trigger: next.trigger,
    });
  };

  // Hand-edits to the record stay local while the user types — the backend
  // echoes back whatever it stores, and echoing mid-keystroke would fight the
  // caret — then commit once on blur.
  const editMemorySummary = (summary: string) => setMemory((prev) => ({ ...prev, summary }));
  const commitMemorySummary = () => sendJson({ type: "set_memory", summary: memory.summary });

  const summarizeMemoryNow = () => {
    if (!wsRef.current || memoryBusy) return;
    setMemoryBusy(true);
    sendJson({ type: "summarize_memory" });
  };

  const forgetMemory = () => {
    setMemory((prev) => ({ ...prev, summary: "", covered: 0, pending: prev.total }));
    sendJson({ type: "forget_memory" });
  };

  const toggleMood = (enabled: boolean) => {
    setIncludeMood(enabled);
    if (!enabled) setAssistantMood("");
    sendJson({ type: "set_mood_mode", enabled });
    // Rebuild the system prompt so the mood instruction is added/removed right away.
    // set_mood_mode is sent first, so the backend sees the new flag when it rebuilds.
    updateSystemPrompt({ includeMood: enabled });
  };

  // Adult mode lives entirely in the backend-owned prompt contract, so flipping
  // it just rebuilds the system prompt for the current scene.
  const toggleAdultMode = (enabled: boolean) => {
    setAdultMode(enabled);
    saveSettings({ adultMode: enabled });
    updateSystemPrompt({ adultMode: enabled });
  };

  const toggleStage = (enabled: boolean) => {
    setStageEnabled(enabled);
    saveSettings({ stageEnabled: enabled });
    if (!enabled) {
      setStageDirective(null);
      pendingAnimationRef.current = null;
    }
    sendJson({ type: "set_animation_mode", enabled });
    updateSystemPrompt({ stageEnabled: enabled });
  };

  // ----- Director controls -----
  // Persistent style dials. Each sends the full trio so the backend always has a
  // consistent view, and we save settings using the just-changed value.
  const pushStyle = (next: { responseLength?: ResponseLength; narrationPerspective?: NarrationPerspective; pacing?: Pacing }) => {
    const payload = {
      response_length: next.responseLength ?? responseLength,
      narration_perspective: next.narrationPerspective ?? narrationPerspective,
      pacing: next.pacing ?? pacing,
    };
    sendJson({ type: "set_style", ...payload });
    saveSettings({
      responseLength: payload.response_length,
      narrationPerspective: payload.narration_perspective,
      pacing: payload.pacing,
    });
  };

  const updateResponseLength = (v: ResponseLength) => {
    setResponseLength(v);
    pushStyle({ responseLength: v });
  };
  const updateNarrationPerspective = (v: NarrationPerspective) => {
    setNarrationPerspective(v);
    pushStyle({ narrationPerspective: v });
  };
  const updatePacing = (v: Pacing) => {
    setPacing(v);
    pushStyle({ pacing: v });
  };

  // One-shot scene cue, applied to (and cleared after) the next reply only.
  const queueDirectorBeat = (cue: string) => {
    const beat = cue.trim();
    if (!wsRef.current || !beat) return;
    setPendingBeat(beat);
    sendJson({ type: "set_director_beat", beat });
  };
  const clearDirectorBeat = () => {
    setPendingBeat("");
    sendJson({ type: "set_director_beat", beat: "" });
  };

  // ----- Scene atmosphere -----
  // Push the scene to the backend (grounds every reply) and persist it locally.
  const updateScene = (next: SceneState) => {
    setScene(next);
    saveSettings({ scene: next });
    sendJson({
      type: "set_scene",
      time: next.time,
      weather: next.weather,
      location: next.location,
    });
  };

  // Toggle whether the character may advance the scene itself. The instruction
  // lives in the system prompt, so rebuild it after flipping the backend flag.
  const toggleAutoScene = (enabled: boolean) => {
    setAutoScene(enabled);
    saveSettings({ autoScene: enabled });
    sendJson({ type: "set_autoscene_mode", enabled });
    updateSystemPrompt({ autoScene: enabled });
  };

  // ----- Immersive / cinematic reading mode -----
  // Toggling on hides the side chrome (remembering the layout to restore later)
  // so the prose fills the view; the reactive ambient background does the rest.
  const toggleImmersive = () => {
    const next = !immersive;
    if (next) {
      prevPanelsRef.current = { left: showLeftPanel, right: showRealtimePanel };
      setShowLeftPanel(false);
      setShowRealtimePanel(false);
    } else if (prevPanelsRef.current) {
      setShowLeftPanel(prevPanelsRef.current.left);
      setShowRealtimePanel(prevPanelsRef.current.right);
      prevPanelsRef.current = null;
    }
    setImmersive(next);
    saveSettings({ immersive: next });
  };

  // ----- Response swipes (alternative generations) -----
  const applySwipeIndex = (index: number, newIndex: number) => {
    const m = conversationHistory[index];
    if (!m) return;
    const swipes = m.swipes ?? [m.content];
    if (newIndex < 0 || newIndex >= swipes.length) return;
    const updated = conversationHistory.map((msg, i) =>
      i === index ? { ...msg, content: swipes[newIndex], swipes, swipeIndex: newIndex } : msg
    );
    setConversationHistory(updated);
    syncHistoryToBackend(updated);
  };

  const generateSwipe = (index: number) => {
    if (!wsRef.current || isSendingMessage || isContinuing || isImpersonating) return;
    const msg = conversationHistory[index];
    if (!msg || msg.role !== "assistant") return;
    // Everything up to (but excluding) this assistant message.
    const baseHistory = conversationHistory.slice(0, index);
    const lastUser = [...baseHistory].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    // Point the backend at the truncated history, then regenerate from the last user turn.
    syncHistoryToBackend(baseHistory);
    // Keep a swipe attributed to whichever cast member originally spoke this line.
    const speakerChar = (msg.speaker && characters.find(c => c.name === msg.speaker)) || selectedCharacter;
    prepareTurnForSpeaker(speakerChar);
    swipeRegenRef.current = index;
    setInputError(null);
    setIsSendingMessage(true);
    setAssistantText("");
    currentAssistantTextRef.current = "";
    wsRef.current.send(JSON.stringify({
      type: "text_message",
      text: lastUser.content,
      ...(speakerNameForTurn(speakerChar) ? { speaker_name: speakerNameForTurn(speakerChar) } : {})
    }));
  };

  const handleSwipe = (index: number, direction: "left" | "right") => {
    const msg = conversationHistory[index];
    if (!msg || msg.role !== "assistant") return;
    const swipes = msg.swipes ?? [msg.content];
    const swipeIndex = msg.swipeIndex ?? swipes.length - 1;
    if (direction === "left") {
      if (swipeIndex > 0) applySwipeIndex(index, swipeIndex - 1);
    } else if (swipeIndex < swipes.length - 1) {
      applySwipeIndex(index, swipeIndex + 1);
    } else {
      generateSwipe(index);
    }
  };

  // ----- Session save / load (full snapshot, to file or the story library) -----
  const buildSessionSnapshot = () => ({
    type: "aiassistant_session",
    version: 1,
    savedAt: new Date().toISOString(),
    conversationHistory,
    settings: {
      userName, userPersona, assistantName, systemPrompt, scenario, characterDef, personality,
      authorNote, authorNoteDepth, includeMood, adultMode, lorebook, memory,
      responseLength, narrationPerspective, pacing, scene, autoScene,
      rigAssets, characters, selectedCharacterId,
      llmHost, llmModel, currentVoice, ttsEngine, outputMode,
      useContext, includeImageGen, stageEnabled,
      userCharacterImage, assistantCharacterImage,
    },
  });

  const handleSaveSession = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadJson(`session-${(assistantName || "chat").replace(/\s+/g, "_")}-${stamp}.json`, buildSessionSnapshot());
  };

  // Export the conversation as a readable Markdown story.
  const handleExportStory = () => {
    if (conversationHistory.length === 0) {
      alert("Nothing to export yet — the story hasn't started.");
      return;
    }
    const title = assistantName ? `${assistantName} — a story with ${userName || "you"}` : "A story";
    const lines: string[] = [`# ${title}`, ""];
    const sceneBits = [scene.time, scene.weather, scene.location].filter(Boolean).join(", ");
    if (scenario.trim()) lines.push(`> ${scenario.trim().replace(/\n+/g, " ")}`, "");
    if (sceneBits) lines.push(`*Scene: ${sceneBits}*`, "");
    lines.push(`*Exported ${new Date().toLocaleString()} · ${conversationHistory.length} messages*`, "", "---", "");
    for (const m of conversationHistory) {
      if (m.narrator) {
        lines.push(`*${m.content.trim()}*`, "");
        continue;
      }
      const who = m.role === "user" ? (userName || "You") : (m.speaker || assistantName || "Assistant");
      lines.push(`**${who}:** ${m.content.trim()}`);
      if (m.role === "assistant" && m.imagePrompt) lines.push("", `*(image: ${m.imagePrompt})*`);
      lines.push("");
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`story-${(assistantName || "chat").replace(/\s+/g, "_")}-${stamp}.md`, lines.join("\n"));
  };

  const applySession = (session: any) => {
    const history: Message[] = Array.isArray(session?.conversationHistory)
      ? session.conversationHistory.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp ?? Date.now()) }))
      : [];
    const s = session?.settings ?? {};
    const loadedSystemPrompt = upgradeRoleplayPrompt(s.systemPrompt);

    // Restore UI state
    if (typeof s.userName === "string") setUserName(s.userName);
    if (typeof s.userPersona === "string") setUserPersona(s.userPersona);
    if (typeof s.assistantName === "string") setAssistantName(s.assistantName);
    setSystemPrompt(loadedSystemPrompt);
    if (typeof s.scenario === "string") setScenario(s.scenario);
    if (typeof s.characterDef === "string") setCharacterDef(s.characterDef);
    if (typeof s.personality === "string") setPersonality(s.personality);
    if (typeof s.authorNote === "string") setAuthorNote(s.authorNote);
    if (typeof s.authorNoteDepth === "number") setAuthorNoteDepth(s.authorNoteDepth);
    if (typeof s.includeMood === "boolean") setIncludeMood(s.includeMood);
    if (typeof s.adultMode === "boolean") setAdultMode(s.adultMode);
    if (typeof s.stageEnabled === "boolean") setStageEnabled(s.stageEnabled);
    if (Array.isArray(s.lorebook)) setLorebook(s.lorebook);
    // A parked story carries its long-term memory with it, so reopening it
    // resumes with everything the character had already learned.
    const loadedMemory: MemoryState = { ...DEFAULT_MEMORY, ...(s.memory || {}) };
    setMemory(loadedMemory);
    setMemoryBusy(false);
    if (s.responseLength) setResponseLength(s.responseLength as ResponseLength);
    if (s.narrationPerspective) setNarrationPerspective(s.narrationPerspective as NarrationPerspective);
    if (s.pacing) setPacing(s.pacing as Pacing);
    if (s.scene && typeof s.scene === "object") {
      setScene({
        time: s.scene.time || "",
        weather: s.scene.weather || "",
        location: s.scene.location || "",
      });
    }
    if (typeof s.autoScene === "boolean") setAutoScene(s.autoScene);
    if (Array.isArray(s.rigAssets)) setRigAssets(s.rigAssets as RiggedCharacter[]);
    // Restore the character roster (falls back to the legacy single character).
    if (Array.isArray(s.characters) && s.characters.length > 0) {
      const roster = s.characters as Character[];
      setCharacters(roster);
      const sel = (s.selectedCharacterId && roster.some((c) => c.id === s.selectedCharacterId))
        ? s.selectedCharacterId
        : roster[0].id;
      setSelectedCharacterId(sel);
      const active = roster.find((c) => c.id === sel) ?? roster[0];
      // Mirror the active character into the editing buffer (overrides the
      // legacy field assignments above).
      loadCharacterIntoBuffer(active);
    }
    if (typeof s.llmHost === "string") setLlmHost(s.llmHost);
    if (typeof s.llmModel === "string") setLlmModel(s.llmModel);
    if (typeof s.currentVoice === "string") setCurrentVoice(s.currentVoice);
    if (s.ttsEngine) setTtsEngine(s.ttsEngine as TtsEngine);
    if (s.outputMode === "voice" || s.outputMode === "text") setOutputMode(s.outputMode);
    if (typeof s.useContext === "boolean") setUseContext(s.useContext);
    if (typeof s.includeImageGen === "boolean") setIncludeImageGen(s.includeImageGen);
    if (typeof s.userCharacterImage === "string") setUserCharacterImage(s.userCharacterImage);
    if (typeof s.assistantCharacterImage === "string") setAssistantCharacterImage(s.assistantCharacterImage);
    setConversationHistory(history);
    setAssistantMood("");
    setStageDirective(null);
    pendingAnimationRef.current = null;

    // Push everything to the backend now, using parsed values (state is async).
    if (wsRef.current) {
      sendJson({ type: "set_mood_mode", enabled: !!s.includeMood });
      sendJson({ type: "set_animation_mode", enabled: s.stageEnabled === true });
      sendJson({ type: "set_autoscene_mode", enabled: s.autoScene !== false });
      sendJson({
        type: "set_system_prompt",
        content: composeSystemPrompt({
          systemPrompt: loadedSystemPrompt,
          scenario: s.scenario ?? "",
          characterDef: s.characterDef ?? "",
          personality: s.personality ?? "",
          userName: s.userName ?? "",
          userPersona: s.userPersona ?? "",
        }),
        char: s.assistantName ?? assistantName,
        user: s.userName ?? userName,
        include_animation: s.stageEnabled === true,
        include_mood: !!s.includeMood,
        auto_scene: s.autoScene !== false,
        include_imagegen: !!s.includeImageGen,
        adult_mode: s.adultMode === true,
      });
      sendJson({ type: "set_context_mode", enabled: s.useContext !== false });
      sendJson({ type: "set_imagegen_mode", enabled: !!s.includeImageGen });
      sendJson({ type: "set_lorebook", entries: serializeLorebook(Array.isArray(s.lorebook) ? s.lorebook : []) });
      sendJson({
        type: "set_author_note",
        note: s.authorNote ?? "",
        depth: typeof s.authorNoteDepth === "number" ? s.authorNoteDepth : 3,
      });
      sendJson({
        type: "set_style",
        response_length: s.responseLength ?? "normal",
        narration_perspective: s.narrationPerspective ?? "default",
        pacing: s.pacing ?? "steady",
      });
      sendJson({
        type: "set_scene",
        time: s.scene?.time ?? "",
        weather: s.scene?.weather ?? "",
        location: s.scene?.location ?? "",
      });
      setPendingBeat("");
      if (s.llmModel) sendJson({ type: "set_llm_model", model: s.llmModel });
      if (s.llmHost) sendJson({ type: "set_llm_host", host: s.llmHost });
      if (s.outputMode) sendJson({ type: "set_output_mode", mode: s.outputMode });
      syncHistoryToBackend(history);
      // After the history, never before: the memory cursor is an index into the
      // story being restored, and the backend clamps it against whatever history
      // it currently holds.
      sendJson({
        type: "set_memory",
        enabled: loadedMemory.enabled,
        auto: loadedMemory.auto,
        keep_recent: loadedMemory.keepRecent,
        trigger: loadedMemory.trigger,
        summary: loadedMemory.summary,
        covered: loadedMemory.covered,
      });
    }
  };

  const handleLoadSession = async (file: File) => {
    try {
      const data = await readJsonFile(file);
      if (data && data.type && data.type !== "aiassistant_session") {
        if (!window.confirm("This file doesn't look like a saved session. Load it anyway?")) return;
      }
      if (conversationHistory.length > 0 &&
          !window.confirm("Loading a session will replace your current chat and settings. Continue?")) {
        return;
      }
      applySession(data);
    } catch (err) {
      console.error("Failed to load session:", err);
      alert("Could not read that session file. Make sure it is valid JSON.");
    }
  };

  const updateLlmModel = (model: string) => {
    setLlmModel(model);
    sendJson({ type: "set_llm_model", model });
  };

  const updateLlmHost = (hostUrl: string) => {
    setLlmHost(hostUrl);
    sendJson({ type: "set_llm_host", host: hostUrl });
  };

  const changeVoice = (voice: string) => {
    setCurrentVoice(voice);
    sendJson({ type: "set_voice", voice });
  };

  const toggleOutputMode = (mode: "voice" | "text") => {
    setOutputMode(mode);
    sendJson({ type: "set_output_mode", mode });
  };



  const handleDeleteMessage = (index: number) => {
    const newHistory = conversationHistory.filter((_, i) => i !== index);
    setConversationHistory(newHistory);

    // Sync to backend
    if (wsRef.current) {
      const historyForBackend = newHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      sendJson({ type: "sync_history", history: historyForBackend });
    }
  };

  const handleEditMessage = (index: number) => {
    setEditingMessage({ index, text: conversationHistory[index].content });
  };

  const handleSaveEdit = (index: number) => {
    if (editingMessage) {
      const newHistory = conversationHistory.map((msg, i) => {
        if (i !== index) return msg;
        const updated: Message = { ...msg, content: editingMessage.text };
        // Keep the active swipe variant in sync with the edited text.
        if (msg.swipes && typeof msg.swipeIndex === "number") {
          const swipes = [...msg.swipes];
          swipes[msg.swipeIndex] = editingMessage.text;
          updated.swipes = swipes;
        }
        return updated;
      });
      setConversationHistory(newHistory);
      setEditingMessage(null);
      syncHistoryToBackend(newHistory);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
  };

  const handleRewindToMessage = (index: number) => {
    // Remove all messages after this index
    const newHistory = conversationHistory.slice(0, index + 1);
    setConversationHistory(newHistory);

    // Sync to backend
    if (wsRef.current) {
      const historyForBackend = newHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      sendJson({ type: "sync_history", history: historyForBackend });
    }
  };

  const handleResendMessage = () => {
    // Get the last message (which should be a user message)
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    // Simply resend the message - backend will handle duplicate prevention
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: lastMessage.content
      }));
    }
  };

  const handleRegenerateResponse = (index?: number) => {
    // Regenerate keeps the previous reply as a swipe instead of discarding it.
    const targetIndex = typeof index === "number"
      ? index
      : conversationHistory.findLastIndex(msg => msg.role === "assistant");
    if (targetIndex < 0) return;
    generateSwipe(targetIndex);
  };

  const handleImpersonate = () => {
    if (!wsRef.current) return;
    setInputError(null);
    wsRef.current.send(
      JSON.stringify({
        type: "impersonate_user",
        user_name: userName,
        user_hint: textInput.trim(),
      })
    );
  };

  const handleSuggest = () => {
    if (!wsRef.current || isSuggesting || conversationHistory.length === 0) return;
    setInputError(null);
    setSuggestions([]);
    setIsSuggesting(true);
    sendJson({ type: "suggest_replies", user_name: userName });
  };

  const pickSuggestion = (text: string) => {
    setTextInput(text);
    setSuggestions([]);
  };

  const toggleFormatting = (enabled: boolean) => {
    setImmersiveFormatting(enabled);
  };

  const handleContinue = () => {
    // Send a continue prompt to the LLM
    if (wsRef.current) {
      setInputError(null);
      setIsContinuing(true);
      setIsSendingMessage(false);
      if (isGroupScene && autoCast) {
        // Let the model decide who carries the scene forward.
        sendViaAutoCast("[Continue]", null, false);
      } else {
        prepareTurnForSpeaker();
        wsRef.current.send(JSON.stringify({
          type: "text_message",
          text: "[Continue]",
          ...(speakerNameForTurn() ? { speaker_name: speakerNameForTurn() } : {})
        }));
      }
    }
  };

  const handlePlayAssistantMessage = async (text: string, index: number) => {
    // If this message is currently playing, stop it
    if (playingMessageIndex === index) {
      player.resetQueue();
      setPlayingMessageIndex(null);
      return;
    }

    try {
      setPlayingMessageIndex(index);
      // Remove emotion tags if present
      const cleanText = text.replace(/\[emotion:\w+\]/g, '');
      // Call backend TTS API to synthesize
      const response = await fetch("http://127.0.0.1:8000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voice: currentVoice
        })
      });
      if (response.ok) {
        const sampleRate = parseInt(response.headers.get("X-Sample-Rate") || "24000");
        const audioData = await response.arrayBuffer();
        // Play the audio with correct sample rate
        await player.playPcm16le(audioData, sampleRate);
      } else {
        console.error("TTS request failed:", response.status);
      }
    } catch (error) {
      console.error("Failed to play message:", error);
    } finally {
      setPlayingMessageIndex(null);
    }
  };

  const fetchAvailableVoices = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/voices");
      const data = await response.json();
      setAvailableVoices(data.voices);
      setCurrentVoice(data.current);
    } catch (error) {
      console.error("Failed to fetch voices:", error);
    }
  };

  const fetchLlmModels = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/llm-models?host=${encodeURIComponent(llmHost)}`);
      const data = await response.json();
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models);
      }
    } catch (error) {
      console.error("Failed to fetch llm models:", error);
    }
  };

  const startRecording = async () => {
    if (!wsRef.current) return;
    sendJson({ type: "interrupt" }); // barge-in: stop the assistant
    player.resetQueue();

    sendJson({ type: "user_audio_start" });
    setRecording(true); // Set recording to true BEFORE starting mic

    const mic = await startMic({
      onPcmChunk: (buf) => {
        // stream binary PCM16 chunks while holding
        if (wsRef.current) {
          wsRef.current.send(buf);
        }
      }
    });
    micStopRef.current = mic.stop;
  };

  const stopRecording = async () => {
    sendJson({ type: "user_audio_end" });
    setRecording(false);
    if (micStopRef.current) await micStopRef.current();
    micStopRef.current = null;
  };

  // Call mode handlers
  const startCall = async () => {
    if (!wsRef.current || inCall) return;

    try {
      // Store current image gen state and disable it for call mode
      prevImageGenStateRef.current = includeImageGen;
      if (includeImageGen) {
        setIncludeImageGen(false);
        sendJson({ type: "set_imagegen_mode", enabled: false });
      }

      setInCall(true);
      setInputMode("call");
      console.log("🔵 Starting call mode with VAD...");

      // Initialize VAD
      const vad = await MicVAD.new({
        onSpeechStart: () => {
          console.log("🎤 Speech started");
          setIsUserSpeaking(true);
          callAudioBufferRef.current = [];
          isSendingAudioRef.current = false;
        },
        onSpeechEnd: async (audio: Float32Array) => {
          console.log("🎤 Speech ended, processing audio...");
          setIsUserSpeaking(false);

          if (isSendingAudioRef.current) return;
          isSendingAudioRef.current = true;

          try {
            // Convert Float32Array to Int16Array (PCM16)
            const pcm16 = new Int16Array(audio.length);
            for (let i = 0; i < audio.length; i++) {
              const s = Math.max(-1, Math.min(1, audio[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send audio to backend for transcription
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log("📤 Sending audio chunk for transcription...");
              sendJson({ type: "user_audio_start" });
              wsRef.current.send(pcm16.buffer);
              sendJson({ type: "user_audio_end" });
            }
          } catch (error) {
            console.error("❌ Error sending audio:", error);
          } finally {
            isSendingAudioRef.current = false;
          }
        },
        onVADMisfire: () => {
          console.log("⚠️ VAD misfire detected");
          setIsUserSpeaking(false);
          isSendingAudioRef.current = false;
        },
        redemptionFrames: 10,
        minSpeechFrames: 5,
        preSpeechPadFrames: 10,
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
      });

      vadRef.current = vad;
      vad.start();
      console.log("✅ Call mode active, VAD listening...");
    } catch (error) {
      console.error("❌ Failed to start call:", error);
      setInCall(false);
      setInputMode("voice");
    }
  };

  const endCall = async () => {
    if (!inCall) return;

    console.log("🔴 Ending call mode...");

    // Stop VAD
    if (vadRef.current) {
      try {
        vadRef.current.pause();
      } catch (error) {
        console.error("Error pausing VAD:", error);
      }
      vadRef.current = null;
    }

    setInCall(false);
    setIsUserSpeaking(false);
    setInputMode("voice");
    callAudioBufferRef.current = [];
    isSendingAudioRef.current = false;

    // Restore previous image gen state
    if (prevImageGenStateRef.current && !includeImageGen) {
      setIncludeImageGen(true);
      sendJson({ type: "set_imagegen_mode", enabled: true });
    }

    console.log("✅ Call ended");
  };

  // Cleanup VAD on unmount or disconnect
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        try {
          vadRef.current.pause();
        } catch (error) {
          console.error("Error cleaning up VAD:", error);
        }
        vadRef.current = null;
      }
    };
  }, []);

  // Persist conversation history to localStorage whenever it changes
  useEffect(() => {
    saveHistoryToStorage(conversationHistory);
  }, [conversationHistory]);

  // Persist key settings to localStorage
  useEffect(() => {
    saveSettings({
      themeName,
      userName,
      userPersona,
      assistantName,
      systemPrompt,
      characterDef,
      scenario,
      personality,
      authorNote,
      authorNoteDepth,
      includeMood,
      adultMode,
      stageEnabled,
      immersiveFormatting,
      lorebook,
      memory,
      responseLength,
      narrationPerspective,
      pacing,
      scene,
      autoScene,
      sceneFx: fxEnabled,
      soundVolume,
      autoCast,
      immersive,
      rigAssets,
      characters,
      selectedCharacterId,
      userCharacterImage,
      assistantCharacterImage,
      llmHost,
      llmModel,
      currentVoice,
      ttsEngine,
      outputMode,
    });
  }, [themeName, userName, userPersona, assistantName, systemPrompt, characterDef, scenario, personality, authorNote, authorNoteDepth, includeMood, adultMode, stageEnabled, immersiveFormatting, lorebook, memory, responseLength, narrationPerspective, pacing, scene, autoScene, fxEnabled, soundVolume, autoCast, immersive, rigAssets, characters, selectedCharacterId, userCharacterImage, assistantCharacterImage, llmHost, llmModel, currentVoice, ttsEngine, outputMode]);

  // End call when disconnected
  useEffect(() => {
    if (!connected && inCall) {
      // Stop VAD
      if (vadRef.current) {
        try {
          vadRef.current.pause();
        } catch (error) {
          console.error("Error pausing VAD:", error);
        }
        vadRef.current = null;
      }
      setInCall(false);
      setIsUserSpeaking(false);
      setInputMode("voice");
      callAudioBufferRef.current = [];
      isSendingAudioRef.current = false;

      // Restore previous image gen state
      if (prevImageGenStateRef.current && !includeImageGen) {
        setIncludeImageGen(true);
      }
    }
  }, [connected, inCall, includeImageGen]);

  useEffect(() => {
    if (connected) {
      // Sync any persisted conversation history to the backend
      if (conversationHistory.length > 0) {
        const historyForBackend = conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.image && { image: msg.image })
        }));
        sendJson({ type: "sync_history", history: historyForBackend });
      }

      // Mood + auto-scene modes first so the backend includes their instructions
      // when it (re)builds the system prompt just below.
      sendJson({ type: "set_mood_mode", enabled: includeMood });
      sendJson({ type: "set_animation_mode", enabled: stageEnabled });
      sendJson({ type: "set_autoscene_mode", enabled: autoScene });
      updateSystemPrompt();
      sendJson({ type: "set_context_mode", enabled: useContext });
      sendJson({ type: "set_imagegen_mode", enabled: includeImageGen });
      sendJson({ type: "set_lorebook", entries: serializeLorebook(lorebook) });
      sendJson({ type: "set_author_note", note: authorNote, depth: authorNoteDepth });
      // Hand the backend the memory this browser was holding — a reconnect must
      // not cost the story everything the character had already learned.
      sendJson({
        type: "set_memory",
        enabled: memory.enabled,
        auto: memory.auto,
        keep_recent: memory.keepRecent,
        trigger: memory.trigger,
        summary: memory.summary,
        covered: memory.covered,
      });
      sendJson({ type: "set_style", response_length: responseLength, narration_perspective: narrationPerspective, pacing });
      sendJson({ type: "set_scene", time: scene.time, weather: scene.weather, location: scene.location });
      if (llmModel) sendJson({ type: "set_llm_model", model: llmModel });
      sendJson({ type: "set_llm_host", host: llmHost });
      sendJson({ type: "set_output_mode", mode: outputMode });
      fetchAvailableVoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    fetchLlmModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmHost]);

  useEffect(() => {
    if (!inputError) return;
    const timer = window.setTimeout(() => setInputError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [inputError]);

  // Reactive reading-area atmosphere: the character's live mood glow over a
  // gentle time-of-day wash. Recomputed only when the scene, mood, or theme move.
  const ambient = useMemo(
    () => buildAmbient({
      time: scene.time,
      moodColor: assistantMood ? moodToColor(assistantMood) : null,
      base: theme.colors.background,
      themeName,
    }),
    [scene.time, assistantMood, theme.colors.background, themeName]
  );

  return (
    <div style={{
      fontFamily: theme.fonts.ui,
      height: "100vh",
      display: "flex",
      overflow: "hidden",
      background: theme.colors.background,
      color: theme.colors.textPrimary,
      transition: "background-color 0.3s ease, color 0.3s ease"
    }}>
      {/* Left Sidebar - Controls */}
      {showLeftPanel && (
        <ControlSidebar
          connected={connected}
          llmHost={llmHost}
          llmModel={llmModel}
          availableModels={availableModels}
          outputMode={outputMode}
          ttsEngine={ttsEngine}
          availableVoices={availableVoices}
          currentVoice={currentVoice}
          useContext={useContext}
          includeImageGen={includeImageGen}
          imageExplainerProvider={imageExplainerProvider}
          imageExplainerModel={imageExplainerModel}
          showJsonPayload={showJsonPayload}
          showModelStatus={showModelStatus}
          theme={theme}
          themeName={themeName}
          onConnect={connect}
          onDisconnect={disconnect}
          onLlmHostChange={updateLlmHost}
          onLlmModelChange={updateLlmModel}
          onRefreshModels={fetchLlmModels}
          onOutputModeChange={toggleOutputMode}
          onImageExplainerProviderChange={setImageExplainerProvider}
          onImageExplainerModelChange={setImageExplainerModel}
          onToggleDebug={() => setShowJsonPayload(!showJsonPayload)}
          onToggleModelStatus={() => setShowModelStatus(!showModelStatus)}
          onThemeChange={(newTheme) => setThemeName(newTheme)}
          onSaveSession={handleSaveSession}
          onLoadSession={handleLoadSession}
          onOpenSessions={() => setShowSessions(true)}
          onExportStory={handleExportStory}
          onWipeEverything={wipeEverything}
        />
      )}

      {/* Middle - Conversation Panel with Text Input */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: theme.colors.surface
      }}>
        {/* Scene atmosphere — persistent sense of place, grounds the story */}
        <SceneBar
          connected={connected}
          scene={scene}
          autoScene={autoScene}
          fxEnabled={fxEnabled}
          soundOn={soundOn}
          soundVolume={soundVolume}
          theme={theme}
          onSceneChange={updateScene}
          onToggleAutoScene={toggleAutoScene}
          onToggleFx={(on) => setFxEnabled(on)}
          onToggleSound={toggleSound}
          onSoundVolume={setSoundVolume}
        />

        {/* Director controls — live steering of length, voice, pacing & scene beats.
            Kept up top, next to the Scene bar, so all scene/story steering lives together. */}
        <DirectorBar
          connected={connected}
          responseLength={responseLength}
          narrationPerspective={narrationPerspective}
          pacing={pacing}
          pendingBeat={pendingBeat}
          theme={theme}
          onLengthChange={updateResponseLength}
          onPerspectiveChange={updateNarrationPerspective}
          onPacingChange={updatePacing}
          onBeat={queueDirectorBeat}
          onClearBeat={clearDirectorBeat}
        />

        <ConversationPanel
          conversationHistory={conversationHistory}
          userName={userName}
          assistantName={assistantName}
          showLeftPanel={showLeftPanel}
          connected={connected}
          ttsEngine={ttsEngine}
          outputMode={outputMode}
          currentVoice={currentVoice}
          availableVoices={availableVoices}
          useContext={useContext}
          includeImageGen={includeImageGen}
          playingMessageIndex={playingMessageIndex}
          editingMessage={editingMessage}
          showRealtimePanel={showRealtimePanel}
          userCharacterImage={userCharacterImage}
          assistantCharacterImage={assistantCharacterImage}
          inSceneCharacters={inSceneCharacters}
          selectedCharacterId={selectedCharacterId}
          rigAssets={rigAssets}
          stageEnabled={stageEnabled}
          stageDirective={stageDirective}
          assistantMood={assistantMood}
          streamingText={streamingText}
          isStreaming={isStreaming}
          formattingEnabled={immersiveFormatting}
          ambient={ambient}
          immersive={immersive}
          scene={scene}
          fxEnabled={fxEnabled}
          memoryCovered={memory.enabled ? memory.covered : 0}
          memoryBusy={memoryBusy}
          theme={theme}
          onToggleImmersive={toggleImmersive}
          onToggleFormatting={toggleFormatting}
          onTtsEngineChange={(engine) => {
            setTtsEngine(engine);
            sendJson({ type: "set_tts_engine", engine });
            setTimeout(() => fetchAvailableVoices(), 500);
          }}
          onVoiceChange={changeVoice}
          onToggleContext={toggleContext}
          onToggleImageGen={toggleImageGen}
          onToggleStage={toggleStage}
          onClearChat={clearChat}
          onStopAudio={() => {
            player.resetQueue();
            sendJson({ type: "stop_audio" });
            setAssistantText((s) => s + "\n[stopped]\n");
          }}
          onShowSettings={() => setShowSettings(true)}
          onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
          onToggleRealtimePanel={() => setShowRealtimePanel(!showRealtimePanel)}
          onEditMessage={handleEditMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDeleteMessage={handleDeleteMessage}
          onRewindToMessage={handleRewindToMessage}
          onResendMessage={handleResendMessage}
          onRegenerateResponse={handleRegenerateResponse}
          onSwipe={handleSwipe}
          onPlayMessage={handlePlayAssistantMessage}
          onEditingTextChange={(text) => setEditingMessage(editingMessage ? { ...editingMessage, text } : null)}
          onShowLorebook={() => setShowLorebook(true)}
          onShowMemory={() => setShowMemory(true)}
        />

        {/* Cast bar — who's in the scene / who speaks next */}
        <CastBar
          inScene={inSceneCharacters}
          selectedId={selectedCharacterId}
          isGroupScene={isGroupScene}
          connected={connected}
          userName={userName}
          userAvatar={userCharacterImage}
          autoCast={autoCast}
          theme={theme}
          onSelectSpeaker={selectCharacter}
          onToggleAutoCast={(on) => setAutoCast(on)}
          onOpenManager={() => setShowCharacterManager(true)}
        />

        {/* Text Input Area */}
        <TextInputArea
          connected={connected}
          textInput={textInput}
          conversationLength={conversationHistory.length}
          attachedImage={attachedImage}
          isImpersonating={isImpersonating}
          isSendingMessage={isSendingMessage}
          isContinuing={isContinuing}
          isSuggesting={isSuggesting}
          suggestions={suggestions}
          inputError={inputError}
          theme={theme}
          onTextChange={setTextInput}
          onImageAttach={setAttachedImage}
          onDismissError={() => setInputError(null)}
          onSend={sendTextMessage}
          onNarrate={sendNarration}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onSuggest={handleSuggest}
          onPickSuggestion={pickSuggestion}
        />
      </div>

      {/* Right Panel - Real-time Status */}
      <RealtimeStatusPanel
        show={showRealtimePanel}
        connected={connected}
        recording={recording}
        inCall={inCall}
        isUserSpeaking={isUserSpeaking}
        userName={userName}
        assistantName={assistantName}
        transcript={transcript}
        assistantText={assistantText}
        showRealtimeUser={showRealtimeUser}
        showRealtimeAssistant={showRealtimeAssistant}
        theme={theme}
        onStartCall={startCall}
        onEndCall={endCall}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onToggleRealtimeUser={() => setShowRealtimeUser(!showRealtimeUser)}
        onToggleRealtimeAssistant={() => setShowRealtimeAssistant(!showRealtimeAssistant)}
      />

      {/* Model Status Panel */}
      <ModelStatusPanel show={showModelStatus} theme={theme} />

      {/* Settings Modal */}
      <SettingsModal
        show={showSettings}
        systemPrompt={systemPrompt}
        scenario={scenario}
        authorNote={authorNote}
        authorNoteDepth={authorNoteDepth}
        includeMood={includeMood}
        adultMode={adultMode}
        connected={connected}
        theme={theme}
        onClose={() => setShowSettings(false)}
        onSystemPromptChange={setSystemPrompt}
        onScenarioChange={setScenario}
        onAuthorNoteChange={updateAuthorNote}
        onAuthorNoteDepthChange={updateAuthorNoteDepth}
        onToggleMood={toggleMood}
        onToggleAdultMode={toggleAdultMode}
        onUpdateSystemPrompt={updateSystemPrompt}
      />

      {/* Lorebook / Memory Modal */}
      <LorebookModal
        show={showLorebook}
        entries={lorebook}
        connected={connected}
        theme={theme}
        onClose={() => setShowLorebook(false)}
        onChange={updateLorebook}
      />

      {/* Story memory — long-term recall once the chat outgrows the context window */}
      <MemoryModal
        show={showMemory}
        memory={memory}
        busy={memoryBusy}
        connected={connected}
        theme={theme}
        onClose={() => setShowMemory(false)}
        onToggleEnabled={(enabled) => pushMemorySettings({ enabled })}
        onToggleAuto={(auto) => pushMemorySettings({ auto })}
        onKeepRecentChange={(keepRecent) => pushMemorySettings({ keepRecent })}
        onTriggerChange={(trigger) => pushMemorySettings({ trigger })}
        onSummaryChange={editMemorySummary}
        onSummaryCommit={commitMemorySummary}
        onSummarizeNow={summarizeMemoryNow}
        onForget={forgetMemory}
      />

      {/* Character roster / cast manager */}
      <CharacterManager
        show={showCharacterManager}
        characters={characters}
        selectedId={selectedCharacterId}
        connected={connected}
        theme={theme}
        name={assistantName}
        description={characterDef}
        personality={personality}
        systemPrompt={characterSystemPrompt}
        firstMessage={firstMessage}
        avatar={assistantCharacterImage}
        rigAssets={rigAssets}
        rigId={characterRigId}
        userName={userName}
        userPersona={userPersona}
        userAvatar={userCharacterImage}
        onClose={() => setShowCharacterManager(false)}
        onSelect={selectCharacter}
        onAdd={addCharacter}
        onDuplicate={duplicateCharacter}
        onDelete={deleteCharacter}
        onToggleInScene={toggleCharacterInScene}
        onGreet={greetWithCharacter}
        onImportCard={importCharacterCard}
        onNameChange={setAssistantName}
        onDescriptionChange={setCharacterDef}
        onPersonalityChange={setPersonality}
        onSystemPromptChange={setCharacterSystemPrompt}
        onFirstMessageChange={setFirstMessage}
        onAvatarChange={setAssistantCharacterImage}
        onRigChange={setCharacterRigId}
        onGenerateRig={generateRandomRig}
        onCreateRigFromAvatar={generateRigFromAvatar}
        onRigImageUpload={uploadRigImage}
        onUserNameChange={setUserName}
        onUserPersonaChange={setUserPersona}
        onUserAvatarChange={(dataUrl) => {
          setUserCharacterImage(dataUrl);
          saveSettings({ userCharacterImage: dataUrl });
        }}
      />

      {/* Debug Info Modal */}
      <DebugModal
        show={showJsonPayload}
        lastLlmPayload={lastLlmPayload}
        lastLlmResponse={lastLlmResponse}
        theme={theme}
        onClose={() => setShowJsonPayload(false)}
      />

      {/* Story library — server-side saved sessions */}
      <SessionsModal
        show={showSessions}
        theme={theme}
        onClose={() => setShowSessions(false)}
        buildSession={buildSessionSnapshot}
        onLoadSession={(session) => {
          if (conversationHistory.length > 0 &&
              !window.confirm("Opening this story will replace your current chat and settings. Continue?")) {
            return;
          }
          applySession(session);
        }}
      />
    </div>
  );
}
