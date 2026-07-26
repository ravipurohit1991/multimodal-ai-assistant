import { ContinuityReport, Message, SightlineLeak, StudyDrift } from "../types";
import { Theme } from "../theme";
import { FormattedText } from "./FormattedText";
import { moodToEmoji, moodToColor } from "../mood";
import {
  IconVolume, IconStop, IconPencil, IconTrash, IconRewind, IconRefresh,
  IconSend, IconChevronLeft, IconChevronRight, IconPlus, IconCheck, IconX,
  IconAlert, IconShield, IconBookmark, IconEye, IconStudy,
} from "./Icons";

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
  /** Continuity conflicts reported against this reply, if any are unresolved. */
  continuityReports?: ContinuityReport[];
  /** Knowledge this reply's speaker had no way of having, if any is unresolved. */
  sightlineLeaks?: SightlineLeak[];
  /** Who spoke — named in the leak notice, since the point is whose knowledge it is. */
  leakSpeaker?: string;
  /** Places this reply was not the character who wrote it, if any is unresolved. */
  studyDrift?: StudyDrift[];
  /** Who spoke — named in the drift notice, since the point is whose voice it is. */
  driftSpeaker?: string;
  theme: Theme;
  onResolveContinuity?: (action: "reroll" | "accept" | "dismiss") => void;
  onResolveSightline?: (action: "reroll" | "accept" | "dismiss") => void;
  onResolveStudyDrift?: (action: "reroll" | "accept" | "dismiss") => void;
  onEdit: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onRewind: (index: number) => void;
  onResend: () => void;
  onSwipe: (index: number, direction: "left" | "right") => void;
  onPlay: (text: string, index: number) => void;
  onToggleBookmark: (index: number) => void;
  onEditingTextChange: (text: string) => void;
}

/** Round character portrait; falls back to the name's initial on a tinted disc. */
export function Avatar({
  image, name, isUser, theme, size = 34,
}: {
  image: string | null; name: string; isUser: boolean; theme: Theme; size?: number;
}) {
  const tint = isUser ? theme.colors.primary : theme.colors.secondary;
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size * 0.32,
      background: image ? theme.colors.surfaceElevated : `color-mix(in srgb, ${tint} 16%, transparent)`,
      color: tint,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.44,
      fontWeight: 600,
      flexShrink: 0,
      overflow: "hidden",
      border: `1px solid ${theme.colors.border}`,
      boxShadow: theme.colors.shadowSm,
    }}>
      {image ? (
        <img src={image} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (name || "?").trim().charAt(0).toUpperCase() || "?"
      )}
    </div>
  );
}

