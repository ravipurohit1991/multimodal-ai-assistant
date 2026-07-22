import { useRef, useEffect } from "react";
import { Character, Message, RiggedCharacter, StageAnimationDirective, VoiceInfo, TtsEngine, OutputMode, SceneState } from "../types";
import { MessageItem } from "./MessageItem";
import { StreamingBubble } from "./StreamingBubble";
import { RigStage } from "./RigStage";
import { SceneFX } from "../scenefx";
import { moodToEmoji, moodToColor } from "../mood";
import { Theme } from "../theme";
import {
  IconPanelLeft, IconPanelRight, IconBookOpen, IconSliders, IconEraser,
  IconStop, IconFilm, IconMessage, IconImage, IconItalic, IconFeather,
  IconSparkles, IconBrain,
} from "./Icons";

interface ConversationPanelProps {
  conversationHistory: Message[];
  userName: string;
  assistantName: string;
  showLeftPanel: boolean;
  connected: boolean;
  ttsEngine: TtsEngine;
  outputMode: OutputMode;
  currentVoice: string;
  availableVoices: VoiceInfo[];
  useContext: boolean;
  includeImageGen: boolean;
  playingMessageIndex: number | null;
  editingMessage: { index: number; text: string } | null;
  showRealtimePanel: boolean;
  userCharacterImage: string | null;
  assistantCharacterImage: string | null;
  inSceneCharacters: Character[];
  selectedCharacterId: string;
  rigAssets: RiggedCharacter[];
  stageEnabled: boolean;
  stageDirective: StageAnimationDirective | null;
  assistantMood: string;
  streamingText: string;
  isStreaming: boolean;
  formattingEnabled: boolean;
  /** Reactive scene/mood gradient for the reading area (falls back to theme bg). */
  ambient: string;
  /** Cinematic reading mode — serif prose, wider column, calmer spacing. */
  immersive: boolean;
  /** Current scene — drives the stage particle effects. */
  scene: SceneState;
  fxEnabled: boolean;
  /** Story memory — how many older messages the model's record stands in for. */
  memoryCovered: number;
  memoryBusy: boolean;
  theme: Theme;
  onToggleImmersive: () => void;
  onToggleFormatting: (enabled: boolean) => void;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onVoiceChange: (voice: string) => void;
  onToggleContext: (enabled: boolean) => void;
  onToggleImageGen: (enabled: boolean) => void;
  onToggleStage: (enabled: boolean) => void;
  onClearChat: () => void;
  onStopAudio: () => void;
  onShowSettings: () => void;
  onToggleLeftPanel: () => void;
  onToggleRealtimePanel: () => void;
  onEditMessage: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDeleteMessage: (index: number) => void;
  onRewindToMessage: (index: number) => void;
  onResendMessage: () => void;
  onRegenerateResponse: (index: number) => void;
  onSwipe: (index: number, direction: "left" | "right") => void;
  onPlayMessage: (text: string, index: number) => void;
  onEditingTextChange: (text: string) => void;
  onShowLorebook: () => void;
  onShowMemory: () => void;
}

