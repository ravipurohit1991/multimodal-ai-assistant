import { useRef } from "react";
import { Theme } from "../theme";

interface TextInputAreaProps {
  connected: boolean;
  textInput: string;
  conversationLength: number;
  attachedImage: string | null;
  theme: Theme;
  onTextChange: (text: string) => void;
  onImageAttach: (base64Image: string | null) => void;
  onSend: () => void;
  onContinue: () => void;
}

export function TextInputArea({
  connected,
  textInput,
  conversationLength,
  attachedImage,
  theme,
  onTextChange,
  onImageAttach,
  onSend,
  onContinue
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

  return (
    <div style={{
      padding: "20px 24px",
      borderTop: `1px solid ${theme.colors.border}`,
      background: theme.colors.surface
    }}>
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
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: "none" }}
        />
        <textarea
          value={textInput}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
          disabled={!connected}
          rows={3}
          style={{
            flex: 1,
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Image Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected}
            title="Attach image"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              background: connected
                ? attachedImage
                  ? theme.colors.secondary
                  : theme.colors.warning
                : theme.colors.buttonDisabled,
              color: "white",
              border: "none",
              borderRadius: 12,
              cursor: connected ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected ? theme.colors.shadowSm : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => { if (connected) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { if (connected) e.currentTarget.style.opacity = "1"; }}
          >
            {attachedImage ? "🖼️ Change" : "🖼️ Image"}
          </button>
          <button
            onClick={onSend}
            disabled={!connected || (!textInput.trim() && !attachedImage)}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              background: connected && (textInput.trim() || attachedImage)
                ? theme.colors.buttonPrimary
                : theme.colors.buttonDisabled,
              color: "white",
              border: "none",
              borderRadius: 12,
              cursor: connected && (textInput.trim() || attachedImage) ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected && (textInput.trim() || attachedImage)
                ? theme.colors.shadowSm
                : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => { if (connected && (textInput.trim() || attachedImage)) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { if (connected && (textInput.trim() || attachedImage)) e.currentTarget.style.opacity = "1"; }}
          >
            📤 Send
          </button>
          <button
            onClick={onContinue}
            disabled={!connected || conversationLength === 0}
            title="Continue the conversation (send continue prompt)"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              background: connected && conversationLength > 0
                ? theme.colors.info
                : theme.colors.buttonDisabled,
              color: "white",
              border: "none",
              borderRadius: 12,
              cursor: connected && conversationLength > 0 ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected && conversationLength > 0
                ? theme.colors.shadowSm
                : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => { if (connected && conversationLength > 0) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { if (connected && conversationLength > 0) e.currentTarget.style.opacity = "1"; }}
          >
            ▶️ Continue
          </button>
        </div>
      </div>
    </div>
  );
}
