import { Theme } from "../theme";
import { IconX, IconCode } from "./Icons";

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

  const Pane = ({ title, data, accent }: { title: string; data: any; accent: string }) => (
    <div style={{
      border: `1px solid ${theme.colors.border}`,
      borderRadius: 12,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surfaceElevated,
        fontSize: 12,
        fontWeight: 600,
        color: theme.colors.textSecondary,
        letterSpacing: 0.2,
      }}>
        {title}
      </div>
      {data ? (
        <pre style={{
          margin: 0,
          padding: 14,
          background: theme.colors.background,
          color: accent,
          fontFamily: theme.fonts.mono,
          fontSize: 11,
          lineHeight: 1.5,
          overflow: "auto",
          maxHeight: 420,
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div style={{ padding: 14, color: theme.colors.textTertiary, fontStyle: "italic", fontSize: 12.5 }}>
          Nothing captured yet — send a message first.
        </div>
      )}
    </div>
  );

  return (
    <div className="modal-scrim" onClick={onClose} style={{ zIndex: 2000 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 960, maxWidth: "94vw", maxHeight: "88vh" }}
      >
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <IconCode size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Debug</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              The exact payload sent to the model, and what came back
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 20, overflow: "auto" }}>
          <Pane title="Request → model" data={lastLlmPayload} accent={theme.colors.info} />
          <Pane title="Model → response" data={lastLlmResponse} accent={theme.colors.primary} />
        </div>
      </div>
    </div>
  );
}
