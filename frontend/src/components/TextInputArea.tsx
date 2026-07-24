import {
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Theme } from "../theme";
import {
  IconSend, IconImage, IconSkipForward, IconWand, IconBulb, IconFeather,
  IconX, IconAlert,
} from "./Icons";
import { ActionMenu, MenuAction } from "./ActionMenu";

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
  onDismissSuggestions: () => void;
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
  onPickSuggestion,
  onDismissSuggestions,
}: TextInputAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
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
    <div className="text-input-area" style={{
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
        <div className="suggestion-strip fade-up">
          <span className="label-caps">Suggested replies</span>
          <div className="suggestion-options">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${index}-${suggestion}`}
                className="chip"
                onClick={() => onPickSuggestion(suggestion)}
                title={suggestion}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn sm"
            onClick={onDismissSuggestions}
            title="Dismiss suggestions"
            aria-label="Dismiss suggested replies"
          >
            <IconX size={13} />
          </button>
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
        <div className="composer-actions" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 8px" }}>
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
          <ActionMenu
            label="Writing help"
            icon={<IconBulb size={14} />}
            align="start"
            panelWidth={300}
            rootClassName="composer-writing-menu"
            disabled={!connected || busy || !hasHistory}
            title="Get help writing the next part of the story"
          >
            {(closeMenu) => (
              <>
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconBulb size={15} />}
                  label={isSuggesting ? "Thinking…" : "Suggest replies"}
                  description="Get a few ideas you could send next"
                  disabled={!connected || busy || !hasHistory}
                  onSelect={onSuggest}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconWand size={15} />}
                  label={isImpersonating ? "Writing…" : "Draft my reply"}
                  description="Create an editable draft in your voice"
                  disabled={!connected || busy || !hasHistory}
                  onSelect={onImpersonate}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconSkipForward size={15} />}
                  label={isContinuing ? "Continuing…" : "Continue story"}
                  description="Ask the character to keep the scene moving"
                  disabled={!connected || busy || !hasHistory}
                  onSelect={onContinue}
                />
              </>
            )}
          </ActionMenu>
          <button
            className="btn btn-quiet"
            onClick={onNarrate}
            disabled={!canNarrate}
            title="Send as narration — an omniscient scene beat the character reacts to"
            aria-label="Send as narration"
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
