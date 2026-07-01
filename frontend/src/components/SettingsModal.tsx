import React from "react";
import { Theme } from "../theme";

interface SettingsModalProps {
  show: boolean;
  systemPrompt: string;
  scenario: string;
  authorNote: string;
  authorNoteDepth: number;
  includeMood: boolean;
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onSystemPromptChange: (prompt: string) => void;
  onScenarioChange: (scenario: string) => void;
  onAuthorNoteChange: (note: string) => void;
  onAuthorNoteDepthChange: (depth: number) => void;
  onToggleMood: (enabled: boolean) => void;
  onUpdateSystemPrompt: () => void;
}

/**
 * Story & System — the *global* settings that apply to the whole scene,
 * regardless of which character is speaking: the base system prompt, the
 * scenario, the Author's Note, and the mood indicator. Per-character sheets
 * (names, descriptions, personalities, avatars, per-character instructions)
 * live in the Cast & Characters manager instead.
 */
export function SettingsModal({
  show,
  systemPrompt,
  scenario,
  authorNote,
  authorNoteDepth,
  includeMood,
  theme,
  connected,
  onClose,
  onSystemPromptChange,
  onScenarioChange,
  onAuthorNoteChange,
  onAuthorNoteDepthChange,
  onToggleMood,
  onUpdateSystemPrompt
}: SettingsModalProps) {
  if (!show) return null;

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 4,
    fontWeight: "bold",
    color: theme.colors.textPrimary
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: 6,
    fontSize: 14,
    fontFamily: "inherit",
    color: theme.colors.textPrimary,
    background: theme.colors.background,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 4,
    boxSizing: "border-box"
  };

  const helpTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: theme.colors.textTertiary
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        background: theme.colors.surfaceElevated,
        color: theme.colors.textPrimary,
        borderRadius: 12,
        padding: 24,
        maxWidth: 720,
        width: "92%",
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: theme.colors.shadowLg,
        border: `1px solid ${theme.colors.border}`
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 24, color: theme.colors.textPrimary }}>📜 Story &amp; System</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: theme.colors.textTertiary
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          ...helpTextStyle,
          marginBottom: 18,
          padding: "8px 12px",
          background: theme.colors.primaryLight,
          borderRadius: 8,
        }}>
          These apply to the whole scene. Characters — names, descriptions, personalities,
          avatars, per-character instructions, and <em>you</em> — are managed in
          <strong> 🎭 Cast &amp; Characters</strong> (below the conversation).
        </div>

        <div>
          <label style={labelStyle}>Global System Prompt:</label>
          <div style={{ ...helpTextStyle, marginBottom: 6 }}>
            The base roleplay instructions used for every character, unless a character sets its own override.
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            rows={7}
            style={fieldStyle}
            placeholder="Base instructions for the AI..."
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Scenario:</label>
          <div style={{ ...helpTextStyle, marginBottom: 6 }}>
            The shared situation/setup for the scene — applies to every character present.
          </div>
          <textarea
            value={scenario}
            onChange={(e) => onScenarioChange(e.target.value)}
            rows={3}
            style={fieldStyle}
            placeholder="Set the scene and context for the roleplay..."
          />
        </div>

        {/* Author's Note — persistent steering injected close to the latest turn */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.colors.border}` }}>
          <label style={labelStyle}>✍️ Author's Note:</label>
          <div style={{ ...helpTextStyle, marginBottom: 6 }}>
            Out-of-character direction injected near the end of the chat to steer tone, pacing, or upcoming events.
            Strong influence — keep it short.
          </div>
          <textarea
            value={authorNote}
            onChange={(e) => onAuthorNoteChange(e.target.value)}
            rows={2}
            style={fieldStyle}
            placeholder="e.g. Keep responses tense and suspenseful. A storm is approaching."
          />
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: theme.colors.textSecondary }}>Inject depth:</label>
            <input
              type="number"
              min={0}
              max={10}
              value={authorNoteDepth}
              onChange={(e) => onAuthorNoteDepthChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              style={{ ...fieldStyle, width: 60 }}
            />
            <span style={helpTextStyle}>messages from the latest (lower = stronger)</span>
          </div>
        </div>

        {/* Mood indicator toggle */}
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: theme.colors.textPrimary }}>
            <input
              type="checkbox"
              checked={includeMood}
              onChange={(e) => onToggleMood(e.target.checked)}
            />
            <span style={{ fontWeight: "bold" }}>😊 Mood indicator</span>
          </label>
          <div style={{ ...helpTextStyle, marginTop: 4, marginLeft: 24 }}>
            Ask the character to report its emotional state each reply and show it as a live badge. Re-applies the
            prompt to take effect.
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={onUpdateSystemPrompt}
            disabled={!connected}
            title="Apply the global story settings to the current scene"
            style={{
              marginLeft: "auto",
              padding: "8px 16px",
              background: connected ? theme.colors.buttonPrimary : theme.colors.buttonDisabled,
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: connected ? "pointer" : "not-allowed"
            }}
          >
            📝 Apply story settings
          </button>
        </div>
      </div>
    </div>
  );
}
