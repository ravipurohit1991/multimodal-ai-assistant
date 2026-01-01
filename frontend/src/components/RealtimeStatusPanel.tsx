interface RealtimeStatusPanelProps {
  show: boolean;
  connected: boolean;
  recording: boolean;
  inCall: boolean;
  isUserSpeaking: boolean;
  userName: string;
  assistantName: string;
  transcript: string;
  assistantText: string;
  showRealtimeUser: boolean;
  showRealtimeAssistant: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onToggleRealtimeUser: () => void;
  onToggleRealtimeAssistant: () => void;
}

export function RealtimeStatusPanel({
  show,
  connected,
  recording,
  inCall,
  isUserSpeaking,
  userName,
  assistantName,
  transcript,
  assistantText,
  showRealtimeUser,
  showRealtimeAssistant,
  onStartCall,
  onEndCall,
  onStartRecording,
  onStopRecording,
  onToggleRealtimeUser,
  onToggleRealtimeAssistant
}: RealtimeStatusPanelProps) {
  if (!show) return null;

  return (
    <div style={{
      width: 350,
      background: "#ffffff",
      borderLeft: "2px solid #e1e8ed",
      display: "flex",
      flexDirection: "column",
      overflow: "auto"
    }}>
      {/* Panel Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: "2px solid #e1e8ed",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white"
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>📊 Real-time Status</h3>
        <p style={{ margin: "4px 0 0 0", fontSize: 11, opacity: 0.9 }}>Live transcription</p>
      </div>

      {/* Hold to Talk Button */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e1e8ed", background: "#f8f9fa" }}>
        {/* Call Mode Buttons */}
        {!inCall ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Start Call Button */}
            <button
              disabled={!connected}
              onClick={onStartCall}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "12px",
                background: connected
                  ? "linear-gradient(135deg, #2196F3 0%, #00BCD4 100%)"
                  : "#cccccc",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: connected ? "pointer" : "not-allowed",
                fontWeight: 600,
                boxShadow: connected ? "0 4px 12px rgba(33, 150, 243, 0.4)" : "none",
                transition: "all 0.2s"
              }}
            >
              📞 Start Call (VAD)
            </button>
            
            {/* Hold to Talk Button */}
            <button
              disabled={!connected}
              onMouseDown={onStartRecording}
              onMouseUp={onStopRecording}
              onMouseLeave={() => recording && onStopRecording()}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "12px",
                background: recording
                  ? "linear-gradient(135deg, #f44336 0%, #e91e63 100%)"
                  : connected
                    ? "linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)"
                    : "#cccccc",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: connected ? "pointer" : "not-allowed",
                fontWeight: 600,
                boxShadow: recording ? "0 4px 12px rgba(244, 67, 54, 0.4)" : "0 2px 4px rgba(0,0,0,0.1)",
                transition: "all 0.2s"
              }}
            >
              {recording ? "🔴 Release to Send" : "🎤 Hold to Talk"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Call Status Indicator */}
            <div style={{
              width: "100%",
              padding: "12px",
              background: isUserSpeaking 
                ? "linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)"
                : "linear-gradient(135deg, #2196F3 0%, #00BCD4 100%)",
              color: "white",
              borderRadius: 8,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 13,
              boxShadow: isUserSpeaking 
                ? "0 4px 12px rgba(76, 175, 80, 0.5)" 
                : "0 4px 12px rgba(33, 150, 243, 0.4)",
              transition: "all 0.2s"
            }}>
              {isUserSpeaking ? "🎤 Speaking..." : "👂 Listening..."}
            </div>
            
            {/* End Call Button */}
            <button
              onClick={onEndCall}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "12px",
                background: "linear-gradient(135deg, #f44336 0%, #e91e63 100%)",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(244, 67, 54, 0.4)",
                transition: "all 0.2s"
              }}
            >
              📞❌ End Call
            </button>
          </div>
        )}
      </div>

      {/* Real-time User Status - Collapsible */}
      <div style={{ borderBottom: "1px solid #e1e8ed" }}>
        <button
          onClick={onToggleRealtimeUser}
          style={{
            width: "100%",
            padding: "16px 20px",
            background: "#e3f2fd",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
            fontSize: 13,
            color: "#1976d2"
          }}
        >
          <span>🎤 {userName}</span>
          <span style={{ fontSize: 12 }}>{showRealtimeUser ? "▼" : "▶"}</span>
        </button>
        {showRealtimeUser && (
          <div style={{
            padding: "16px 20px",
            background: "#f5f9fc"
          }}>
            <div style={{
              padding: 12,
              background: "white",
              borderRadius: 8,
              minHeight: 80,
              fontSize: 13,
              color: "#333",
              whiteSpace: "pre-wrap",
              border: "2px solid #2196F3",
              boxShadow: "0 2px 4px rgba(33, 150, 243, 0.1)",
              maxHeight: 300,
              overflow: "auto"
            }}>
              {transcript || "Listening..."}
            </div>
          </div>
        )}
      </div>

      {/* Real-time Assistant Status - Collapsible */}
      <div style={{ borderBottom: "1px solid #e1e8ed" }}>
        <button
          onClick={onToggleRealtimeAssistant}
          style={{
            width: "100%",
            padding: "16px 20px",
            background: "#f3e5f5",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
            fontSize: 13,
            color: "#7b1fa2"
          }}
        >
          <span>🤖 {assistantName}</span>
          <span style={{ fontSize: 12 }}>{showRealtimeAssistant ? "▼" : "▶"}</span>
        </button>
        {showRealtimeAssistant && (
          <div style={{
            padding: "16px 20px",
            background: "#faf5fc"
          }}>
            <div style={{
              padding: 12,
              background: "white",
              borderRadius: 8,
              minHeight: 80,
              fontSize: 13,
              color: "#333",
              whiteSpace: "pre-wrap",
              border: "2px solid #9c27b0",
              boxShadow: "0 2px 4px rgba(156, 39, 176, 0.1)",
              maxHeight: 300,
              overflow: "auto"
            }}>
              {assistantText || "Waiting..."}
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div style={{
        padding: "16px 20px",
        fontSize: 11,
        color: "#718096",
        lineHeight: 1.5
      }}>
        <div style={{ marginBottom: 8, fontWeight: 600, color: "#2d3748" }}>
          💡 Quick Info
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>📞 Call Mode:</strong> Continuous listening with Voice Activity Detection (VAD). 
          Automatically detects when you start and stop speaking.
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>🎤 Hold to Talk:</strong> Press and hold to record, release to send.
        </div>
        <div>
          <strong>📝 Text Input:</strong> Type messages in the text box below.
        </div>
      </div>
    </div>
  );
}
