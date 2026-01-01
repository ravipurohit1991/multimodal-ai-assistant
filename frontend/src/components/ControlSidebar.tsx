import { OutputMode, TtsEngine, VoiceInfo } from "../types";

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
  onConnect: () => void;
  onDisconnect: () => void;
  onLlmHostChange: (host: string) => void;
  onLlmModelChange: (model: string) => void;
  onRefreshModels: () => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onToggleDebug: () => void;
  onToggleModelStatus: () => void;
}

export function ControlSidebar({
  connected,
  llmHost,
  llmModel,
  availableModels,
  outputMode,
  useContext,
  showJsonPayload,
  showModelStatus,
  onConnect,
  onDisconnect,
  onLlmHostChange,
  onLlmModelChange,
  onRefreshModels,
  onOutputModeChange,
  onToggleDebug,
  onToggleModelStatus
}: ControlSidebarProps) {
  return (
    <div style={{
      width: 380,
      background: "#ffffff",
      borderRight: "2px solid #e1e8ed",
      display: "flex",
      flexDirection: "column",
      overflow: "auto"
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: "2px solid #e1e8ed",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white"
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>🎭 AI Call</h2>
        <p style={{ margin: "4px 0 0 0", fontSize: 11, opacity: 0.9 }}>Voice & Text Pipeline</p>
      </div>

      {/* Connection Status */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e1e8ed" }}>
        {!connected ? (
          <button
            onClick={onConnect}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "10px 14px",
              background: "#667eea",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: "0 2px 4px rgba(102, 126, 234, 0.3)"
            }}
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
              background: "#f44336",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            🔌 Disconnect
          </button>
        )}
        <div style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 12,
          color: connected ? "#4CAF50" : "#999",
          fontWeight: 600
        }}>
          {connected ? "● Connected" : "○ Not Connected"}
        </div>
      </div>

      {/* LLM Configuration */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e1e8ed" }}>
        <label style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 10,
          color: "#2d3748",
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          🤖 LLM Configuration
        </label>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 11, fontWeight: 600, color: "#4a5568" }}>
            LLM Host URL:
          </label>
          <input
            type="text"
            value={llmHost}
            onChange={(e) => onLlmHostChange(e.target.value)}
            placeholder="http://localhost:11434"
            style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid #e1e8ed", borderRadius: 6 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 11, fontWeight: 600, color: "#4a5568" }}>
            LLM Model:
          </label>
          <select
            value={llmModel}
            onChange={(e) => onLlmModelChange(e.target.value)}
            disabled={!connected}
            style={{ width: "100%", padding: "8px", fontSize: 12, border: "1px solid #e1e8ed", borderRadius: 6, cursor: connected ? "pointer" : "not-allowed" }}
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
              background: "#667eea",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            🔄 Refresh Models
          </button>
        </div>
      </div>

      {/* Output Mode Selection */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e1e8ed" }}>
        <label style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 10,
          color: "#2d3748",
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
            background: outputMode === "voice" ? "#f3e5f5" : "#f8f9fa",
            border: outputMode === "voice" ? "2px solid #9c27b0" : "2px solid #e1e8ed",
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
            <span style={{ fontWeight: 600, fontSize: 13 }}>Voice Output</span>
          </label>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: outputMode === "text" ? "#f3e5f5" : "#f8f9fa",
            border: outputMode === "text" ? "2px solid #9c27b0" : "2px solid #e1e8ed",
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
            <span style={{ fontWeight: 600, fontSize: 13 }}>Text Output</span>
          </label>
        </div>
      </div>

      {/* Privacy Notice */}
      <div style={{
        margin: "16px 24px",
        padding: "14px",
        background: "#e3f2fd",
        borderRadius: 8,
        fontSize: 11,
        lineHeight: 1.5,
        border: "1px solid #2196F3"
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#1976d2" }}>
          🔒 Privacy & Pipeline Info
        </div>
        <div style={{ color: "#455a64" }}>
          <div style={{ marginBottom: 6 }}>
            <strong>Pipeline:</strong> 🎤 Speech-to-Text → 🤖 LLM → 🔊 Text-to-Speech
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Local Processing:</strong> Whisper STT & {outputMode === "voice" ? "Piper/Chatterbox/Soprano" : "Text"} run 100% locally
          </div>
          <div>
            <strong>Model:</strong> {llmModel}
            {!useContext && <span style={{ marginLeft: 8, color: "#f44336", fontWeight: 600 }}>⚠️ Context disabled</span>}
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
            background: "#f5f5f5",
            border: "1px solid #e1e8ed",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            color: "#2d3748",
            marginBottom: 8
          }}
        >
          🐛 Developer Debug Info
        </button>
        
        <button
          onClick={onToggleModelStatus}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "8px",
            background: showModelStatus ? "#667eea" : "#f5f5f5",
            border: "1px solid #e1e8ed",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            color: showModelStatus ? "white" : "#2d3748"
          }}
        >
          🔧 Model Status
        </button>
      </div>
    </div>
  );
}
