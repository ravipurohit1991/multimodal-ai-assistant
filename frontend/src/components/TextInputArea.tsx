import { useRef } from "react";

interface TextInputAreaProps {
  connected: boolean;
  textInput: string;
  conversationLength: number;
  attachedImage: string | null;
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
      borderTop: "2px solid #e1e8ed",
      background: "white"
    }}>
      {/* Image Preview */}
      {attachedImage && (
        <div style={{
          marginBottom: 12,
          padding: 8,
          border: "2px solid #667eea",
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
              background: "#f44336",
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
              fontWeight: "bold"
            }}
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
            border: "2px solid #e1e8ed",
            resize: "none",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 0.2s"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "#667eea"}
          onBlur={(e) => e.currentTarget.style.borderColor = "#e1e8ed"}
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
                  ? "linear-gradient(135deg, #9c27b0 0%, #673ab7 100%)"
                  : "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)"
                : "#e0e0e0",
              color: connected ? "white" : "#999",
              border: "none",
              borderRadius: 12,
              cursor: connected ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected
                ? "0 2px 8px rgba(255, 152, 0, 0.3)"
                : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
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
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "#e0e0e0",
              color: connected && (textInput.trim() || attachedImage) ? "white" : "#999",
              border: "none",
              borderRadius: 12,
              cursor: connected && (textInput.trim() || attachedImage) ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected && (textInput.trim() || attachedImage)
                ? "0 2px 8px rgba(102, 126, 234, 0.3)"
                : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
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
                ? "linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)"
                : "#e0e0e0",
              color: connected && conversationLength > 0 ? "white" : "#999",
              border: "none",
              borderRadius: 12,
              cursor: connected && conversationLength > 0 ? "pointer" : "not-allowed",
              fontWeight: 600,
              boxShadow: connected && conversationLength > 0
                ? "0 2px 8px rgba(0, 188, 212, 0.3)"
                : "none",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
          >
            ▶️ Continue
          </button>
        </div>
      </div>
    </div>
  );
}
