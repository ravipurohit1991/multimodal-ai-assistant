import { useRef, useEffect } from "react";
import { Message, VoiceInfo, TtsEngine, OutputMode } from "../types";
import { MessageItem } from "./MessageItem";
import { StreamingBubble } from "./StreamingBubble";
import { moodToEmoji } from "../mood";
import { Theme } from "../theme";

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
  assistantMood: string;
  streamingText: string;
  isStreaming: boolean;
  formattingEnabled: boolean;
  /** Reactive scene/mood gradient for the reading area (falls back to theme bg). */
  ambient: string;
  /** Cinematic reading mode — serif prose, wider column, calmer spacing. */
  immersive: boolean;
  theme: Theme;
  onToggleImmersive: () => void;
  onToggleFormatting: (enabled: boolean) => void;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onVoiceChange: (voice: string) => void;
  onToggleContext: (enabled: boolean) => void;
  onToggleImageGen: (enabled: boolean) => void;
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
  assistantMood,
  streamingText,
  isStreaming,
  formattingEnabled,
  ambient,
  immersive,
  theme,
  onToggleImmersive,
  onToggleFormatting,
  onTtsEngineChange,
  onVoiceChange,
  onToggleContext,
  onToggleImageGen,
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
  onShowLorebook
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive or the reply streams in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory, streamingText, isStreaming]);

  return (
    <>
      {/* Conversation Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={onToggleLeftPanel}
              title={showLeftPanel ? "Hide Left Panel" : "Show Left Panel"}
              style={{
                fontSize: 18,
                padding: "6px 10px",
                background: showLeftPanel ? theme.colors.buttonSecondary : theme.colors.secondary,
                color: showLeftPanel ? theme.colors.textSecondary : "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              ☰
            </button>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.colors.textPrimary }}>
              💬 Conversation History
            </h3>

            {/* Live assistant mood badge (character avatars live in the Cast bar) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Live mood badge for the assistant character */}
              {assistantMood && (
                <div
                  title={`${assistantName} feels ${assistantMood}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: theme.colors.primaryLight,
                    border: `1px solid ${theme.colors.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.colors.textSecondary,
                    whiteSpace: "nowrap",
                    textTransform: "capitalize"
                  }}
                >
                  <span style={{ fontSize: 15 }}>{moodToEmoji(assistantMood)}</span>
                  {assistantMood}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: theme.colors.textTertiary, marginRight: 8 }}>
              {conversationHistory.length} messages
            </div>

            {/* TTS Engine Selector - Only for Voice Output */}
            {outputMode === "voice" && (
              <select
                value={ttsEngine}
                onChange={(e) => onTtsEngineChange(e.target.value as TtsEngine)}
                disabled={!connected}
                title="TTS Engine"
                style={{
                  fontSize: 11,
                  padding: "6px 8px",
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 6,
                  background: theme.colors.surface,
                  cursor: connected ? "pointer" : "not-allowed",
                  fontWeight: 500,
                  color: theme.colors.textPrimary
                }}
              >
                <option value="piper">Piper</option>
                <option value="chatterbox">Chatterbox</option>
                <option value="soprano">Soprano</option>
              </select>
            )}

            {/* Voice Selector - Only for Voice Output */}
            {outputMode === "voice" && (
              <select
                value={currentVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                disabled={!connected}
                title="Voice Model"
                style={{
                  fontSize: 11,
                  padding: "6px 8px",
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 6,
                  background: theme.colors.surface,
                  cursor: connected ? "pointer" : "not-allowed",
                  fontWeight: 500,
                  color: theme.colors.textPrimary,
                  maxWidth: 180
                }}
              >
                {availableVoices.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name.length > 25 ? v.name.substring(0, 22) + '...' : v.name}
                  </option>
                ))}
              </select>
            )}

            {/* Include Context Checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={useContext}
                onChange={(e) => onToggleContext(e.target.checked)}
                disabled={!connected}
                style={{ cursor: connected ? "pointer" : "not-allowed" }}
              />
              <span style={{ fontWeight: 500, color: theme.colors.textPrimary }}>📚 Context</span>
            </label>

            {/* Include ImageGen Checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeImageGen}
                onChange={(e) => onToggleImageGen(e.target.checked)}
                disabled={!connected}
                style={{ cursor: connected ? "pointer" : "not-allowed" }}
              />
              <span style={{ fontWeight: 500, color: theme.colors.textPrimary }}>🖼️ ImageGen</span>
            </label>

            {/* Rich roleplay formatting toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}
              title="Style *actions* and &quot;dialogue&quot; in messages">
              <input
                type="checkbox"
                checked={formattingEnabled}
                onChange={(e) => onToggleFormatting(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span style={{ fontWeight: 500, color: theme.colors.textPrimary }}>✨ Format</span>
            </label>

            <button
              disabled={!connected}
              onClick={onClearChat}
              title="Clear Chat"
              style={{
                fontSize: 20,
                padding: "6px 10px",
                background: connected ? theme.colors.warning : theme.colors.buttonDisabled,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: connected ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => { if (connected) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (connected) e.currentTarget.style.opacity = "1"; }}
            >
              🗑️
            </button>
            <button
              disabled={!connected}
              onClick={onStopAudio}
              title="Stop Audio"
              style={{
                fontSize: 20,
                padding: "6px 10px",
                background: connected ? theme.colors.error : theme.colors.buttonDisabled,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: connected ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => { if (connected) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (connected) e.currentTarget.style.opacity = "1"; }}
            >
              🛑
            </button>
            <button
              onClick={onShowLorebook}
              title="Lorebook / Memory"
              style={{
                fontSize: 20,
                padding: "6px 10px",
                background: theme.colors.info,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              📖
            </button>
            <button
              onClick={onShowSettings}
              title="Story & System (global prompt, scenario, author's note)"
              style={{
                fontSize: 20,
                padding: "6px 10px",
                background: theme.colors.primary,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              📜
            </button>
            <button
              onClick={onToggleImmersive}
              title={immersive ? "Exit cinematic reading mode" : "Cinematic reading mode (serif prose, ambient scene backdrop, focused view)"}
              style={{
                fontSize: 18,
                padding: "6px 10px",
                background: immersive ? theme.colors.secondary : theme.colors.buttonSecondary,
                color: immersive ? "white" : theme.colors.textSecondary,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              🎬
            </button>
            <button
              onClick={onToggleRealtimePanel}
              title={showRealtimePanel ? "Hide Real-time Panel" : "Show Real-time Panel"}
              style={{
                fontSize: 18,
                padding: "6px 10px",
                background: showRealtimePanel ? theme.colors.secondary : theme.colors.buttonSecondary,
                color: showRealtimePanel ? "white" : theme.colors.textSecondary,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              📊
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container — background reflects the current scene & mood */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: immersive ? "28px 24px" : "20px 24px",
        background: ambient || theme.colors.background,
        transition: "background 1.2s ease"
      }}>
        <div style={{
          maxWidth: immersive ? 900 : "none",
          margin: immersive ? "0 auto" : undefined
        }}>
        {conversationHistory.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: theme.colors.textTertiary
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <p style={{ fontSize: 16, fontWeight: 500, color: theme.colors.textSecondary }}>No messages yet</p>
            <p style={{ fontSize: 14, margin: "8px 0 0 0" }}>
              Start a conversation by holding the talk button or typing a message below
            </p>
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
    </>
  );
}
