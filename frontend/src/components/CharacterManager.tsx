import React, { useRef, useState } from "react";
import { Character } from "../types";
import { Theme } from "../theme";
import { IconX, IconUsers, IconPlus, IconUpload, IconCopy, IconMessage, IconTrash } from "./Icons";

interface CharacterManagerProps {
  show: boolean;
  characters: Character[];
  selectedId: string;
  connected: boolean;
  theme: Theme;
  // Editable fields of the currently selected character (the editing buffer).
  name: string;
  description: string;
  personality: string;
  systemPrompt: string;
  firstMessage: string;
  avatar: string | null;
  // The user ("you") — part of the cast, but never voiced by the AI.
  userName: string;
  userPersona: string;
  userAvatar: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleInScene: (id: string) => void;
  onGreet: (id: string) => void;
  onImportCard: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPersonalityChange: (v: string) => void;
  onSystemPromptChange: (v: string) => void;
  onFirstMessageChange: (v: string) => void;
  onAvatarChange: (dataUrl: string | null) => void;
  onUserNameChange: (v: string) => void;
  onUserPersonaChange: (v: string) => void;
  onUserAvatarChange: (dataUrl: string | null) => void;
}

function PortraitDisc({
  image, label, tint, theme, size = 84,
}: { image: string | null; label: string; tint: string; theme: Theme; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        fontFamily: "inherit",
        color: tint,
        background: image ? theme.colors.surfaceElevated : `color-mix(in srgb, ${tint} 15%, transparent)`,
        border: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
      }}
    >
      {image ? (
        <img src={image} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (label || "?").trim().charAt(0).toUpperCase() || "?"
      )}
    </div>
  );
}

/**
 * Character Manager — the roster and per-character editor.
 *
 * Left: every character in the roster; toggle who is "in scene" to build the
 * cast, switch which one you're editing, add / duplicate / delete. Right: the
 * selected character's full sheet — name, avatar, description, personality, an
 * optional per-character system instruction, and a first message you can drop
 * into the chat. Editing here writes straight to the active character.
 */
