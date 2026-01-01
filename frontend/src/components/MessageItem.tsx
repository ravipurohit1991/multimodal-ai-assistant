import { Message } from "../types";

interface MessageItemProps {
  message: Message;
  index: number;
  userName: string;
  assistantName: string;
  isLast: boolean;
  conversationLength: number;
  playingMessageIndex: number | null;
  editingMessage: { index: number; text: string } | null;
  userCharacterImage: string | null;
  assistantCharacterImage: string | null;
  onEdit: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onRewind: (index: number) => void;
  onResend: () => void;
  onRegenerate: () => void;
  onPlay: (text: string, index: number) => void;
  onEditingTextChange: (text: string) => void;
}

export function MessageItem({
  message,
  index,
  userName,
  assistantName,
  isLast,
  conversationLength,
  playingMessageIndex,
  editingMessage,
  userCharacterImage,
  assistantCharacterImage,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRewind,
  onResend,
  onRegenerate,
  onPlay,
  onEditingTextChange
}: MessageItemProps) {
  const isEditing = editingMessage?.index === index;
  const characterImage = message.role === "user" ? userCharacterImage : assistantCharacterImage;

  return (
    <div
      style={{
        marginBottom: 16,
        display: "flex",
        flexDirection: message.role === "user" ? "row-reverse" : "row",
        gap: 12
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: characterImage ? "transparent" : (message.role === "user"
          ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        flexShrink: 0,
        overflow: "hidden",
        border: message.role === "user" ? "2px solid #667eea" : "2px solid #f5576c"
      }}>
        {characterImage ? (
          <img src={characterImage} alt={message.role === "user" ? userName : assistantName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          message.role === "user" ? "👤" : "🤖"
        )}
      </div>

      {/* Message Content */}
      <div style={{
        maxWidth: "70%",
        display: "flex",
        flexDirection: "column",
        gap: 6
      }}>
        {/* Name and Timestamp */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexDirection: message.role === "user" ? "row-reverse" : "row"
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#2d3748"
          }}>
            {message.role === "user" ? userName : assistantName}
          </span>
          <span style={{
            fontSize: 11,
            color: "#a0aec0"
          }}>
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>

        {/* Message Bubble */}
        {isEditing ? (
          <div>
            <textarea
              value={editingMessage.text}
              onChange={(e) => onEditingTextChange(e.target.value)}
              style={{
                width: "100%",
                minHeight: 80,
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
                borderRadius: 12,
                border: "2px solid #667eea",
                resize: "vertical"
              }}
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                onClick={() => onSaveEdit(index)}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                ✓ Save
              </button>
              <button
                onClick={onCancelEdit}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  background: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                ✗ Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: message.role === "user" ? "#667eea" : "white",
              color: message.role === "user" ? "white" : "#2d3748",
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              boxShadow: message.role === "user"
                ? "0 2px 8px rgba(102, 126, 234, 0.3)"
                : "0 2px 8px rgba(0, 0, 0, 0.1)",
              border: message.role === "assistant" ? "1px solid #e1e8ed" : "none"
            }}>
              {/* Display user-attached image at the top if present */}
              {message.role === "user" && message.image && (
                <div style={{ marginBottom: message.content ? 12 : 0 }}>
                  <img
                    src={message.image}
                    alt="User attached image"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 300,
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
                      display: "block"
                    }}
                  />
                </div>
              )}
              
              {message.content}
              
              {/* Display AI-generated image if present (for assistant messages) */}
              {message.role === "assistant" && message.image && (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${message.image}`}
                    alt={message.imagePrompt || "Generated image"}
                    style={{
                      maxWidth: "100%",
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                      display: "block"
                    }}
                  />
                  {message.imagePrompt && (
                    <div style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: message.role === "user" ? "rgba(255, 255, 255, 0.8)" : "#718096",
                      fontStyle: "italic"
                    }}>
                      {message.imagePrompt}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div style={{
              marginTop: 6,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              justifyContent: message.role === "user" ? "flex-end" : "flex-start"
            }}>
              {/* Replay Audio Button (only for assistant) */}
              {message.role === "assistant" && (
                <button
                  onClick={() => onPlay(message.content, index)}
                  title={playingMessageIndex === index ? "Stop audio" : "Replay audio"}
                  style={{
                    fontSize: 13,
                    padding: "3px 6px",
                    background: playingMessageIndex === index ? "#f44336" : "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1
                  }}
                >
                  {playingMessageIndex === index ? "⏹️" : "🔊"}
                </button>
              )}
              
              {/* Edit Button */}
              <button
                onClick={() => onEdit(index)}
                title="Edit message"
                style={{
                  fontSize: 13,
                  padding: "3px 6px",
                  background: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1
                }}
              >
                ✏️
              </button>
              
              {/* Delete Button */}
              <button
                onClick={() => onDelete(index)}
                title="Remove message"
                style={{
                  fontSize: 13,
                  padding: "3px 6px",
                  background: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1
                }}
              >
                🗑️
              </button>
              
              {/* Rewind Button (remove all downstream messages) */}
              {index < conversationLength - 1 && (
                <button
                  onClick={() => onRewind(index)}
                  title="Rewind to this message (remove all messages after this)"
                  style={{
                    fontSize: 13,
                    padding: "3px 6px",
                    background: "#FF9800",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1
                  }}
                >
                  ⏪
                </button>
              )}
              
              {/* Resend Button (only for last message if it's a user message) */}
              {message.role === "user" && isLast && (
                <button
                  onClick={onResend}
                  title="Resend this message"
                  style={{
                    fontSize: 13,
                    padding: "3px 6px",
                    background: "#9C27B0",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1
                  }}
                >
                  🔄
                </button>
              )}
              
              {/* Regenerate Button (only for last message if it's an assistant message) */}
              {message.role === "assistant" && isLast && (
                <button
                  onClick={onRegenerate}
                  title="Regenerate response"
                  style={{
                    fontSize: 13,
                    padding: "3px 6px",
                    background: "#673AB7",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1
                  }}
                >
                  🔁
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