/** "2.1s · 38 tok/s" — the reply's generation stats, if the backend sent them. */
function genStats(message: Message): string {
  if (!message.genMs) return "";
  const secs = message.genMs / 1000;
  let out = `${secs.toFixed(1)}s`;
  if (message.genTokens && secs > 0.2) {
    out += ` · ${Math.round(message.genTokens / secs)} tok/s`;
  }
  return out;
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
  continuityReports,
  sightlineLeaks,
  studyDrift,
  driftSpeaker,
  leakSpeaker,
  theme,
  onResolveContinuity,
  onResolveSightline,
  onResolveStudyDrift,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRewind,
  onResend,
  onSwipe,
  onPlay,
  onToggleBookmark,
  onEditingTextChange
}: MessageItemProps) {
  const isEditing = editingMessage?.index === index;
  const isUser = message.role === "user";

  // Narrator beats render as an omniscient interlude — centered, set in the
  // story face, framed by hairlines — like stage direction in a printed play.
  if (message.narrator && !isEditing) {
    return (
      <div className="msg-row fade-up" style={{ margin: immersive ? "26px auto" : "20px auto", maxWidth: immersive ? 760 : 620, textAlign: "center" }}>
        <div style={{
          fontFamily: theme.fonts.prose,
          fontStyle: "italic",
          fontSize: immersive ? 15 : 13.5,
          lineHeight: 1.75,
          color: theme.colors.textSecondary,
          padding: immersive ? "12px 20px" : "10px 16px",
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
        <div className="message-action-row" style={{ justifyContent: "center" }}>
          <button
            className="icon-btn sm msg-bookmark"
            data-active={message.bookmarked === true}
            aria-pressed={message.bookmarked === true}
            onClick={() => onToggleBookmark(index)}
            title={message.bookmarked ? "Remove bookmark" : "Bookmark this moment"}
            aria-label={message.bookmarked ? "Remove bookmark from this narration" : "Bookmark this narration"}
          >
            <IconBookmark size={13} />
          </button>
          <button
            className="btn btn-quiet message-action-button"
            onClick={() => onEdit(index)}
            title="Edit narration"
          >
            <IconPencil size={12} /> Edit
          </button>
          {index < conversationLength - 1 && (
            <button
              className="btn btn-quiet message-action-button"
              onClick={() => onRewind(index)}
              title="Remove everything after this narration"
            >
              <IconRewind size={12} />
            </button>
          )}
          <button
            className="btn btn-quiet message-action-button danger"
            onClick={() => onDelete(index)}
            title="Remove narration"
          >
            <IconTrash size={12} /> Remove
          </button>
        </div>
      </div>
    );
  }

  const characterImage = isUser
    ? userCharacterImage
    : (message.characterImage || assistantCharacterImage);
  // In group scenes, an assistant reply is attributed to the speaker that authored it.
  const displayName = isUser ? userName : (message.speaker || assistantName);

  // Response swipes: alternative generations for the latest assistant message.
  const swipes = message.swipes ?? [message.content];
  const swipeIndex = message.swipeIndex ?? swipes.length - 1;
  const showSwipes = message.role === "assistant" && isLast;
  const stats = message.role === "assistant" ? genStats(message) : "";
  // A continuity conflict is shown against the reply that caused it, while that
  // reply is still the last thing said and cheap to take back.
  const flagged = (continuityReports?.length ?? 0) > 0;
  const leaked = (sightlineLeaks?.length ?? 0) > 0;
  const drifted = (studyDrift?.length ?? 0) > 0;

  return (
    <div
      className="msg-row fade-up"
      style={{
        marginBottom: immersive ? 20 : 16,
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
      }}
    >
      <Avatar image={characterImage} name={displayName} isUser={isUser} theme={theme} />

      {/* Message Content */}
      <div style={{
        maxWidth: immersive ? "82%" : "72%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}>
        {/* Name · mood · time · stats */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexDirection: isUser ? "row-reverse" : "row",
          padding: "0 2px",
        }}>
          <span style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: isUser ? theme.colors.primary : theme.colors.secondary,
            letterSpacing: 0.1,
          }}>
            {displayName}
          </span>
          {message.role === "assistant" && message.mood && (
            <span title={`Mood: ${message.mood}`} style={{ fontSize: 13, lineHeight: 1 }}>
              {moodToEmoji(message.mood)}
            </span>
          )}
          {message.role === "assistant" && message.unprompted && (
            <span
              className="label-caps"
              title={`${displayName} spoke first — nobody had said anything`}
              style={{ color: theme.colors.textTertiary, letterSpacing: 0.4 }}
            >
              spoke first
            </span>
          )}
          <span className="meta-mono">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {stats && <span className="meta-mono" title="Generation time · speed">{stats}</span>}
        </div>

        {/* Message Bubble */}
        {isEditing ? (
          <div>
            <textarea
              className="input"
              value={editingMessage.text}
              onChange={(e) => onEditingTextChange(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                minHeight: 90,
                fontSize: 13.5,
                lineHeight: 1.55,
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={() => onSaveEdit(index)}>
                <IconCheck size={14} /> Save
              </button>
              <button className="btn btn-ghost" onClick={onCancelEdit}>
                <IconX size={14} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              padding: immersive ? "14px 18px" : "11px 15px",
              borderRadius: 14,
              ...(isUser ? { borderTopRightRadius: 5 } : { borderTopLeftRadius: 5 }),
              background: isUser ? theme.colors.userBubble : theme.colors.assistantBubble,
              color: theme.colors.textPrimary,
              // The story speaks in the book face; you speak in the console face.
              fontFamily: message.role === "assistant" || immersive ? theme.fonts.prose : theme.fonts.ui,
              fontSize: message.role === "assistant" ? (immersive ? 15.5 : 14.5) : (immersive ? 15 : 13.5),
              lineHeight: message.role === "assistant" ? 1.7 : 1.55,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              border: `1px solid ${isUser ? "color-mix(in srgb, " + theme.colors.primary + " 26%, transparent)" : theme.colors.border}`,
              boxShadow: theme.colors.shadowSm,
              // Tint the assistant bubble's edge with the mood it was delivered in
              ...(message.role === "assistant" && message.mood
                ? { borderLeft: `2px solid ${moodToColor(message.mood)}` }
                : {}),
              // …unless the guard has something to say about it, which outranks mood.
              ...(flagged ? { borderLeft: `2px solid ${theme.colors.warning}` } : {})
            }}>
              {/* Display user-attached image at the top if present */}
              {isUser && message.image && (
                <div style={{ marginBottom: message.content ? 10 : 0 }}>
                  <img
                    src={message.image}
                    alt="Attached"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 300,
                      borderRadius: 9,
                      display: "block"
                    }}
                  />
                </div>
              )}

              {message.role === "assistant" && formattingEnabled ? (
                <FormattedText text={message.content} theme={theme} />
              ) : (
                message.content
              )}

              {/* Display AI-generated image if present (for assistant messages) */}
              {message.role === "assistant" && message.image && (
                <div style={{ marginTop: 10 }}>
                  <img
                    src={`data:image/png;base64,${message.image}`}
                    alt={message.imagePrompt || "Generated image"}
                    style={{
                      maxWidth: "100%",
                      borderRadius: 9,
                      boxShadow: theme.colors.shadowMd,
                      display: "block"
                    }}
                  />
                  {message.imagePrompt && (
                    <div style={{
                      marginTop: 6,
                      fontSize: 11.5,
                      fontFamily: theme.fonts.ui,
                      color: theme.colors.textTertiary,
                      fontStyle: "italic"
                    }}>
                      {message.imagePrompt}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Continuity Guard — the story just contradicted itself, and this is
                the moment it is cheapest to fix. Nothing has been changed yet;
                all three ways out are the reader's to choose. */}
            {flagged && (
              <div className="fade-up" style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 11,
                background: `color-mix(in srgb, ${theme.colors.warning} 9%, ${theme.colors.surface})`,
                border: `1px solid color-mix(in srgb, ${theme.colors.warning} 40%, transparent)`,
                fontFamily: theme.fonts.ui,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <IconAlert size={13} style={{ color: theme.colors.warning }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary }}>
                    {continuityReports!.length === 1
                      ? "This breaks something the story established"
                      : `This breaks ${continuityReports!.length} things the story established`}
                  </span>
                </div>

                {continuityReports!.map((report) => (
                  <div key={report.fact_id} style={{ marginBottom: 7, fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ color: theme.colors.textSecondary }}>
                      <span style={{ color: theme.colors.textTertiary }}>Canon: </span>
                      {report.fact}
                    </div>
                    {report.quote && (
                      <div style={{
                        color: theme.colors.textSecondary,
                        fontFamily: theme.fonts.prose,
                        fontStyle: "italic",
                      }}>
                        <span style={{ color: theme.colors.textTertiary, fontStyle: "normal", fontFamily: theme.fonts.ui }}>
                          This reply:{" "}
                        </span>
                        “{report.quote}”
                      </div>
                    )}
                    <div style={{ color: theme.colors.textTertiary, fontSize: 11.5 }}>{report.why}</div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onResolveContinuity?.("reroll")}
                    title="Write this reply again, without the conflict"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconRefresh size={13} /> Write it again
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveContinuity?.("accept")}
                    title="Take the new version as true and update the canon"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconShield size={13} /> This is the truth now
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveContinuity?.("dismiss")}
                    title="Leave the story exactly as it is"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconX size={13} /> Leave it
                  </button>
                </div>
              </div>
            )}

            {/* Sightlines — this character just used something they were never
                told. Only the spoiler-free topic is named here: the reader may
                be one of the people being kept in the dark. */}
            {leaked && (
              <div className="fade-up" style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 11,
                background: `color-mix(in srgb, ${theme.colors.primary} 8%, ${theme.colors.surface})`,
                border: `1px solid color-mix(in srgb, ${theme.colors.primary} 38%, transparent)`,
                fontFamily: theme.fonts.ui,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <IconEye size={13} style={{ color: theme.colors.primary }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary }}>
                    {sightlineLeaks!.length === 1
                      ? `${leakSpeaker || "This character"} used something they were never told`
                      : `${leakSpeaker || "This character"} used ${sightlineLeaks!.length} things they were never told`}
                  </span>
                </div>

                {sightlineLeaks!.map((leak) => (
                  <div key={leak.entry_id} style={{ marginBottom: 7, fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ color: theme.colors.textSecondary }}>
                      <span style={{ color: theme.colors.textTertiary }}>Not theirs to know: </span>
                      {leak.topic}
                    </div>
                    {leak.quote && (
                      <div style={{
                        color: theme.colors.textSecondary,
                        fontFamily: theme.fonts.prose,
                        fontStyle: "italic",
                      }}>
                        <span style={{ color: theme.colors.textTertiary, fontStyle: "normal", fontFamily: theme.fonts.ui }}>
                          This reply:{" "}
                        </span>
                        “{leak.quote}”
                      </div>
                    )}
                    <div style={{ color: theme.colors.textTertiary, fontSize: 11.5 }}>{leak.why}</div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onResolveSightline?.("reroll")}
                    title="Write this reply again, without the knowledge they never had"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconRefresh size={13} /> Write it again
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveSightline?.("accept")}
                    title="Let them keep it — they know it from now on"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconEye size={13} /> They know it now
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveSightline?.("dismiss")}
                    title="Leave the story exactly as it is"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconX size={13} /> Leave it
                  </button>
                </div>
              </div>
            )}

            {/* Character Study — this reply was not the character who wrote it.
                Which is either a mistake or the moment they became someone else,
                and only the reader can say which, so both roads are offered. */}
            {drifted && (
              <div className="fade-up" style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 11,
                background: `color-mix(in srgb, ${theme.colors.secondary} 8%, ${theme.colors.surface})`,
                border: `1px solid color-mix(in srgb, ${theme.colors.secondary} 38%, transparent)`,
                fontFamily: theme.fonts.ui,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <IconStudy size={13} style={{ color: theme.colors.secondary }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary }}>
                    {studyDrift!.length === 1
                      ? `This does not sound like ${driftSpeaker || "this character"}`
                      : `This breaks ${studyDrift!.length} things ${driftSpeaker || "this character"} has been`}
                  </span>
                </div>

                {studyDrift!.map((report) => (
                  <div key={report.trait_id} style={{ marginBottom: 7, fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ color: theme.colors.textSecondary }}>
                      <span style={{ color: theme.colors.textTertiary }}>Established: </span>
                      {report.trait}
                    </div>
                    {report.quote && (
                      <div style={{
                        color: theme.colors.textSecondary,
                        fontFamily: theme.fonts.prose,
                        fontStyle: "italic",
                      }}>
                        <span style={{ color: theme.colors.textTertiary, fontStyle: "normal", fontFamily: theme.fonts.ui }}>
                          This reply:{" "}
                        </span>
                        “{report.quote}”
                      </div>
                    )}
                    <div style={{ color: theme.colors.textTertiary, fontSize: 11.5 }}>{report.why}</div>
                    {report.revised && (
                      <div style={{ color: theme.colors.textTertiary, fontSize: 11.5 }}>
                        Accepting this would make it: {report.revised}
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onResolveStudyDrift?.("reroll")}
                    title="Write this reply again, in their own voice"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconRefresh size={13} /> Write it again
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveStudyDrift?.("accept")}
                    title="They have changed — update their study to match this reply"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconStudy size={13} /> This is who they are now
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onResolveStudyDrift?.("dismiss")}
                    title="Leave the story and the study exactly as they are"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconX size={13} /> Leave it
                  </button>
                </div>
              </div>
            )}

            {/* Common message actions stay visible and one click away. */}
            <div
              className="message-action-row"
              style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}
            >
              {/* Swipe navigation — browse / generate alternative takes */}
              {showSwipes && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginRight: 6 }}>
                  <button
                    className="icon-btn sm"
                    onClick={() => onSwipe(index, "left")}
                    disabled={swipeIndex <= 0}
                    title="Previous take"
                  >
                    <IconChevronLeft size={14} />
                  </button>
                  <span className="meta-mono" style={{ minWidth: 30, textAlign: "center" }}>
                    {swipeIndex + 1}/{swipes.length}
                  </span>
                  <button
                    className="icon-btn sm"
                    onClick={() => onSwipe(index, "right")}
                    title={swipeIndex >= swipes.length - 1 ? "Write a new take" : "Next take"}
                  >
                    {swipeIndex >= swipes.length - 1 ? <IconPlus size={14} /> : <IconChevronRight size={14} />}
                  </button>
                </span>
              )}

              <button
                className="icon-btn sm msg-bookmark"
                data-active={message.bookmarked === true}
                aria-pressed={message.bookmarked === true}
                onClick={() => onToggleBookmark(index)}
                title={message.bookmarked ? "Remove bookmark" : "Bookmark this moment"}
                aria-label={message.bookmarked ? "Remove bookmark from this message" : "Bookmark this message"}
              >
                <IconBookmark size={13} />
              </button>

              {message.role === "assistant" && (
                <span className="msg-actions" style={{ display: "inline-flex" }}>
                  <button
                    className="icon-btn sm"
                    onClick={() => onPlay(message.content, index)}
                    title={playingMessageIndex === index ? "Stop audio" : "Read this aloud"}
                    data-active={playingMessageIndex === index}
                  >
                    {playingMessageIndex === index ? <IconStop size={13} /> : <IconVolume size={13} />}
                  </button>
                </span>
              )}

              <button
                className="btn btn-quiet message-action-button"
                onClick={() => onEdit(index)}
                title="Edit message"
              >
                <IconPencil size={12} />
              </button>
              {isUser && isLast && (
                <button
                  className="btn btn-quiet message-action-button"
                  onClick={onResend}
                  title="Send this message again"
                >
                  <IconSend size={12} />
                </button>
              )}
              {index < conversationLength - 1 && (
                <button
                  className="btn btn-quiet message-action-button"
                  onClick={() => onRewind(index)}
                  title="Remove everything after this message"
                >
                  <IconRewind size={12} />
                </button>
              )}
              <button
                className="btn btn-quiet message-action-button danger"
                onClick={() => onDelete(index)}
                title="Remove message"
              >
                <IconTrash size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