export function CharacterManager({
  show,
  characters,
  selectedId,
  connected,
  theme,
  name,
  description,
  personality,
  systemPrompt,
  firstMessage,
  avatar,
  userName,
  userPersona,
  userAvatar,
  onClose,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onToggleInScene,
  onGreet,
  onImportCard,
  onNameChange,
  onDescriptionChange,
  onPersonalityChange,
  onSystemPromptChange,
  onFirstMessageChange,
  onAvatarChange,
  onUserNameChange,
  onUserPersonaChange,
  onUserAvatarChange,
}: CharacterManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  // Whether the right pane is editing "you" (the user) rather than a cast character.
  const [editingUser, setEditingUser] = useState(false);
  if (!show) return null;

  const inSceneCount = characters.filter((c) => c.inScene).length;

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 4,
    fontWeight: 600,
    fontSize: 12.5,
    color: theme.colors.textPrimary,
  };
  const hint: React.CSSProperties = { fontWeight: 400, color: theme.colors.textTertiary };

  const readAvatar = (e: React.ChangeEvent<HTMLInputElement>, apply: (dataUrl: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => apply(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => readAvatar(e, onAvatarChange);
  const handleUserAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => readAvatar(e, onUserAvatarChange);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(920px, 94vw)", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <IconUsers size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Cast &amp; characters</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              {characters.length} in the roster · {inSceneCount} in scene
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          {/* Roster list */}
          <div
            style={{
              width: 250,
              borderRight: `1px solid ${theme.colors.border}`,
              overflowY: "auto",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: theme.colors.surface,
              flexShrink: 0,
            }}
          >
            {/* You — the user, pinned at the top of the cast */}
            <div
              onClick={() => setEditingUser(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 8,
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${editingUser ? theme.colors.primary : "transparent"}`,
                background: editingUser ? theme.colors.primaryLight : "transparent",
              }}
            >
              <PortraitDisc image={userAvatar} label={userName || "You"} tint={theme.colors.primary} theme={theme} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.colors.textPrimary }}>
                  {userName || "You"}
                </div>
                <div style={{ fontSize: 10.5, color: theme.colors.primary, fontWeight: 600 }}>You · always present</div>
              </div>
            </div>
            <div style={{ height: 1, background: theme.colors.borderLight, margin: "4px 0" }} />

            {characters.map((c) => {
              const active = !editingUser && c.id === selectedId;
              return (
                <div
                  key={c.id}
                  onClick={() => { setEditingUser(false); onSelect(c.id); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 8,
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `1px solid ${active ? theme.colors.secondary : "transparent"}`,
                    background: active ? `color-mix(in srgb, ${theme.colors.secondary} 10%, transparent)` : "transparent",
                  }}
                >
                  <PortraitDisc image={c.avatar} label={c.name} tint={theme.colors.secondary} theme={theme} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.colors.textPrimary }}>
                      {c.name || "Unnamed"}
                    </div>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.colors.textTertiary, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={c.inScene}
                        onChange={() => onToggleInScene(c.id)}
                      />
                      In scene
                    </label>
                  </div>
                </div>
              );
            })}
            <button
              className="btn btn-ghost"
              onClick={() => { setEditingUser(false); onAdd(); }}
              style={{ marginTop: 6, borderStyle: "dashed", justifyContent: "flex-start" }}
            >
              <IconPlus size={14} /> Add character
            </button>
            <input ref={cardInputRef} type="file" accept=".json" onChange={onImportCard} style={{ display: "none" }} />
            <button
              className="btn btn-ghost"
              onClick={() => cardInputRef.current?.click()}
              title="Import a SillyTavern-compatible character card as a new character"
              style={{ borderStyle: "dashed", justifyContent: "flex-start" }}
            >
              <IconUpload size={14} /> Import card
            </button>
          </div>

          {/* Right editor — the user ("you"), or the selected cast character */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {editingUser ? (
              <div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ textAlign: "center" }}>
                    <PortraitDisc image={userAvatar} label={userName || "You"} tint={theme.colors.primary} theme={theme} />
                    <input ref={userAvatarInputRef} type="file" accept="image/*" onChange={handleUserAvatarUpload} style={{ display: "none" }} />
                    <div style={{ marginTop: 6, display: "flex", gap: 4, justifyContent: "center" }}>
                      <button className="btn btn-quiet" onClick={() => userAvatarInputRef.current?.click()} style={{ padding: "3px 9px", fontSize: 11 }}>
                        Upload
                      </button>
                      {userAvatar && (
                        <button className="btn btn-quiet" onClick={() => onUserAvatarChange(null)} style={{ padding: "3px 9px", fontSize: 11 }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Your name</label>
                    <input type="text" className="input" value={userName} onChange={(e) => onUserNameChange(e.target.value)} style={{ width: "100%" }} />
                    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: theme.colors.textTertiary }}>
                      This is you. You're always in the scene, and the AI never speaks as you — use
                      <em> Write for me</em> to have it draft a line you can edit.
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Your persona <span style={hint}>(optional)</span>
                  </label>
                  <textarea className="input" value={userPersona} onChange={(e) => onUserPersonaChange(e.target.value)} rows={4} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Who are you in this story? Appearance, background, how the characters see you… Injected into the scene so characters know who they're talking to." />
                </div>
              </div>
            ) : (
            <>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{ textAlign: "center" }}>
                <PortraitDisc image={avatar} label={name} tint={theme.colors.secondary} theme={theme} />
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
                <div style={{ marginTop: 6, display: "flex", gap: 4, justifyContent: "center" }}>
                  <button className="btn btn-quiet" onClick={() => fileInputRef.current?.click()} style={{ padding: "3px 9px", fontSize: 11 }}>
                    Upload
                  </button>
                  {avatar && (
                    <button className="btn btn-quiet" onClick={() => onAvatarChange(null)} style={{ padding: "3px 9px", fontSize: 11 }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Name + actions */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Name</label>
                <input type="text" className="input" value={name} onChange={(e) => onNameChange(e.target.value)} style={{ width: "100%" }} />
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-quiet" onClick={() => onDuplicate(selectedId)} style={{ padding: "5px 10px", fontSize: 12 }}>
                    <IconCopy size={13} /> Duplicate
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => onGreet(selectedId)}
                    disabled={!connected || !firstMessage.trim()}
                    title={firstMessage.trim() ? "Post this character's first message into the chat" : "Set a first message below to enable"}
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconMessage size={13} /> Use first message
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => onDelete(selectedId)}
                    disabled={characters.length <= 1}
                    title={characters.length <= 1 ? "Keep at least one character" : "Delete this character"}
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <IconTrash size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Description / definition</label>
              <textarea className="input" value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={4} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Who is this character — appearance, background, traits, how they speak…" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Personality</label>
              <textarea className="input" value={personality} onChange={(e) => onPersonalityChange(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Core personality traits…" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                System instruction <span style={hint}>(per-character, optional — overrides the global one)</span>
              </label>
              <textarea className="input" value={systemPrompt} onChange={(e) => onSystemPromptChange(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Leave blank to use the global system prompt. Set this to give this character their own base instructions." />
            </div>

            <div>
              <label style={labelStyle}>First message</label>
              <textarea className="input" value={firstMessage} onChange={(e) => onFirstMessageChange(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="An opening line this character can greet with (use the button above to post it)." />
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