export function ConversationPanel({
  conversationHistory,
  userName,
  assistantName,
  showLeftPanel,
  connected,
  ttsEngine,
  outputMode,
  currentVoice,
  availableVoices,
  useContext,
  includeImageGen,
  playingMessageIndex,
  editingMessage,
  showRealtimePanel,
  userCharacterImage,
  assistantCharacterImage,
  inSceneCharacters,
  selectedCharacterId,
  rigAssets,
  stageEnabled,
  stageDirective,
  assistantMood,
  streamingText,
  isStreaming,
  formattingEnabled,
  ambient,
  immersive,
  scene,
  fxEnabled,
  memoryCovered,
  memoryBusy,
  theme,
  onToggleImmersive,
  onToggleFormatting,
  onTtsEngineChange,
  onVoiceChange,
  onToggleContext,
  onToggleImageGen,
  onToggleStage,
  onClearChat,
  onStopAudio,
  onShowSettings,
  onToggleLeftPanel,
  onToggleRealtimePanel,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onDeleteMessage,
  onRewindToMessage,
  onResendMessage,
  onRegenerateResponse,
  onSwipe,
  onPlayMessage,
  onEditingTextChange,
  onShowLorebook,
  onShowMemory
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive or the reply streams in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory, streamingText, isStreaming]);

  return (
    <>
      {/* Title bar — the story's marquee */}
      <div style={{
        padding: "10px 20px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          className="icon-btn"
          onClick={onToggleLeftPanel}
          data-active={showLeftPanel}
          title={showLeftPanel ? "Hide controls panel" : "Show controls panel"}
        >
          <IconPanelLeft size={16} />
        </button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flex: 1 }}>
          <h1 style={{
            margin: 0,
            fontSize: 15.5,
            fontWeight: 600,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.prose,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {assistantName || "Untitled story"}
          </h1>

          {/* Live mood — the character's emotional weather */}
          {assistantMood && (
            <span
              title={`${assistantName} feels ${assistantMood}`}
              className="fade-up"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 9px",
                borderRadius: 999,
                background: `color-mix(in srgb, ${moodToColor(assistantMood)} 14%, transparent)`,
                fontSize: 11.5,
                fontWeight: 500,
                color: theme.colors.textSecondary,
                whiteSpace: "nowrap",
                textTransform: "capitalize",
              }}
            >
              <span style={{ fontSize: 13 }}>{moodToEmoji(assistantMood)}</span>
              {assistantMood}
            </span>
          )}

          <span className="meta-mono" style={{ whiteSpace: "nowrap" }}>
            {conversationHistory.length} messages
          </span>
        </div>

        {/* Voice pickers (voice output only) */}
        {outputMode === "voice" && (
          <>
            <select
              className="input"
              value={ttsEngine}
              onChange={(e) => onTtsEngineChange(e.target.value as TtsEngine)}
              disabled={!connected}
              title="Speech engine"
              style={{ fontSize: 11.5, padding: "4px 8px" }}
            >
              <option value="piper">Piper</option>
              <option value="chatterbox">Chatterbox</option>
              <option value="soprano">Soprano</option>
            </select>
            <select
              className="input"
              value={currentVoice}
              onChange={(e) => onVoiceChange(e.target.value)}
              disabled={!connected}
              title="Voice"
              style={{ fontSize: 11.5, padding: "4px 8px", maxWidth: 150 }}
            >
              {availableVoices.map(v => (
                <option key={v.name} value={v.name}>
                  {v.name.length > 22 ? v.name.substring(0, 20) + '…' : v.name}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Mode toggles */}
        <button
          className="icon-btn"
          data-active={useContext}
          disabled={!connected}
          onClick={() => onToggleContext(!useContext)}
          title={useContext ? "Story memory on — the model sees the whole conversation" : "Story memory off — each message stands alone"}
        >
          <IconMessage size={16} />
        </button>
        <button
          className="icon-btn"
          data-active={includeImageGen}
          disabled={!connected}
          onClick={() => onToggleImageGen(!includeImageGen)}
          title={includeImageGen ? "Image generation on — the character may send images" : "Image generation off"}
        >
          <IconImage size={16} />
        </button>
        <button
          className="icon-btn"
          data-active={stageEnabled}
          onClick={() => onToggleStage(!stageEnabled)}
          title={stageEnabled ? "Animated stage on — the model may send hidden rig motion cues" : "Animated stage off — hide the rig and stop motion cues"}
        >
          <IconSparkles size={16} />
        </button>
        <button
          className="icon-btn"
          data-active={formattingEnabled}
          onClick={() => onToggleFormatting(!formattingEnabled)}
          title={formattingEnabled ? "Rich prose formatting on (*actions*, \"dialogue\")" : "Rich prose formatting off"}
        >
          <IconItalic size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: theme.colors.border, margin: "0 2px" }} />

        <button className="icon-btn" onClick={onShowLorebook} title="Lorebook / world info">
          <IconBookOpen size={16} />
        </button>
        {/* Story memory — lit once the record is standing in for older messages,
            so you can see at a glance that the story is being remembered. */}
        <button
          className="icon-btn"
          data-active={memoryCovered > 0}
          onClick={onShowMemory}
          title={
            memoryBusy
              ? "Story memory — writing the story so far…"
              : memoryCovered > 0
                ? `Story memory — remembering ${memoryCovered} earlier ${memoryCovered === 1 ? "message" : "messages"}`
                : "Story memory — long-term recall for a story that outgrows the context window"
          }
        >
          <IconBrain size={16} className={memoryBusy ? "spin" : undefined} />
        </button>
        <button className="icon-btn" onClick={onShowSettings} title="Story & system (global prompt, scenario, author's note)">
          <IconSliders size={16} />
        </button>
        <button className="icon-btn danger" disabled={!connected} onClick={onClearChat} title="Clear the conversation">
          <IconEraser size={16} />
        </button>
        <button className="icon-btn danger" disabled={!connected} onClick={onStopAudio} title="Stop audio">
          <IconStop size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: theme.colors.border, margin: "0 2px" }} />

        <button
          className="icon-btn"
          data-active={immersive}
          onClick={onToggleImmersive}
          title={immersive ? "Exit cinematic reading mode" : "Cinematic reading mode — focused view, book prose, living backdrop"}
        >
          <IconFilm size={16} />
        </button>
        <button
          className="icon-btn"
          data-active={showRealtimePanel}
          onClick={onToggleRealtimePanel}
          title={showRealtimePanel ? "Hide voice & status panel" : "Show voice & status panel"}
        >
          <IconPanelRight size={16} />
        </button>
      </div>

      {/* The stage — scene light, weather, and the story itself */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: ambient || theme.colors.background,
        transition: "background 1.2s ease",
        position: "relative",
      }}>
        <SceneFX
          time={scene.time}
          weather={scene.weather}
          themeName={theme.name}
          enabled={fxEnabled}
        />
        {stageEnabled && (
          <RigStage
            characters={inSceneCharacters}
            selectedId={selectedCharacterId}
            rigAssets={rigAssets}
            conversationHistory={conversationHistory}
            assistantMood={assistantMood}
            stageDirective={stageDirective}
            isStreaming={isStreaming}
            immersive={immersive}
            theme={theme}
          />
        )}
        <div style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          overflowY: "auto",
          padding: immersive ? "30px 24px" : "18px 22px",
        }}>
        <div style={{
          maxWidth: immersive ? 860 : "none",
          margin: immersive ? "0 auto" : undefined,
          position: "relative",
          zIndex: 1,
        }}>
        {conversationHistory.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "72px 20px",
            color: theme.colors.textTertiary,
          }}>
            <div style={{
              fontFamily: theme.fonts.prose,
              fontSize: 26,
              fontStyle: "italic",
              color: theme.colors.textSecondary,
              marginBottom: 10,
            }}>
              The stage is set.
            </div>
            <p style={{ fontSize: 13.5, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
              {connected
                ? "Say something below to begin — or set the scene above, pick your cast, and let the story find you."
                : "Connect in the left panel to raise the curtain."}
            </p>
            {connected && (
              <div style={{ marginTop: 22, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                <span className="chip" style={{ cursor: "default" }}><IconFeather size={13} /> Narrate a scene opening</span>
                <span className="chip" style={{ cursor: "default" }}>Import a character card</span>
                <span className="chip" style={{ cursor: "default" }}>Set time, weather &amp; place</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {conversationHistory.map((msg, idx) => (
              <MessageItem
                key={idx}
                message={msg}
                index={idx}
                userName={userName}
                assistantName={assistantName}
                isLast={idx === conversationHistory.length - 1}
                conversationLength={conversationHistory.length}
                playingMessageIndex={playingMessageIndex}
                editingMessage={editingMessage}
                userCharacterImage={userCharacterImage}
                assistantCharacterImage={assistantCharacterImage}
                formattingEnabled={formattingEnabled}
                immersive={immersive}
                theme={theme}
                onEdit={onEditMessage}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onDelete={onDeleteMessage}
                onRewind={onRewindToMessage}
                onResend={onResendMessage}
                onRegenerate={onRegenerateResponse}
                onSwipe={onSwipe}
                onPlay={onPlayMessage}
                onEditingTextChange={onEditingTextChange}
              />
            ))}
            {isStreaming && (
              <StreamingBubble
                assistantName={assistantName}
                assistantCharacterImage={assistantCharacterImage}
                text={streamingText}
                mood={assistantMood}
                formattingEnabled={formattingEnabled}
                immersive={immersive}
                theme={theme}
              />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
        </div>
        </div>
      </div>
    </>
  );
}
