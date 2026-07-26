import React, { useRef, useState } from "react";
import { Character, CharacterStudyState, RiggedCharacter, StudyTrait } from "../types";
import { CharacterStudyPanel } from "./CharacterStudyPanel";
import { type StudyDraft } from "../characterStudy";
import { Theme } from "../theme";
import { rigSummary } from "../rigs";
import { IconX, IconUsers, IconPlus, IconUpload, IconCopy, IconMessage, IconTrash, IconDice, IconSparkles, IconWand } from "./Icons";

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
  rigAssets: RiggedCharacter[];
  rigId: string | null;
  // The user ("you") — part of the cast, but never voiced by the AI.
  userName: string;
  userPersona: string;
  userAvatar: string | null;
  // Character Study — what the story has learned about this character, shown
  // beside the card the author wrote rather than folded into it.
  study: CharacterStudyState;
  studyBusy: boolean;
  cast: string[];
  // Inventing a character with the model, from a guiding line or from nothing.
  cardBusy: boolean;
  cardError: string | null;
  onGenerateCard: (guidance: string) => void;
  onStudyTraits: (traits: StudyTrait[]) => void;
  onAddStudyTrait: (draft: StudyDraft) => void;
  onStudyLock: (character: string, locked: boolean) => void;
  onStudySettings: (patch: Partial<CharacterStudyState>) => void;
  onStudyRefresh: (rebuild: boolean) => void;
  onStudyForget: () => void;
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
  onRigChange: (rigId: string | null) => void;
  onGenerateRig: () => void;
  onCreateRigFromAvatar: () => void;
  onRigImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  rigAssets,
  rigId,
  userName,
  userPersona,
  userAvatar,
  study,
  studyBusy,
  cast,
  cardBusy,
  cardError,
  onGenerateCard,
  onStudyTraits,
  onAddStudyTrait,
  onStudyLock,
  onStudySettings,
  onStudyRefresh,
  onStudyForget,
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
  onRigChange,
  onGenerateRig,
  onCreateRigFromAvatar,
  onRigImageUpload,
  onUserNameChange,
  onUserPersonaChange,
  onUserAvatarChange,
}: CharacterManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const rigImageInputRef = useRef<HTMLInputElement>(null);
  // Whether the right pane is editing "you" (the user) rather than a cast character.
  const [editingUser, setEditingUser] = useState(false);
  // The optional guiding line for an invented character. Empty is meaningful: it
  // means "surprise me", which is a first-class way to use this.
  const [guidance, setGuidance] = useState("");
  if (!show) return null;

  const inSceneCount = characters.filter((c) => c.inScene).length;
  const selectedRig = rigId ? rigAssets.find((r) => r.id === rigId) : null;

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

            {/* Invent one with the model. The guiding line is optional on purpose:
                left empty, the backend rolls the character's shape itself rather
                than asking the model to be "random", which it is not. */}
            <div
              style={{
                marginTop: 8,
                padding: 9,
                borderRadius: 10,
                border: `1px dashed ${theme.colors.border}`,
                background: theme.colors.surfaceElevated,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <IconWand size={13} style={{ color: theme.colors.secondary }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary }}>
                  Invent a character
                </span>
              </div>
              <textarea
                className="input"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !cardBusy && connected) {
                    onGenerateCard(guidance);
                  }
                }}
                rows={2}
                disabled={cardBusy}
                placeholder="A tired night nurse who used to sing professionally… (or leave blank and be surprised)"
                style={{ width: "100%", resize: "vertical", fontSize: 11.5, lineHeight: 1.45 }}
              />
              <button
                className="btn btn-quiet"
                onClick={() => onGenerateCard(guidance)}
                disabled={!connected || cardBusy}
                title={
                  guidance.trim()
                    ? "Write this character with the model"
                    : "Invent someone from nothing — the app rolls their shape, the model writes them"
                }
                style={{ marginTop: 6, width: "100%", justifyContent: "center", fontSize: 11.5, padding: "5px 9px" }}
              >
                {cardBusy ? (
                  <>
                    <IconSparkles size={13} className="spin" /> Inventing…
                  </>
                ) : guidance.trim() ? (
                  <>
                    <IconWand size={13} /> Write this character
                  </>
                ) : (
                  <>
                    <IconDice size={13} /> Surprise me
                  </>
                )}
              </button>
              {cardError && (
                <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.45, color: theme.colors.warning }}>
                  {cardError}
                </div>
              )}
            </div>
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
              <label style={labelStyle}>2D rig</label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                <select
                  className="input"
                  value={rigId ?? ""}
                  onChange={(e) => onRigChange(e.target.value || null)}
                  style={{ width: "100%" }}
                >
                  <option value="">Auto body</option>
                  {rigAssets.map((rig) => (
                    <option key={rig.id} value={rig.id}>
                      {rig.name}
                    </option>
                  ))}
                </select>
                {rigId && (
                  <button className="btn btn-quiet" onClick={() => onRigChange(null)} style={{ padding: "7px 10px", fontSize: 12 }}>
                    Remove
                  </button>
                )}
              </div>
              <input ref={rigImageInputRef} type="file" accept="image/*" onChange={onRigImageUpload} style={{ display: "none" }} />
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-quiet" onClick={onGenerateRig} style={{ padding: "5px 10px", fontSize: 12 }}>
                  <IconDice size={13} /> Generate
                </button>
                <button className="btn btn-quiet" onClick={() => rigImageInputRef.current?.click()} style={{ padding: "5px 10px", fontSize: 12 }}>
                  <IconUpload size={13} /> Upload picture
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={onCreateRigFromAvatar}
                  disabled={!avatar}
                  title={avatar ? "Create a rig using this avatar image" : "Upload an avatar first"}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  <IconSparkles size={13} /> From avatar
                </button>
                {selectedRig && (
                  <span className="meta-mono" style={{ marginLeft: "auto" }}>
                    {rigSummary(selectedRig)}
                  </span>
                )}
              </div>
            </div>

            {/* As written — the author's card. The study below never edits it. */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                Description / definition <span style={hint}>(as written — yours)</span>
              </label>
              <textarea className="input" value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={4} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Who is this character — appearance, background, traits, how they speak…" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Personality</label>
              <textarea className="input" value={personality} onChange={(e) => onPersonalityChange(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Core personality traits…" />
            </div>

            {/* As played — what the story has made of them since. */}
            <div style={{ marginBottom: 12 }}>
              <CharacterStudyPanel
                character={name}
                cast={cast}
                userName={userName}
                study={study}
                busy={studyBusy}
                connected={connected}
                theme={theme}
                onUpdateTraits={onStudyTraits}
                onAddTrait={onAddStudyTrait}
                onSetLock={onStudyLock}
                onSettings={onStudySettings}
                onRefresh={onStudyRefresh}
                onForget={onStudyForget}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                Character instruction <span style={hint}>(optional — overrides the global creative prompt)</span>
              </label>
              <textarea className="input" value={systemPrompt} onChange={(e) => onSystemPromptChange(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }} placeholder="Leave blank to use the global character prompt. Set this to give the character custom creative instructions." />
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
