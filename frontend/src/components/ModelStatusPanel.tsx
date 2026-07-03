import { useEffect, useState } from "react";
import { ModelStatus, ModelInfo } from "../types";
import { Theme } from "../theme";
import { IconRefresh } from "./Icons";

interface ModelStatusPanelProps {
  show: boolean;
  theme: Theme;
}

/** Thin utilization meter with a mono readout. */
function Meter({ label, value, detail, theme }: { label: string; value: number; detail: string; theme: Theme }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct > 88 ? theme.colors.error : pct > 65 ? theme.colors.warning : theme.colors.success;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: theme.colors.textSecondary }}>{label}</span>
        <span className="meta-mono">{detail}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: theme.colors.field, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

export function ModelStatusPanel({ show, theme }: ModelStatusPanelProps) {
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:8000/api/model-status");
      if (!response.ok) {
        throw new Error("Failed to fetch model status");
      }
      const data = await response.json();
      setModelStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      fetchModelStatus();
      // Refresh every 5 seconds when panel is visible
      const interval = setInterval(fetchModelStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [show]);

  if (!show) return null;

  const deviceColor = (device: string) =>
    device === "cuda" ? theme.colors.success
    : device === "cpu" ? theme.colors.info
    : device === "remote" ? theme.colors.secondary
    : theme.colors.textTertiary;

  const renderModelCard = (label: string, model: ModelInfo | undefined) => {
    if (!model) return null;
    return (
      <div
        key={label}
        style={{
          background: theme.colors.field,
          borderRadius: 11,
          padding: "10px 12px",
          marginBottom: 8,
          border: `1px solid ${theme.colors.borderLight}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: theme.colors.textPrimary }}>{label}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: model.loaded ? theme.colors.success : theme.colors.textTertiary,
              opacity: model.loaded ? 1 : 0.5,
            }} />
            <span className="meta-mono">{model.loaded ? "loaded" : "idle"}</span>
          </span>
        </div>

        <div style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 1.6, overflowWrap: "break-word" }}>
          {model.model && <div>{model.model}</div>}
          {model.voice && <div>Voice: {model.voice}</div>}
          {model.host && <div>{model.host}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ color: deviceColor(model.device), fontWeight: 600, fontSize: 10.5, letterSpacing: "0.05em" }}>
              {model.device.toUpperCase()}
            </span>
            {model.memory_mb > 0 && <span className="meta-mono">{model.memory_mb.toFixed(0)} MB</span>}
          </div>
          {model.lora && (
            <div style={{ marginTop: 3, color: theme.colors.secondary, fontWeight: 500 }}>LoRA enabled</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        width: 300,
        background: theme.colors.surface,
        borderLeft: `1px solid ${theme.colors.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        flexShrink: 0,
      }}
    >
      {/* Panel header */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${theme.colors.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div className="label-caps">Engine room</div>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: theme.colors.textTertiary }}>
            {modelStatus?.low_vram_mode ? "Low-VRAM mode — models unload after use" : "Models & system resources"}
          </p>
        </div>
        <button className="icon-btn" onClick={fetchModelStatus} disabled={loading} title="Refresh now">
          <IconRefresh size={15} className={loading ? "spin" : undefined} />
        </button>
      </div>

      <div style={{ padding: "14px 18px", flex: 1, overflow: "auto" }}>
        {loading && !modelStatus && (
          <div style={{ textAlign: "center", padding: 20, color: theme.colors.textTertiary, fontSize: 12.5 }}>
            Reading instruments…
          </div>
        )}

        {error && (
          <div style={{
            padding: "9px 12px",
            background: theme.colors.errorLight,
            color: theme.colors.textPrimary,
            borderRadius: 9,
            fontSize: 12,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {modelStatus && (
          <>
            {/* GPU meters */}
            {modelStatus.gpus && modelStatus.gpus.length > 0 && modelStatus.gpus.map((gpu) => (
              <div key={gpu.device_id} style={{ marginBottom: 14 }}>
                <div className="label-caps" style={{ marginBottom: 8 }}>
                  GPU {gpu.device_id} · {gpu.name}
                </div>
                <Meter
                  label="VRAM"
                  value={gpu.memory_percent}
                  detail={`${(gpu.memory_used_mb / 1024).toFixed(1)} / ${(gpu.memory_total_mb / 1024).toFixed(1)} GB`}
                  theme={theme}
                />
                <Meter
                  label="Utilization"
                  value={gpu.utilization_percent}
                  detail={`${gpu.utilization_percent.toFixed(0)}%${gpu.temperature_c ? ` · ${gpu.temperature_c.toFixed(0)}°C` : ""}${gpu.power_usage_w ? ` · ${gpu.power_usage_w.toFixed(0)}W` : ""}`}
                  theme={theme}
                />
              </div>
            ))}

            {/* System meters */}
            {modelStatus.system && (
              <div style={{ marginBottom: 14 }}>
                <div className="label-caps" style={{ marginBottom: 8 }}>System</div>
                <Meter
                  label="CPU"
                  value={modelStatus.system.cpu_percent}
                  detail={`${modelStatus.system.cpu_percent.toFixed(0)}% · app ${modelStatus.system.process_cpu_percent.toFixed(0)}%`}
                  theme={theme}
                />
                <Meter
                  label="RAM"
                  value={modelStatus.system.ram_percent}
                  detail={`${(modelStatus.system.ram_used_mb / 1024).toFixed(1)} / ${(modelStatus.system.ram_total_mb / 1024).toFixed(1)} GB`}
                  theme={theme}
                />
                <div className="meta-mono" style={{ marginTop: 2 }}>
                  app footprint {(modelStatus.system.process_ram_mb / 1024).toFixed(1)} GB
                </div>
              </div>
            )}

            {/* CUDA note */}
            {modelStatus.cuda?.available && (
              <div className="meta-mono" style={{ marginBottom: 14 }}>
                CUDA available · {modelStatus.cuda.device_count} device{(modelStatus.cuda.device_count ?? 0) === 1 ? "" : "s"}
              </div>
            )}

            {/* Model cards */}
            <div className="label-caps" style={{ margin: "4px 0 8px" }}>Models</div>
            {renderModelCard("Language model", modelStatus.models.llm)}
            {renderModelCard("Speech to text", modelStatus.models.stt)}
            {renderModelCard("Text to speech", modelStatus.models.tts)}
            {renderModelCard("Image generator", modelStatus.models.image_generator)}
            {renderModelCard("Vision", modelStatus.models.image_explainer)}

            {!modelStatus.models.llm &&
              !modelStatus.models.stt &&
              !modelStatus.models.tts &&
              !modelStatus.models.image_generator &&
              !modelStatus.models.image_explainer && (
                <div style={{ textAlign: "center", padding: 20, color: theme.colors.textTertiary, fontSize: 12 }}>
                  No models loaded yet
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
