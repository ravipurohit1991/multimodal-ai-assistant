import { useRef } from "react";
import { Theme } from "../theme";
import {
  IconSend, IconImage, IconSkipForward, IconWand, IconBulb, IconFeather,
  IconX, IconAlert,
} from "./Icons";

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onImageAttach(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onImageAttach(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Shared gating: AI-assist actions need an active connection and some history.
  const hasHistory = conversationLength > 0;
  const busy = isSendingMessage || isContinuing || isImpersonating || isSuggesting;
  const canSend = connected && !isSendingMessage && !isContinuing && !isImpersonating && (textInput.trim().length > 0 || !!attachedImage);
  // Narration is an out-of-character scene beat: needs some text, no image.
  const canNarrate = connected && !busy && textInput.trim().length > 0;

  return (
    <div style={{
      padding: "12px 20px 14px",
      borderTop: `1px solid ${theme.colors.border}`,
      background: theme.colors.surface
    }}>
      {inputError && (
        <div style={{
          marginBottom: 10,
          padding: "9px 12px",
          borderRadius: 10,
          background: theme.colors.errorLight,
          borderLeft: `3px solid ${theme.colors.error}`,
          color: theme.colors.textPrimary,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5
        }}>
          <span style={{ color: theme.colors.error, display: "inline-flex" }}><IconAlert size={15} /></span>
          <span style={{ flex: 1 }}>{inputError}</span>
          <button className="icon-btn sm" onClick={onDismissError} title="Dismiss">
            <IconX size={13} />
          </button>
        </div>
      )}

      {/* Image attached to the next message */}
      {attachedImage && (
        <div style={{
          marginBottom: 10,
          padding: 5,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 12,
          display: "inline-block",
          position: "relative",
          background: theme.colors.surfaceElevated,
          boxShadow: theme.colors.shadowSm,
        }}>
          <img
            src={attachedImage}
            alt="Attached"
            style={{ maxWidth: 180, maxHeight: 130, borderRadius: 8, display: "block" }}
          />
          <button
            onClick={handleRemoveImage}
            title="Remove image"
            style={{
              position: "absolute",
              top: -7,
              right: -7,
              background: theme.colors.surfaceElevated,
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: "50%",
              width: 22,
              height: 22,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme.colors.shadowSm,
            }}
          >
            <IconX size={12} />
          </button>
        </div>
      )}

      {/* Suggested replies — click a chip to drop it into the composer */}
      {suggestions.length > 0 && (
        <div className="fade-up" style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="label-caps">Ideas</span>
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="chip"
              onClick={() => onPickSuggestion(s)}
              title={s}
              style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", display: "inline-block" }}
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

      {/* The composer console */}
      <div className="composer">
        <textarea
          value={textInput}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write your part of the story…  (Enter to send · Shift+Enter for a new line)"
          disabled={!connected}
          rows={2}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 8px" }}>
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected}
            title="Attach an image"
            data-active={!!attachedImage}
          >
            <IconImage size={16} />
          </button>

          <div style={{ width: 1, height: 20, background: theme.colors.border, margin: "0 4px" }} />

          {/* AI assists (need an existing conversation) */}
          <button
            className="btn btn-quiet"
            onClick={onContinue}
            disabled={!connected || busy || !hasHistory}
            title="Ask the character to keep going"
            style={{ padding: "5px 10px", fontSize: 12.5 }}
          >
            <IconSkipForward size={14} /> {isContinuing ? "Continuing…" : "Continue"}
          </button>
          <button
            className="btn btn-quiet"
            onClick={onImpersonate}
            disabled={!connected || busy || !hasHistory}
            title="Let the AI draft your next line (you can edit it before sending)"
            style={{ padding: "5px 10px", fontSize: 12.5 }}
          >
            <IconWand size={14} /> {isImpersonating ? "Writing…" : "Write for me"}
          </button>
          <button
            className="btn btn-quiet"
            onClick={onSuggest}
            disabled={!connected || busy || !hasHistory}
            title="Suggest a few replies you could send"
            style={{ padding: "5px 10px", fontSize: 12.5 }}
          >
            <IconBulb size={14} /> {isSuggesting ? "Thinking…" : "Ideas"}
          </button>
          <button
            className="btn btn-quiet"
            onClick={onNarrate}
            disabled={!canNarrate}
            title="Send as narration — an omniscient scene beat the character reacts to"
            style={{ padding: "5px 10px", fontSize: 12.5 }}
          >
            <IconFeather size={14} /> Narrate
          </button>

          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={!canSend}
            title="Send (Enter)"
            style={{ marginLeft: "auto", padding: "7px 18px" }}
          >
            {isSendingMessage ? "Sending…" : "Send"} <IconSend size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
