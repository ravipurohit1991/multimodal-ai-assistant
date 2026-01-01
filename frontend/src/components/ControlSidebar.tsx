import { OutputMode, TtsEngine, VoiceInfo } from "../types";
import { Theme } from "../theme";

interface ControlSidebarProps {
  connected: boolean;
  llmHost: string;
  llmModel: string;
  availableModels: string[];
  outputMode: OutputMode;
  ttsEngine: TtsEngine;
  availableVoices: VoiceInfo[];
  currentVoice: string;
  useContext: boolean;
  includeImageGen: boolean;
  showJsonPayload: boolean;
  showModelStatus: boolean;
  theme: Theme;
  themeName: 'light' | 'dark';
  onConnect: () => void;
  onDisconnect: () => void;
  onLlmHostChange: (host: string) => void;
  onLlmModelChange: (model: string) => void;
  onRefreshModels: () => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onToggleDebug: () => void;
  onToggleModelStatus: () => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function ControlSidebar({
  connected,
  llmHost,
  llmModel,
  availableModels,
  outputMode,
  ttsEngine,
  useContext,
  showJsonPayload,
  showModelStatus,
  theme,
  themeName,
  onConnect,
  onDisconnect,
  onLlmHostChange,
  onLlmModelChange,
  onRefreshModels,
  onOutputModeChange,
  onToggleDebug,
  onToggleModelStatus,
  onThemeChange
}: ControlSidebarProps) {
  return (
    <div style={{
      width: 380,
      background: theme.colors.surface,
      borderRight: `1px solid ${theme.colors.border}`,
      display: "flex",
      flexDirection: "column",
      overflow: "auto"
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.colors.textPrimary }}>
              Multimodal AI Assistant
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 11, color: theme.colors.textSecondary }}>
              Version 1.0 • Privacy-First AI
            </p>
          </div>
          {/* Theme Toggle */}
          <button
            onClick={() => onThemeChange(themeName === 'light' ? 'dark' : 'light')}
            title={`Switch to ${themeName === 'light' ? 'dark' : 'light'} mode`}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              padding: "8px",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.colors.primaryLight}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {themeName === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.colors.border}` }}>
        {!connected ? (
          <button
            onClick={onConnect}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "10px 14px",
              background: theme.colors.buttonPrimary,
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: theme.colors.shadowSm,
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.colors.buttonPrimaryHover}
            onMouseLeave={(e) => e.currentTarget.style.background = theme.colors.buttonPrimary}
          >
            🔌 Connect
          </button>
        ) : (
          <button
            onClick={onDisconnect}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "10px 14px",
              background: theme.colors.error,
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              transition: "opacity 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            🔌 Disconnect
          </button>
        )}
        <div style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 12,
          color: connected ? theme.colors.success : theme.colors.textTertiary,
          fontWeight: 600
        }}>
          {connected ? "● Connected" : "○ Not Connected"}
        </div>
      </div>

      {/* LLM Configuration */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.colors.border}` }}>
        <label style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 10,
          color: theme.colors.textPrimary,
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          🤖 LLM Configuration
        </label>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 11, fontWeight: 600, color: theme.colors.textSecondary }}>
            LLM Host URL:
          </label>
          <input
            type="text"
            value={llmHost}
            onChange={(e) => onLlmHostChange(e.target.value)}
            placeholder="http://localhost:11434"
            style={{
              width: "100%",
              padding: "8px",
              fontSize: 12,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 6,
              background: theme.colors.surface,
              color: theme.colors.textPrimary
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 11, fontWeight: 600, color: theme.colors.textSecondary }}>
            LLM Model:
          </label>
          <select
            value={llmModel}
            onChange={(e) => onLlmModelChange(e.target.value)}
            disabled={!connected}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: 12,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 6,
              cursor: connected ? "pointer" : "not-allowed",
              background: theme.colors.surface,
              color: theme.colors.textPrimary
            }}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value={llmModel}>{llmModel}</option>
            )}
          </select>
          <button
            onClick={onRefreshModels}
            style={{
              fontSize: 11,
              padding: "6px 12px",
              marginTop: 6,
              background: theme.colors.buttonSecondary,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.colors.buttonSecondaryHover}
            onMouseLeave={(e) => e.currentTarget.style.background = theme.colors.buttonSecondary}
          >
            🔄 Refresh Models
          </button>
        </div>
      </div>

      {/* Output Mode Selection */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${theme.colors.border}` }}>
        <label style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 10,
          color: theme.colors.textPrimary,
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          Output Mode
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: outputMode === "voice" ? theme.colors.primaryLight : theme.colors.surface,
            border: `2px solid ${outputMode === "voice" ? theme.colors.primary : theme.colors.border}`,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.2s"
          }}>
            <input
              type="radio"
              checked={outputMode === "voice"}
              onChange={() => onOutputModeChange("voice")}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: 18 }}>🔊</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: theme.colors.textPrimary }}>Voice Output</span>
          </label>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: outputMode === "text" ? theme.colors.primaryLight : theme.colors.surface,
            border: `2px solid ${outputMode === "text" ? theme.colors.primary : theme.colors.border}`,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.2s"
          }}>
            <input
              type="radio"
              checked={outputMode === "text"}
              onChange={() => onOutputModeChange("text")}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: 18 }}>📝</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: theme.colors.textPrimary }}>Text Output</span>
          </label>
        </div>
      </div>

      {/* Privacy Notice */}
      <div style={{
        margin: "16px 24px",
        padding: "14px",
        background: theme.colors.infoLight,
        borderRadius: 8,
        fontSize: 11,
        lineHeight: 1.5,
        border: `1px solid ${theme.colors.info}`
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: theme.colors.info }}>
          🔒 Privacy & Pipeline Info
        </div>
        <div style={{ color: theme.colors.textSecondary }}>
          <div style={{ marginBottom: 6 }}>
            <strong>Pipeline:</strong> 🎤 Speech-to-Text → 🤖 LLM → 🔊 Text-to-Speech
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Local Processing:</strong> Whisper STT & {outputMode === "voice" ? `${ttsEngine.charAt(0).toUpperCase() + ttsEngine.slice(1)} TTS` : "Text"} run 100% locally
          </div>
          <div>
            <strong>Model:</strong> {llmModel}
            {!useContext && <span style={{ marginLeft: 8, color: theme.colors.warning, fontWeight: 600 }}>⚠️ Context disabled</span>}
          </div>
        </div>
      </div>

      {/* Debug Info Button */}
      <div style={{ padding: "16px 24px" }}>
        <button
          onClick={onToggleDebug}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "8px",
            background: theme.colors.buttonSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            color: theme.colors.textPrimary,
            marginBottom: 8,
            transition: "background 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.colors.buttonSecondaryHover}
          onMouseLeave={(e) => e.currentTarget.style.background = theme.colors.buttonSecondary}
        >
          🐛 Developer Debug Info
        </button>

        <button
          onClick={onToggleModelStatus}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "8px",
            background: showModelStatus ? theme.colors.buttonPrimary : theme.colors.buttonSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            color: showModelStatus ? "white" : theme.colors.textPrimary,
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            if (!showModelStatus) {
              e.currentTarget.style.background = theme.colors.buttonSecondaryHover;
            } else {
              e.currentTarget.style.opacity = "0.85";
            }
          }}
          onMouseLeave={(e) => {
            if (!showModelStatus) {
              e.currentTarget.style.background = theme.colors.buttonSecondary;
            } else {
              e.currentTarget.style.opacity = "1";
            }
          }}
        >
          🔧 Model Status
        </button>
      </div>
    </div>
  );
}
