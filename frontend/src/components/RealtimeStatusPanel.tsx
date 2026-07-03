import { Theme } from "../theme";
import { IconMic, IconPhone, IconPhoneOff, IconChevronDown, IconChevronRight } from "./Icons";

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
  theme: Theme;
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
  theme,
  onStartCall,
  onEndCall,
  onStartRecording,
  onStopRecording,
  onToggleRealtimeUser,
  onToggleRealtimeAssistant
}: RealtimeStatusPanelProps) {
  if (!show) return null;

  const LivePane = ({
    label, tint, open, onToggle, text, placeholder,
  }: {
    label: string; tint: string; open: boolean; onToggle: () => void; text: string; placeholder: string;
  }) => (
    <div style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "11px 18px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: theme.colors.textPrimary,
        }}
      >
        <span style={{ color: theme.colors.textTertiary, display: "inline-flex" }}>
          {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: tint, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 14px" }}>
          <div style={{
            padding: 12,
            background: theme.colors.field,
            borderRadius: 10,
            minHeight: 70,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: text ? theme.colors.textPrimary : theme.colors.textTertiary,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            border: `1px solid ${theme.colors.borderLight}`,
            borderLeft: `2px solid ${tint}`,
            maxHeight: 280,
            overflow: "auto",
            ...(text ? {} : { fontStyle: "italic" }),
          }}>
            {text || placeholder}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      width: 320,
      background: theme.colors.surface,
      borderLeft: `1px solid ${theme.colors.border}`,
      display: "flex",
      flexDirection: "column",
      overflow: "auto",
      flexShrink: 0,
    }}>
      {/* Panel header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div className="label-caps">Voice</div>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: theme.colors.textTertiary }}>
          Speak to the story — live transcription
        </p>
      </div>

      {/* Talk controls */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${theme.colors.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {!inCall ? (
          <>
            <button
              className="btn btn-ghost"
              disabled={!connected}
              onClick={onStartCall}
              title="Continuous listening — voice activity detection finds your turns"
              style={{ width: "100%", padding: "10px" }}
            >
              <IconPhone size={15} /> Start a call
            </button>
            <button
              disabled={!connected}
              onMouseDown={onStartRecording}
              onMouseUp={onStopRecording}
              onMouseLeave={() => recording && onStopRecording()}
              title="Press and hold to record; release to send"
              style={{
                width: "100%",
                padding: "13px",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: recording ? theme.colors.error : theme.colors.buttonPrimary,
                color: recording ? "#fff" : theme.colors.primaryInk,
                border: "none",
                borderRadius: 11,
                cursor: connected ? "pointer" : "not-allowed",
                opacity: connected ? 1 : 0.45,
                boxShadow: recording ? `0 0 0 4px ${theme.colors.errorLight}` : theme.colors.shadowSm,
                transition: "background 0.15s ease, box-shadow 0.15s ease",
                userSelect: "none",
              }}
            >
              <IconMic size={16} />
              {recording ? "Release to send" : "Hold to talk"}
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: "100%",
              padding: "12px",
              borderRadius: 11,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: isUserSpeaking ? theme.colors.successLight : theme.colors.infoLight,
              color: isUserSpeaking ? theme.colors.success : theme.colors.info,
              border: `1px solid ${isUserSpeaking ? theme.colors.success : theme.colors.info}`,
              transition: "all 0.2s",
            }}>
              <span className="live-dot" data-on="true" style={{ background: isUserSpeaking ? theme.colors.success : theme.colors.info }} />
              {isUserSpeaking ? "You're speaking…" : "Listening…"}
            </div>
            <button className="btn btn-danger" onClick={onEndCall} style={{ width: "100%", padding: "10px" }}>
              <IconPhoneOff size={15} /> End call
            </button>
          </>
        )}
      </div>

      <LivePane
        label={userName || "You"}
        tint={theme.colors.primary}
        open={showRealtimeUser}
        onToggle={onToggleRealtimeUser}
        text={transcript}
        placeholder="Your words appear here as they're heard."
      />
      <LivePane
        label={assistantName || "Assistant"}
        tint={theme.colors.secondary}
        open={showRealtimeAssistant}
        onToggle={onToggleRealtimeAssistant}
        text={assistantText}
        placeholder="The reply streams here as it's written."
      />

      {/* How it works */}
      <div style={{ padding: "14px 18px", fontSize: 11, color: theme.colors.textTertiary, lineHeight: 1.6 }}>
        <div className="label-caps" style={{ marginBottom: 8 }}>How it works</div>
        <div style={{ marginBottom: 6 }}>
          <strong style={{ color: theme.colors.textSecondary }}>Call</strong> — hands-free; voice activity
          detection finds when you start and stop speaking.
        </div>
        <div>
          <strong style={{ color: theme.colors.textSecondary }}>Hold to talk</strong> — press and hold,
          speak, release to send.
        </div>
      </div>
    </div>
  );
}
