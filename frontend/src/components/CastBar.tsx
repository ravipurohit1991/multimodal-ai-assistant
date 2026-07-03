import { Character } from "../types";
import { Theme } from "../theme";
import { IconUsers, IconShuffle } from "./Icons";

interface CastBarProps {
  inScene: Character[];
  selectedId: string;
  isGroupScene: boolean;
  connected: boolean;
  userName: string;
  userAvatar: string | null;
  /** Auto-cast: the model directs who speaks next in group scenes. */
  autoCast: boolean;
  theme: Theme;
  /** Choose which cast member speaks next (also loads them for editing). */
  onSelectSpeaker: (id: string) => void;
  onToggleAutoCast: (enabled: boolean) => void;
  onOpenManager: () => void;
}

function CastAvatar({
  image, name, tint, theme,
}: { image: string | null; name: string; tint: string; theme: Theme }) {
  return (
    <span
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        color: tint,
        background: image ? theme.colors.surfaceElevated : `color-mix(in srgb, ${tint} 16%, transparent)`,
        flexShrink: 0,
      }}
    >
      {image ? (
        <img src={image} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (name || "?").trim().charAt(0).toUpperCase() || "?"
      )}
    </span>
  );
}

/**
 * Cast bar — who is in the scene and, in a group scene, who speaks next.
 * The highlighted chip is the selected speaker; clicking another chip hands
 * them the next line. "Auto" lets the model direct turn-taking itself.
 */
export function CastBar({
  inScene,
  selectedId,
  isGroupScene,
  connected,
  userName,
  userAvatar,
  autoCast,
  theme,
  onSelectSpeaker,
  onToggleAutoCast,
  onOpenManager,
}: CastBarProps) {
  return (
    <div
      style={{
        padding: "7px 20px",
        borderTop: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span className="label-caps">
        {isGroupScene ? "Who speaks next" : "Cast"}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {/* You — always present, never a speaker */}
        <button
          className="chip"
          onClick={onOpenManager}
          title="You — edit your name, avatar & persona"
          style={{ padding: "3px 12px 3px 4px" }}
        >
          <CastAvatar image={userAvatar} name={userName || "You"} tint={theme.colors.primary} theme={theme} />
          {userName || "You"}
          <span style={{ fontSize: 9.5, fontWeight: 700, color: theme.colors.primary, letterSpacing: "0.06em" }}>YOU</span>
        </button>

        {inScene.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              className="chip"
              data-active={active && (isGroupScene ? !autoCast : false)}
              onClick={() => onSelectSpeaker(c.id)}
              title={isGroupScene ? (autoCast ? `${c.name} (auto-cast decides who actually speaks)` : `${c.name} speaks next`) : c.name}
              style={{ padding: "3px 12px 3px 4px", opacity: isGroupScene && autoCast && !active ? 0.85 : 1 }}
            >
              <CastAvatar image={c.avatar} name={c.name} tint={theme.colors.secondary} theme={theme} />
              {c.name || "Unnamed"}
            </button>
          );
        })}

        {/* Auto-cast — hand turn-taking to the model (group scenes only) */}
        {isGroupScene && (
          <button
            className="chip"
            data-active={autoCast}
            disabled={!connected}
            onClick={() => onToggleAutoCast(!autoCast)}
            title="Auto-cast: after each of your messages, the model picks which character naturally answers"
          >
            <IconShuffle size={13} />
            Auto
          </button>
        )}
      </div>

      <button
        className="btn btn-ghost"
        onClick={onOpenManager}
        title="Manage characters & cast"
        style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12.5 }}
      >
        <IconUsers size={14} />
        Cast &amp; characters
      </button>
    </div>
  );
}
