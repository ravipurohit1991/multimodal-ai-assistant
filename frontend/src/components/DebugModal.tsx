import { Theme } from "../theme";

interface DebugModalProps {
  show: boolean;
  lastLlmPayload: any;
  lastLlmResponse: any;
  theme: Theme;
  onClose: () => void;
}

export function DebugModal({
  show,
  lastLlmPayload,
  lastLlmResponse,
  theme,
  onClose
}: DebugModalProps) {
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
      zIndex: 2000
    }}>
      <div style={{
        background: "white",
        borderRadius: 12,
        padding: 24,
        maxWidth: 900,
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        width: "90%"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 24 }}>🐛 Developer Debug Info</h3>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Request Payload */}
          <div style={{ border: "1px solid #e1e8ed", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              padding: 12,
              background: "#2d3748",
              color: "white",
              fontSize: 14,
              fontWeight: 600
            }}>
              📤 Request to LLM
            </div>
            {lastLlmPayload ? (
              <pre style={{
                margin: 0,
                padding: 16,
                background: "#1a202c",
                color: "#4ec9b0",
                fontSize: 11,
                overflowX: "auto",
                maxHeight: 400,
                overflowY: "auto"
              }}>
                {JSON.stringify(lastLlmPayload, null, 2)}
              </pre>
            ) : (
              <div style={{ padding: 16, color: "#999", fontStyle: "italic" }}>
                No request data yet
              </div>
            )}
          </div>

          {/* Response Payload */}
          <div style={{ border: "1px solid #e1e8ed", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              padding: 12,
              background: "#2d3748",
              color: "white",
              fontSize: 14,
              fontWeight: 600
            }}>
              📥 Response from LLM
            </div>
            {lastLlmResponse ? (
              <pre style={{
                margin: 0,
                padding: 16,
                background: "#1a202c",
                color: "#ce9178",
                fontSize: 11,
                overflowX: "auto",
                maxHeight: 400,
                overflowY: "auto"
              }}>
                {JSON.stringify(lastLlmResponse, null, 2)}
              </pre>
            ) : (
              <div style={{ padding: 16, color: "#999", fontStyle: "italic" }}>
                No response data yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
