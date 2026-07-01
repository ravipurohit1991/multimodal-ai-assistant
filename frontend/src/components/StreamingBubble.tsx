import { Theme } from "../theme";
import { FormattedText } from "./FormattedText";
import { moodToColor } from "../mood";

// Book-like serif stack used in cinematic reading mode (mirrors MessageItem).
const SERIF_STACK =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif";

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
 * in — with an animated "typing" indicator before the first token. This makes
 * the exchange feel like the character is actually responding in the moment.
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
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "row", gap: 12 }}>
      {/* Keyframes for the typing dots + caret (injected once, scoped by name) */}
      <style>{`
        @keyframes rp-typing-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }
        @keyframes rp-caret-blink { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
      `}</style>

      {/* Avatar */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: assistantCharacterImage ? "transparent" : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        flexShrink: 0,
        overflow: "hidden",
        border: `2px solid ${accent}`
      }}>
        {assistantCharacterImage ? (
          <img src={assistantCharacterImage} alt={assistantName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          "🤖"
        )}
      </div>

      <div style={{ maxWidth: immersive ? "82%" : "70%", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.colors.textPrimary }}>{assistantName}</span>
          <span style={{ fontSize: 11, color: theme.colors.textTertiary, fontStyle: "italic" }}>typing…</span>
        </div>

        <div style={{
          padding: immersive ? "14px 18px" : "12px 16px",
          borderRadius: 12,
          background: "white",
          color: "#2d3748",
          fontFamily: immersive ? SERIF_STACK : "inherit",
          fontSize: immersive ? 15.5 : 14,
          lineHeight: immersive ? 1.75 : 1.5,
          whiteSpace: "pre-wrap",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e1e8ed",
          borderLeft: `3px solid ${accent}`,
          minHeight: 20
        }}>
          {text ? (
            <>
              {formattingEnabled ? (
                <FormattedText text={text} theme={theme} dialogueColor="#4c51bf" actionColor="#6b7280" />
              ) : (
                text
              )}
              <span style={{
                display: "inline-block",
                width: 7,
                height: 15,
                marginLeft: 2,
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
                  width: 7,
                  height: 7,
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
