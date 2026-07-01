import React, { useRef, useState } from "react";
import { Character } from "../types";
import { Theme } from "../theme";

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
    fontWeight: 700,
    fontSize: 13,
    color: theme.colors.textPrimary,
  };
  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: 8,
    fontSize: 14,
    fontFamily: "inherit",
    color: theme.colors.textPrimary,
    background: theme.colors.background,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 6,
    boxSizing: "border-box",
    resize: "vertical",
  };

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.surfaceElevated,
          color: theme.colors.textPrimary,
          borderRadius: 12,
          width: "min(920px, 94vw)",
          maxHeight: "90vh",
          overflow: "hidden",
          boxShadow: theme.colors.shadowLg,
          border: `1px solid ${theme.colors.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 22px",
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 20 }}>
            🎭 Cast &amp; Characters
            <span style={{ fontSize: 13, fontWeight: 500, color: theme.colors.textTertiary, marginLeft: 10 }}>
              {characters.length} total · {inSceneCount} in scene
            </span>
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.colors.textTertiary }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          {/* Roster list */}
          <div
            style={{
              width: 260,
              borderRight: `1px solid ${theme.colors.border}`,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: theme.colors.surface,
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
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${editingUser ? theme.colors.info : theme.colors.border}`,
                background: editingUser ? `${theme.colors.info}14` : "transparent",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  background: userAvatar ? "transparent" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                {userAvatar ? (
                  <img src={userAvatar} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "👤"
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName || "You"}
                </div>
                <div style={{ fontSize: 11, color: theme.colors.info, fontWeight: 600 }}>You · always present</div>
              </div>
            </div>
            <div style={{ height: 1, background: theme.colors.border, margin: "4px 0" }} />

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
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${active ? theme.colors.secondary : "transparent"}`,
                    background: active ? `${theme.colors.secondary}14` : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      background: c.avatar ? "transparent" : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                    }}
                  >
                    {c.avatar ? (
                      <img src={c.avatar} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      "🤖"
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              onClick={() => { setEditingUser(false); onAdd(); }}
              style={{
                marginTop: 4,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: `1px dashed ${theme.colors.border}`,
                background: "transparent",
                color: theme.colors.textSecondary,
                cursor: "pointer",
              }}
            >
              ＋ Add character
            </button>
            <input ref={cardInputRef} type="file" accept=".json" onChange={onImportCard} style={{ display: "none" }} />
            <button
              onClick={() => cardInputRef.current?.click()}
              title="Import a SillyTavern-compatible character card as a new character"
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: `1px dashed ${theme.colors.border}`,
                background: "transparent",
                color: theme.colors.textSecondary,
                cursor: "pointer",
              }}
            >
              📤 Import card
            </button>
          </div>

          {/* Right editor — the user ("you"), or the selected cast character */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {editingUser ? (
              <div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: "50%",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 34,
                        background: userAvatar ? "transparent" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        border: `2px solid ${theme.colors.border}`,
                      }}
                    >
                      {userAvatar ? (
                        <img src={userAvatar} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        "👤"
                      )}
                    </div>
                    <input ref={userAvatarInputRef} type="file" accept="image/*" onChange={handleUserAvatarUpload} style={{ display: "none" }} />
                    <div style={{ marginTop: 6, display: "flex", gap: 4, justifyContent: "center" }}>
                      <button
                        onClick={() => userAvatarInputRef.current?.click()}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: theme.colors.buttonSecondary, color: theme.colors.textPrimary, cursor: "pointer", fontWeight: 600 }}
                      >
                        Upload
                      </button>
                      {userAvatar && (
                        <button
                          onClick={() => onUserAvatarChange(null)}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: theme.colors.buttonSecondary, color: theme.colors.textPrimary, cursor: "pointer", fontWeight: 600 }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Your name</label>
                    <input type="text" value={userName} onChange={(e) => onUserNameChange(e.target.value)} style={fieldStyle as React.CSSProperties} />
                    <div style={{ marginTop: 8, fontSize: 12, color: theme.colors.info, fontWeight: 600 }}>
                      👤 This is you. You are always in the scene, and the AI never speaks as you (use “As Me” to have it draft a line for you).
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Your persona <span style={{ fontWeight: 400, color: theme.colors.textTertiary }}>(optional)</span>
                  </label>
                  <textarea value={userPersona} onChange={(e) => onUserPersonaChange(e.target.value)} rows={4} style={fieldStyle as React.CSSProperties} placeholder="Who are you in this story? Appearance, background, how the characters see you… Injected into the scene so characters know who they're talking to." />
                </div>
              </div>
            ) : (
            <>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 34,
                    background: avatar ? "transparent" : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                    border: `2px solid ${theme.colors.border}`,
                  }}
                >
                  {avatar ? (
                    <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    "🤖"
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
                <div style={{ marginTop: 6, display: "flex", gap: 4, justifyContent: "center" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: theme.colors.buttonSecondary, color: theme.colors.textPrimary, cursor: "pointer", fontWeight: 600 }}
                  >
                    Upload
                  </button>
                  {avatar && (
                    <button
                      onClick={() => onAvatarChange(null)}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: theme.colors.buttonSecondary, color: theme.colors.textPrimary, cursor: "pointer", fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Name + actions */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Name</label>
                <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)} style={fieldStyle as React.CSSProperties} />
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => onDuplicate(selectedId)}
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, color: theme.colors.textPrimary, cursor: "pointer", fontWeight: 600 }}
                  >
                    ⧉ Duplicate
                  </button>
                  <button
                    onClick={() => onGreet(selectedId)}
                    disabled={!connected || !firstMessage.trim()}
                    title={firstMessage.trim() ? "Post this character's first message into the chat" : "Set a first message below to enable"}
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, color: connected && firstMessage.trim() ? theme.colors.textPrimary : theme.colors.textTertiary, cursor: connected && firstMessage.trim() ? "pointer" : "not-allowed", fontWeight: 600 }}
                  >
                    💬 Use first message
                  </button>
                  <button
                    onClick={() => onDelete(selectedId)}
                    disabled={characters.length <= 1}
                    title={characters.length <= 1 ? "Keep at least one character" : "Delete this character"}
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "none", background: characters.length <= 1 ? theme.colors.buttonDisabled : theme.colors.error, color: "white", cursor: characters.length <= 1 ? "not-allowed" : "pointer", fontWeight: 600 }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Description / Definition</label>
              <textarea value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={4} style={fieldStyle as React.CSSProperties} placeholder="Who is this character — appearance, background, traits, how they speak…" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Personality</label>
              <textarea value={personality} onChange={(e) => onPersonalityChange(e.target.value)} rows={2} style={fieldStyle as React.CSSProperties} placeholder="Core personality traits…" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                System instruction <span style={{ fontWeight: 400, color: theme.colors.textTertiary }}>(per-character, optional — overrides the global one)</span>
              </label>
              <textarea value={systemPrompt} onChange={(e) => onSystemPromptChange(e.target.value)} rows={3} style={fieldStyle as React.CSSProperties} placeholder="Leave blank to use the global system prompt. Set this to give this character their own base instructions." />
            </div>

            <div>
              <label style={labelStyle}>First message</label>
              <textarea value={firstMessage} onChange={(e) => onFirstMessageChange(e.target.value)} rows={3} style={fieldStyle as React.CSSProperties} placeholder="An opening line this character can greet with (use the button above to post it)." />
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
