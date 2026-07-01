import { useRef } from "react";
import { Theme } from "../theme";

interface TextInputAreaProps {
  connected: boolean;
  textInput: string;
  conversationLength: number;
  attachedImage: string | null;
  isImpersonating: boolean;
  isSendingMessage: boolean;
  isContinuing: boolean;
  isSuggesting: boolean;
  suggestions: string[];
  inputError: string | null;
  theme: Theme;
  onTextChange: (text: string) => void;
  onImageAttach: (base64Image: string | null) => void;
  onDismissError: () => void;
  onSend: () => void;
  onNarrate: () => void;
  onContinue: () => void;
  onImpersonate: () => void;
  onSuggest: () => void;
  onPickSuggestion: (text: string) => void;
}

/** Compact, subtle button used for the secondary actions in the input toolbar. */
function ToolButton({
  onClick,
  disabled,
  title,
  active,
  theme,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  theme: Theme;
  children: React.ReactNode;
}) {
  const background = disabled
    ? theme.colors.buttonDisabled
    : active
      ? theme.colors.secondary
      : theme.colors.buttonSecondary;
  const color = disabled
    ? theme.colors.textTertiary
    : active
      ? "white"
      : theme.colors.textPrimary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "8px 14px",
        fontSize: 13,
        background,
        color,
        border: `1px solid ${active ? "transparent" : theme.colors.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
        whiteSpace: "nowrap",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = active ? theme.colors.secondary : theme.colors.buttonSecondaryHover; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = background; }}
    >
      {children}
    </button>
  );
}

export function TextInputArea({
  connected,
  textInput,
  conversationLength,
  attachedImage,
  isImpersonating,
  isSendingMessage,
  isContinuing,
  isSuggesting,
  suggestions,
  inputError,
  theme,
  onTextChange,
  onImageAttach,
  onDismissError,
  onSend,
  onNarrate,
  onContinue,
  onImpersonate,
  onSuggest,
  onPickSuggestion
}: TextInputAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onImageAttach(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onImageAttach(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Shared gating: AI-assist actions need an active connection and some history.
  const hasHistory = conversationLength > 0;
  const busy = isSendingMessage || isContinuing || isImpersonating || isSuggesting;
  const canSend = connected && !isSendingMessage && !isContinuing && !isImpersonating && (textInput.trim().length > 0 || !!attachedImage);
  // Narration is an out-of-character scene beat: needs some text, no image.
  const canNarrate = connected && !busy && textInput.trim().length > 0;

  return (
    <div style={{
      padding: "20px 24px",
      borderTop: `1px solid ${theme.colors.border}`,
      background: theme.colors.surface
    }}>
      {inputError && (
        <div style={{
          marginBottom: 12,
          padding: "10px 12px",
          border: `1px solid ${theme.colors.error}`,
          borderRadius: 10,
          background: `${theme.colors.error}22`,
          color: theme.colors.textPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 13
        }}>
          <span>Backend error: {inputError}</span>
          <button
            onClick={onDismissError}
            style={{
              border: "none",
              background: "transparent",
              color: theme.colors.textPrimary,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Image Preview */}
      {attachedImage && (
        <div style={{
          marginBottom: 12,
          padding: 8,
          border: `2px solid ${theme.colors.secondary}`,
          borderRadius: 8,
          display: "inline-block",
          position: "relative"
        }}>
          <img
            src={attachedImage}
            alt="Attached"
            style={{
              maxWidth: 200,
              maxHeight: 150,
              borderRadius: 4,
              display: "block"
            }}
          />
          <button
            onClick={handleRemoveImage}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: theme.colors.error,
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: 24,
              height: 24,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              transition: "opacity 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            ✕
          </button>
        </div>
      )}

      {/* Suggested replies — click a chip to drop it into the input */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: theme.colors.textTertiary, fontWeight: 600 }}>💡 Suggestions:</span>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPickSuggestion(s)}
              title="Use this reply"
              style={{
                padding: "6px 12px",
                fontSize: 13,
                background: theme.colors.primaryLight,
                color: theme.colors.textPrimary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 999,
                cursor: "pointer",
                maxWidth: 360,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.colors.secondary; e.currentTarget.style.color = "white"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = theme.colors.primaryLight; e.currentTarget.style.color = theme.colors.textPrimary; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: "none" }}
      />

      {/* Message composer */}
      <textarea
        value={textInput}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
        disabled={!connected}
        rows={3}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "12px 16px",
          fontSize: 14,
          borderRadius: 12,
          border: `2px solid ${theme.colors.border}`,
          resize: "none",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.2s",
          background: theme.colors.surface,
          color: theme.colors.textPrimary
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = theme.colors.secondary}
        onBlur={(e) => e.currentTarget.style.borderColor = theme.colors.border}
      />

      {/* Action toolbar: compose helpers + AI assists on the left, primary Send on the right */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Compose helper */}
        <ToolButton
          onClick={() => fileInputRef.current?.click()}
          disabled={!connected}
          title="Attach an image to your message"
          active={!!attachedImage}
          theme={theme}
        >
          {attachedImage ? "🖼️ Image ✓" : "🖼️ Image"}
        </ToolButton>

        {/* Divider between composing and AI assists */}
        <div style={{ width: 1, height: 22, background: theme.colors.border, margin: "0 2px" }} />

        {/* AI assists (need an existing conversation) */}
        <ToolButton
          onClick={onContinue}
          disabled={!connected || busy || !hasHistory}
          title="Continue the scene (ask the character to keep going)"
          theme={theme}
        >
          {isContinuing ? "⏳ Continuing…" : "▶️ Continue"}
        </ToolButton>
        <ToolButton
          onClick={onImpersonate}
          disabled={!connected || busy || !hasHistory}
          title="Let the AI write a reply as you (impersonate)"
          theme={theme}
        >
          {isImpersonating ? "⏳ Writing…" : "🎭 As Me"}
        </ToolButton>
        <ToolButton
          onClick={onSuggest}
          disabled={!connected || busy || !hasHistory}
          title="Suggest a few replies you could send next"
          theme={theme}
        >
          {isSuggesting ? "⏳ Thinking…" : "💡 Suggest"}
        </ToolButton>
        <ToolButton
          onClick={onNarrate}
          disabled={!canNarrate}
          title="Send this as narration — an omniscient scene beat the character reacts to (not you speaking)"
          theme={theme}
        >
          🎬 Narrate
        </ToolButton>

        {/* Primary action */}
        <button
          onClick={onSend}
          disabled={!canSend}
          title="Send message (Enter)"
          style={{
            marginLeft: "auto",
            padding: "10px 28px",
            fontSize: 14,
            background: canSend ? theme.colors.buttonPrimary : theme.colors.buttonDisabled,
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: canSend ? "pointer" : "not-allowed",
            fontWeight: 700,
            boxShadow: canSend ? theme.colors.shadowSm : "none",
            transition: "all 0.2s",
            whiteSpace: "nowrap"
          }}
          onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = theme.colors.buttonPrimaryHover; }}
          onMouseLeave={(e) => { if (canSend) e.currentTarget.style.background = theme.colors.buttonPrimary; }}
        >
          {isSendingMessage ? "⏳ Sending…" : "📤 Send"}
        </button>
      </div>
    </div>
  );
}
