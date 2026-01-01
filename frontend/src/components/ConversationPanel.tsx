import { useRef, useEffect } from "react";
import { Message, VoiceInfo, TtsEngine, OutputMode } from "../types";
import { MessageItem } from "./MessageItem";
import { Theme } from "../theme";

interface ConversationPanelProps {
  conversationHistory: Message[];
  userName: string;
  assistantName: string;
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
  theme: Theme;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onVoiceChange: (voice: string) => void;
  onToggleContext: (enabled: boolean) => void;
  onToggleImageGen: (enabled: boolean) => void;
  onClearChat: () => void;
  onStopAudio: () => void;
  onShowSettings: () => void;
  onToggleRealtimePanel: () => void;
  onEditMessage: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDeleteMessage: (index: number) => void;
  onRewindToMessage: (index: number) => void;
  onResendMessage: () => void;
  onRegenerateResponse: () => void;
  onPlayMessage: (text: string, index: number) => void;
  onEditingTextChange: (text: string) => void;
  onShowUserCharacter: () => void;
  onShowAssistantCharacter: () => void;
}

export function ConversationPanel({
  conversationHistory,
  userName,
  assistantName,
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
  theme,
  onTtsEngineChange,
  onVoiceChange,
  onToggleContext,
  onToggleImageGen,
  onClearChat,
  onStopAudio,
  onShowSettings,
  onToggleRealtimePanel,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onDeleteMessage,
  onRewindToMessage,
  onResendMessage,
  onRegenerateResponse,
  onPlayMessage,
  onEditingTextChange,
  onShowUserCharacter,
  onShowAssistantCharacter
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory]);

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
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.colors.textPrimary }}>
              💬 Conversation History
            </h3>

            {/* Character Avatars */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={onShowUserCharacter}
                title={`${userName}'s Character`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: `2px solid ${theme.colors.info}`,
                  cursor: "pointer",
                  overflow: "hidden",
                  padding: 0,
                  background: userCharacterImage ? "transparent" : theme.colors.primaryLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  transition: "transform 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              >
                {userCharacterImage ? (
                  <img src={userCharacterImage} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "👤"
                )}
              </button>

              <button
                onClick={onShowAssistantCharacter}
                title={`${assistantName}'s Character`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: `2px solid ${theme.colors.success}`,
                  cursor: "pointer",
                  overflow: "hidden",
                  padding: 0,
                  background: assistantCharacterImage ? "transparent" : theme.colors.primaryLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  transition: "transform 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              >
                {assistantCharacterImage ? (
                  <img src={assistantCharacterImage} alt={assistantName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "🤖"
                )}
              </button>
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
              onClick={onShowSettings}
              title="Character & System Prompt"
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
              🎭
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

      {/* Messages Container */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
        background: theme.colors.background
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
                theme={theme}
                onEdit={onEditMessage}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onDelete={onDeleteMessage}
                onRewind={onRewindToMessage}
                onResend={onResendMessage}
                onRegenerate={onRegenerateResponse}
                onPlay={onPlayMessage}
                onEditingTextChange={onEditingTextChange}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </>
  );
}
