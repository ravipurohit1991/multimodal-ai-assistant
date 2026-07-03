import { Theme } from "../theme";
import { FormattedText } from "./FormattedText";
import { moodToColor } from "../mood";
import { Avatar } from "./MessageItem";

interface StreamingBubbleProps {
  assistantName: string;
  assistantCharacterImage: string | null;
  text: string;
  mood: string;
  formattingEnabled: boolean;
  immersive?: boolean;
  theme: Theme;
}

/**
 * The live, in-conversation rendering of the assistant's reply as it streams
 * in — typing dots before the first token, then prose with a blinking caret,
 * so the character feels present and writing in the moment.
 */
export function StreamingBubble({
  assistantName,
  assistantCharacterImage,
  text,
  mood,
  formattingEnabled,
  immersive = false,
  theme,
}: StreamingBubbleProps) {
  const accent = mood ? moodToColor(mood) : theme.colors.secondary;

  return (
    <div className="fade-up" style={{ marginBottom: 16, display: "flex", flexDirection: "row", gap: 10 }}>
      <Avatar image={assistantCharacterImage} name={assistantName} isUser={false} theme={theme} />

      <div style={{ maxWidth: immersive ? "82%" : "72%", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: theme.colors.secondary }}>
            {assistantName}
          </span>
          <span className="meta-mono" style={{ fontStyle: "italic" }}>writing…</span>
        </div>

        <div style={{
          padding: immersive ? "14px 18px" : "11px 15px",
          borderRadius: 14,
          borderTopLeftRadius: 5,
          background: theme.colors.assistantBubble,
          color: theme.colors.textPrimary,
          fontFamily: theme.fonts.prose,
          fontSize: immersive ? 15.5 : 14.5,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          boxShadow: theme.colors.shadowSm,
          border: `1px solid ${theme.colors.border}`,
          borderLeft: `2px solid ${accent}`,
          minHeight: 20
        }}>
          {text ? (
            <>
              {formattingEnabled ? (
                <FormattedText text={text} theme={theme} />
              ) : (
                text
              )}
              <span style={{
                display: "inline-block",
                width: 7,
                height: 15,
                marginLeft: 3,
                background: accent,
                borderRadius: 1,
                verticalAlign: "text-bottom",
                animation: "rp-caret-blink 1s steps(1) infinite"
              }} />
            </>
          ) : (
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 18 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: accent,
                  display: "inline-block",
                  animation: `rp-typing-bounce 1.2s ease-in-out ${i * 0.18}s infinite`
                }} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
