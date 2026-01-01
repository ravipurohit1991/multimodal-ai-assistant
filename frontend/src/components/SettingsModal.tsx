import React from "react";

interface SettingsModalProps {
  show: boolean;
  userName: string;
  assistantName: string;
  systemPrompt: string;
  scenario: string;
  characterDef: string;
  personality: string;
  connected: boolean;
  onClose: () => void;
  onUserNameChange: (name: string) => void;
  onAssistantNameChange: (name: string) => void;
  onSystemPromptChange: (prompt: string) => void;
  onScenarioChange: (scenario: string) => void;
  onCharacterDefChange: (def: string) => void;
  onPersonalityChange: (personality: string) => void;
  onCharacterUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdateSystemPrompt: () => void;
}

export function SettingsModal({
  show,
  userName,
  assistantName,
  systemPrompt,
  scenario,
  characterDef,
  personality,
  connected,
  onClose,
  onUserNameChange,
  onAssistantNameChange,
  onSystemPromptChange,
  onScenarioChange,
  onCharacterDefChange,
  onPersonalityChange,
  onCharacterUpload,
  onUpdateSystemPrompt
}: SettingsModalProps) {
  if (!show) return null;

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
        background: "white",
        borderRadius: 12,
        padding: 24,
        maxWidth: 800,
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 24 }}>🎭 Character & System Prompt</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#999"
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
            📤 Upload Character Card (JSON):
          </label>
          <input
            type="file"
            accept=".json"
            onChange={onCharacterUpload}
            style={{ fontSize: 14 }}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            SillyTavern-compatible character card format
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
              Your Name:
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => onUserNameChange(e.target.value)}
              style={{ width: "100%", padding: 6, fontSize: 14 }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
              Assistant Name:
            </label>
            <input
              type="text"
              value={assistantName}
              onChange={(e) => onAssistantNameChange(e.target.value)}
              style={{ width: "100%", padding: 6, fontSize: 14 }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
            System Prompt:
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: 6, fontSize: 14, fontFamily: "inherit" }}
            placeholder="Base instructions for the AI..."
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
            Scenario:
          </label>
          <textarea
            value={scenario}
            onChange={(e) => onScenarioChange(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: 6, fontSize: 14, fontFamily: "inherit" }}
            placeholder="Set the scene and context for the roleplay..."
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
            Character Definition:
          </label>
          <textarea
            value={characterDef}
            onChange={(e) => onCharacterDefChange(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 6, fontSize: 14, fontFamily: "inherit" }}
            placeholder="Describe the character's personality, traits, background..."
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
            Personality:
          </label>
          <textarea
            value={personality}
            onChange={(e) => onPersonalityChange(e.target.value)}
            rows={2}
            style={{ width: "100%", padding: 6, fontSize: 14, fontFamily: "inherit" }}
            placeholder="Additional personality traits..."
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={onUpdateSystemPrompt}
            disabled={!connected}
            style={{
              marginLeft: "auto",
              padding: "8px 16px",
              background: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: connected ? "pointer" : "not-allowed"
            }}
          >
            📝 Update Character
          </button>
        </div>
      </div>
    </div>
  );
}
