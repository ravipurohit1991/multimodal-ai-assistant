import { Character } from "../types";
import { Theme } from "../theme";
import { IconUsers, IconShuffle } from "./Icons";
import { ActionMenu, MenuAction, MenuSeparator } from "./ActionMenu";

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
      aria-hidden="true"
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
        <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
  const selectedCharacter = inScene.find((character) => character.id === selectedId);
  const triggerLabel = isGroupScene
    ? autoCast
      ? "Speaking next: Automatic"
      : selectedCharacter
        ? `Speaking next: ${selectedCharacter.name || "Unnamed"}`
        : "Choose who speaks next"
    : selectedCharacter
      ? `Cast: ${selectedCharacter.name || "Unnamed"}`
      : "Choose a character";
  const triggerIcon = isGroupScene && autoCast
    ? <IconShuffle size={15} />
    : selectedCharacter
      ? (
          <CastAvatar
            image={selectedCharacter.avatar}
            name={selectedCharacter.name}
            tint={theme.colors.secondary}
            theme={theme}
          />
        )
      : <IconUsers size={15} />;

  return (
    <div
      className="cast-bar"
      style={{
        padding: "7px 20px",
        borderTop: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span className="label-caps">
        {isGroupScene ? "Who speaks next" : "Cast"}
      </span>

      <ActionMenu
        label={triggerLabel}
        icon={triggerIcon}
        align="start"
        panelWidth={310}
        buttonClassName="btn btn-ghost toolbar-menu-trigger"
        rootClassName="cast-action-menu"
        title={triggerLabel}
      >
        {(closeMenu) => (
          <>
            <MenuAction
              closeMenu={closeMenu}
              icon={(
                <CastAvatar
                  image={userAvatar}
                  name={userName || "You"}
                  tint={theme.colors.primary}
                  theme={theme}
                />
              )}
              label="Your persona"
              description={userName || "You"}
              restoreFocusOnClose={false}
              onSelect={onOpenManager}
            />

            {isGroupScene && (
              <>
                <MenuSeparator />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconShuffle size={15} />}
                  label="Choose automatically"
                  description="Let the model pick who naturally answers"
                  active={autoCast}
                  disabled={!connected}
                  closeOnSelect={false}
                  onSelect={() => onToggleAutoCast(!autoCast)}
                />
              </>
            )}

            {inScene.length > 0 && (
              <>
                <MenuSeparator />
                {inScene.map((character) => (
                  <MenuAction
                    key={character.id}
                    closeMenu={closeMenu}
                    icon={(
                      <CastAvatar
                        image={character.avatar}
                        name={character.name}
                        tint={theme.colors.secondary}
                        theme={theme}
                      />
                    )}
                    label={character.name || "Unnamed"}
                    description={isGroupScene ? "Make this character speak next" : "Select this character"}
                    active={
                      character.id === selectedId
                      && (!isGroupScene || !autoCast)
                    }
                    onSelect={() => {
                      if (isGroupScene && autoCast) onToggleAutoCast(false);
                      onSelectSpeaker(character.id);
                    }}
                  />
                ))}
              </>
            )}

            <MenuSeparator />
            <MenuAction
              closeMenu={closeMenu}
              icon={<IconUsers size={15} />}
              label="Manage characters"
              description="Edit personas and the scene cast"
              restoreFocusOnClose={false}
              onSelect={onOpenManager}
            />
          </>
        )}
      </ActionMenu>

      <span
        className="cast-scene-count"
        style={{
          marginLeft: "auto",
          color: theme.colors.textTertiary,
          fontSize: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={`${inScene.length} ${inScene.length === 1 ? "character" : "characters"} in this scene`}
      >
        {inScene.length} in scene
      </span>
    </div>
  );
}
