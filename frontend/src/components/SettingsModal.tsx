import React from "react";
import { Theme } from "../theme";
import { IconX, IconSliders, IconCheck } from "./Icons";

interface SettingsModalProps {
  show: boolean;
  systemPrompt: string;
  scenario: string;
  authorNote: string;
  authorNoteDepth: number;
  includeMood: boolean;
  adultMode: boolean;
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onSystemPromptChange: (prompt: string) => void;
  onScenarioChange: (scenario: string) => void;
  onAuthorNoteChange: (note: string) => void;
  onAuthorNoteDepthChange: (depth: number) => void;
  onToggleMood: (enabled: boolean) => void;
  onToggleAdultMode: (enabled: boolean) => void;
  onUpdateSystemPrompt: () => void;
}

/**
 * Story & System — the *global* settings that apply to the whole scene,
 * regardless of which character is speaking: the base system prompt, the
 * scenario, the Author's Note, and the mood indicator. Per-character sheets
 * live in the Cast & Characters manager instead.
 */
export function SettingsModal({
  show,
  systemPrompt,
  scenario,
  authorNote,
  authorNoteDepth,
  includeMood,
  adultMode,
  theme,
  connected,
  onClose,
  onSystemPromptChange,
  onScenarioChange,
  onAuthorNoteChange,
  onAuthorNoteDepthChange,
  onToggleMood,
  onToggleAdultMode,
  onUpdateSystemPrompt
}: SettingsModalProps) {
  if (!show) return null;

  const helpTextStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.5,
    color: theme.colors.textTertiary,
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary }}>
      {children}
    </label>
  );

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: "92vw", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <IconSliders size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Story &amp; system</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              Scene-wide settings — characters live in Cast &amp; characters, below the conversation
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          <div>
            <Label>Global character prompt</Label>
            <div style={{ ...helpTextStyle, marginBottom: 6 }}>
              Creative roleplay instructions used for every character unless one has an override. The app's reply and safety contract is applied separately.
            </div>
            <textarea
              className="input"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={7}
              style={{ width: "100%", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
              placeholder="Creative instructions for the character…"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Label>Scenario</Label>
            <div style={{ ...helpTextStyle, marginBottom: 6 }}>
              The shared situation for the scene — applies to every character present.
            </div>
            <textarea
              className="input"
              value={scenario}
              onChange={(e) => onScenarioChange(e.target.value)}
              rows={3}
              style={{ width: "100%", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
              placeholder="Set the scene and context for the roleplay…"
            />
          </div>

          {/* Author's Note — persistent steering injected close to the latest turn */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${theme.colors.border}` }}>
            <Label>Author's note</Label>
            <div style={{ ...helpTextStyle, marginBottom: 6 }}>
              Out-of-character direction injected near the end of the chat to steer tone, pacing, or upcoming
              events. Strong influence — keep it short.
            </div>
            <textarea
              className="input"
              value={authorNote}
              onChange={(e) => onAuthorNoteChange(e.target.value)}
              rows={2}
              style={{ width: "100%", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
              placeholder="e.g. Keep responses tense and suspenseful. A storm is approaching."
            />
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>Inject</span>
              <input
                type="number"
                className="input"
                min={0}
                max={10}
                value={authorNoteDepth}
                onChange={(e) => onAuthorNoteDepthChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                style={{ width: 62, fontSize: 12.5, padding: "5px 8px" }}
              />
              <span style={helpTextStyle}>messages from the latest (lower = stronger)</span>
            </div>
          </div>

          {/* Mood indicator toggle */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: theme.colors.textPrimary }}>
              <input
                type="checkbox"
                checked={includeMood}
                onChange={(e) => onToggleMood(e.target.checked)}
              />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Mood indicator</span>
            </label>
            <div style={{ ...helpTextStyle, marginTop: 4, marginLeft: 24 }}>
              The character reports its emotional state each reply, shown as a live badge and
              coloring the stage light.
            </div>
          </div>

          {/* Adult mode — opt-in explicit content for the whole scene. Kept as a
              deliberate button rather than a checkbox so it never gets flipped
              by accident, and applied immediately without needing Apply. */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${theme.colors.border}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Label>Adult mode (18+)</Label>
                <div style={helpTextStyle}>
                  Lets characters write unfiltered.
                </div>
              </div>
              <button
                className="btn"
                onClick={() => onToggleAdultMode(!adultMode)}
                disabled={!connected}
                aria-pressed={adultMode}
                title={adultMode ? "Turn adult mode off" : "Turn adult mode on for this scene"}
                style={{
                  flexShrink: 0,
                  minWidth: 96,
                  justifyContent: "center",
                  fontWeight: 600,
                  border: `1px solid ${adultMode ? theme.colors.warning : theme.colors.border}`,
                  background: adultMode ? theme.colors.warningLight : "transparent",
                  color: adultMode ? theme.colors.warning : theme.colors.textSecondary,
                }}
              >
                {adultMode ? "On" : "Off"}
              </button>
            </div>
            {adultMode && (
              <div style={{ ...helpTextStyle, marginTop: 8, color: theme.colors.warning }}>
                Adult mode is active for this scene. Local models vary interms of respecting it.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${theme.colors.border}`,
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button
            className="btn btn-primary"
            onClick={onUpdateSystemPrompt}
            disabled={!connected}
            title="Apply the global story settings to the current scene"
          >
            <IconCheck size={14} /> Apply story settings
          </button>
        </div>
      </div>
    </div>
  );
}
