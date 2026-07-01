import { Character } from "../types";
import { Theme } from "../theme";

interface CastBarProps {
  inScene: Character[];
  selectedId: string;
  isGroupScene: boolean;
  connected: boolean;
  userName: string;
  userAvatar: string | null;
  theme: Theme;
  /** Choose which cast member speaks next (also loads them for editing). */
  onSelectSpeaker: (id: string) => void;
  onOpenManager: () => void;
}

/**
 * Cast bar — shows who is in the scene and, in a group scene, lets you pick who
 * speaks next. The highlighted chip is the selected speaker; clicking another
 * chip hands them the next line. "Cast" opens the full character manager.
 */
export function CastBar({
  inScene,
  selectedId,
  isGroupScene,
  connected,
  userName,
  userAvatar,
  theme,
  onSelectSpeaker,
  onOpenManager,
}: CastBarProps) {
  return (
    <div
      style={{
        padding: "8px 24px",
        borderTop: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: theme.colors.textTertiary,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {isGroupScene ? "Who speaks next" : "Cast"}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* You — always present, never a speaker */}
        <button
          onClick={onOpenManager}
          title="You — edit your name, avatar & persona in Cast & Characters"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "3px 12px 3px 3px",
            borderRadius: 999,
            border: `1px dashed ${theme.colors.info}`,
            background: `${theme.colors.info}12`,
            color: theme.colors.textPrimary,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              background: userAvatar ? "transparent" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              flexShrink: 0,
            }}
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "👤"
            )}
          </span>
          {userName || "You"}
          <span style={{ fontSize: 10, color: theme.colors.info, fontWeight: 700 }}>YOU</span>
        </button>

        {inScene.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelectSpeaker(c.id)}
              title={isGroupScene ? `${c.name} speaks next` : c.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "3px 12px 3px 3px",
                borderRadius: 999,
                border: `1px solid ${active ? theme.colors.secondary : theme.colors.border}`,
                background: active ? `${theme.colors.secondary}18` : theme.colors.surface,
                color: theme.colors.textPrimary,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                transition: "all 0.15s",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  background: c.avatar
                    ? "transparent"
                    : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  border: `2px solid ${active ? theme.colors.secondary : "transparent"}`,
                  flexShrink: 0,
                }}
              >
                {c.avatar ? (
                  <img src={c.avatar} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "🤖"
                )}
              </span>
              {c.name || "Unnamed"}
              {active && isGroupScene && (
                <span style={{ fontSize: 11, color: theme.colors.secondary }}>🎙️</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenManager}
        title="Manage characters & cast"
        style={{
          marginLeft: "auto",
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          borderRadius: 8,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          color: theme.colors.textPrimary,
          cursor: "pointer",
          opacity: connected ? 1 : 0.85,
          whiteSpace: "nowrap",
        }}
      >
        🎭 Cast &amp; Characters
      </button>
    </div>
  );
}
