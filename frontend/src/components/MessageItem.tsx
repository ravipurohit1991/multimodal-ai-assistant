import { Message } from "../types";
import { Theme } from "../theme";
import { FormattedText } from "./FormattedText";
import { moodToEmoji, moodToColor } from "../mood";

// Book-like serif stack used in cinematic reading mode.
const SERIF_STACK =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif";

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
  formattingEnabled: boolean;
  immersive?: boolean;
  theme: Theme;
  onEdit: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onRewind: (index: number) => void;
  onResend: () => void;
  onRegenerate: (index: number) => void;
  onSwipe: (index: number, direction: "left" | "right") => void;
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
  formattingEnabled,
  immersive = false,
  theme,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRewind,
  onResend,
  onRegenerate,
  onSwipe,
  onPlay,
  onEditingTextChange
}: MessageItemProps) {
  const isEditing = editingMessage?.index === index;

  // Narrator beats render as an omniscient scene line — centered, italic, no
  // avatar or bubble — like a book's stage direction. (Editing falls through to
  // the standard editor below.)
  if (message.narrator && !isEditing) {
    const tinyBtn = (bg: string): React.CSSProperties => ({
      fontSize: 12,
      padding: "2px 6px",
      background: bg,
      color: "white",
      border: "none",
      borderRadius: 3,
      cursor: "pointer",
      fontWeight: 600,
      lineHeight: 1,
    });
    return (
      <div style={{ margin: immersive ? "22px auto" : "18px auto", maxWidth: immersive ? 760 : 620, textAlign: "center" }}>
        <div style={{
          fontFamily: SERIF_STACK,
          fontStyle: "italic",
          fontSize: immersive ? 15 : 13.5,
          lineHeight: 1.7,
          color: theme.colors.textSecondary,
          padding: immersive ? "10px 20px" : "8px 16px",
          borderTop: `1px solid ${theme.colors.border}`,
          borderBottom: `1px solid ${theme.colors.border}`,
          whiteSpace: "pre-wrap",
        }}>
          {formattingEnabled ? (
            <FormattedText text={message.content} theme={theme} />
          ) : (
            message.content
          )}
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 4, justifyContent: "center", opacity: 0.7 }}>
          <button onClick={() => onEdit(index)} title="Edit narration" style={tinyBtn("#2196F3")}>✏️</button>
          <button onClick={() => onDelete(index)} title="Remove narration" style={tinyBtn("#f44336")}>🗑️</button>
          {index < conversationLength - 1 && (
            <button onClick={() => onRewind(index)} title="Rewind to here" style={tinyBtn("#FF9800")}>⏪</button>
          )}
        </div>
      </div>
    );
  }

  const characterImage = message.role === "user"
    ? userCharacterImage
    : (message.characterImage || assistantCharacterImage);
  // In group scenes, an assistant reply is attributed to the speaker that authored it.
  const displayName = message.role === "user"
    ? userName
    : (message.speaker || assistantName);

  // Response swipes: alternative generations for the latest assistant message.
  const swipes = message.swipes ?? [message.content];
  const swipeIndex = message.swipeIndex ?? swipes.length - 1;
  const showSwipes = message.role === "assistant" && isLast;

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
          <img src={characterImage} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          message.role === "user" ? "👤" : "🤖"
        )}
      </div>

      {/* Message Content */}
      <div style={{
        maxWidth: immersive ? "82%" : "70%",
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
            {displayName}
          </span>
          {message.role === "assistant" && message.mood && (
            <span title={`Mood: ${message.mood}`} style={{ fontSize: 14, lineHeight: 1 }}>
              {moodToEmoji(message.mood)}
            </span>
          )}
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
              padding: immersive ? "14px 18px" : "12px 16px",
              borderRadius: 12,
              background: message.role === "user" ? "#667eea" : "white",
              color: message.role === "user" ? "white" : "#2d3748",
              fontFamily: immersive ? SERIF_STACK : "inherit",
              fontSize: immersive ? 15.5 : 14,
              lineHeight: immersive ? 1.75 : 1.5,
              whiteSpace: "pre-wrap",
              boxShadow: message.role === "user"
                ? "0 2px 8px rgba(102, 126, 234, 0.3)"
                : "0 2px 8px rgba(0, 0, 0, 0.1)",
              border: message.role === "assistant" ? "1px solid #e1e8ed" : "none",
              // Tint the assistant bubble's edge with the mood it was delivered in
              ...(message.role === "assistant" && message.mood
                ? { borderLeft: `3px solid ${moodToColor(message.mood)}` }
                : {})
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

              {message.role === "assistant" && formattingEnabled ? (
                <FormattedText
                  text={message.content}
                  theme={theme}
                  dialogueColor="#4c51bf"
                  actionColor="#6b7280"
                />
              ) : (
                message.content
              )}

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
                      color: "#718096",
                      fontStyle: "italic"
                    }}>
                      {message.imagePrompt}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Swipe navigation — browse / generate alternative responses */}
            {showSwipes && (
              <div style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: theme.colors.textTertiary
              }}>
                <button
                  onClick={() => onSwipe(index, "left")}
                  disabled={swipeIndex <= 0}
                  title="Previous response"
                  style={{
                    padding: "2px 8px",
                    background: swipeIndex <= 0 ? theme.colors.buttonDisabled : theme.colors.buttonSecondary,
                    color: swipeIndex <= 0 ? theme.colors.textTertiary : theme.colors.textPrimary,
                    border: "none",
                    borderRadius: 4,
                    cursor: swipeIndex <= 0 ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    lineHeight: 1.2
                  }}
                >
                  ◀
                </button>
                <span style={{ fontWeight: 600, minWidth: 34, textAlign: "center" }}>
                  {swipeIndex + 1} / {swipes.length}
                </span>
                <button
                  onClick={() => onSwipe(index, "right")}
                  title={swipeIndex >= swipes.length - 1 ? "Generate a new alternative" : "Next response"}
                  style={{
                    padding: "2px 8px",
                    background: theme.colors.buttonSecondary,
                    color: theme.colors.textPrimary,
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 700,
                    lineHeight: 1.2
                  }}
                >
                  {swipeIndex >= swipes.length - 1 ? "➕" : "▶"}
                </button>
              </div>
            )}

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
                  onClick={() => onRegenerate(index)}
                  title="Regenerate response (adds a new swipe)"
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
