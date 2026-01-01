import React, { useEffect, useState } from "react";
import { ModelStatus, ModelInfo } from "../types";

interface ModelStatusPanelProps {
  show: boolean;
}

export function ModelStatusPanel({ show }: ModelStatusPanelProps) {
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

  const renderModelCard = (label: string, model: ModelInfo | undefined) => {
    if (!model) return null;

    const getDeviceColor = (device: string) => {
      if (device === "cuda") return "#4CAF50";
      if (device === "cpu") return "#2196F3";
      if (device === "remote") return "#9C27B0";
      return "#757575";
    };

    const getLoadedColor = (loaded: boolean) => {
      return loaded ? "#4CAF50" : "#9E9E9E";
    };

    return (
      <div
        key={label}
        style={{
          background: "white",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 12,
          border: "1px solid #e1e8ed",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#333" }}>{label}</h4>
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 12,
              background: getLoadedColor(model.loaded),
              color: "white",
              fontWeight: 600,
            }}
          >
            {model.loaded ? "LOADED" : "UNLOADED"}
          </span>
        </div>

        <div style={{ fontSize: 11, color: "#666", lineHeight: 1.6 }}>
          {model.model && (
            <div>
              <strong>Model:</strong> {model.model}
            </div>
          )}
          {model.voice && (
            <div>
              <strong>Voice:</strong> {model.voice}
            </div>
          )}
          {model.host && (
            <div>
              <strong>Host:</strong> {model.host}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span>
              <strong>Device:</strong>{" "}
              <span style={{ color: getDeviceColor(model.device), fontWeight: 600 }}>
                {model.device.toUpperCase()}
              </span>
            </span>
            {model.memory_mb > 0 && (
              <span>
                <strong>Memory:</strong> {model.memory_mb.toFixed(0)} MB
              </span>
            )}
          </div>
          {model.lora && (
            <div style={{ marginTop: 4, color: "#9C27B0" }}>
              <strong>LoRA:</strong> Enabled
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        width: 320,
        background: "#f8f9fa",
        borderLeft: "2px solid #e1e8ed",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "2px solid #e1e8ed",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>🔧 Model Status</h3>
        <p style={{ margin: "4px 0 0 0", fontSize: 11, opacity: 0.9 }}>
          {modelStatus?.low_vram_mode ? "⚡ Low VRAM Mode Active" : "System Resources"}
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: "16px", flex: 1, overflow: "auto" }}>
        {loading && !modelStatus && (
          <div style={{ textAlign: "center", padding: 20, color: "#666" }}>
            <div>Loading...</div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              background: "#ffebee",
              color: "#c62828",
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {modelStatus && (
          <>
            {/* VRAM Mode Indicator */}
            {modelStatus.low_vram_mode && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#fff3e0",
                  color: "#e65100",
                  borderRadius: 8,
                  fontSize: 11,
                  marginBottom: 12,
                  border: "1px solid #ffb74d",
                }}
              >
                <strong>⚡ Low VRAM Mode:</strong> Models unload after use to save memory
              </div>
            )}

            {/* GPU Stats (pynvml-based, like nvtop) */}
            {modelStatus.gpus && modelStatus.gpus.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {modelStatus.gpus.map((gpu) => (
                  <div
                    key={gpu.device_id}
                    style={{
                      padding: "12px",
                      background: "#e8f5e9",
                      borderRadius: 8,
                      fontSize: 11,
                      marginBottom: 8,
                      border: "1px solid #4CAF50",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#2e7d32", marginBottom: 6 }}>
                      🎮 GPU {gpu.device_id}: {gpu.name}
                    </div>
                    <div style={{ color: "#666" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span><strong>VRAM:</strong> {gpu.memory_used_mb.toFixed(0)} / {gpu.memory_total_mb.toFixed(0)} MB</span>
                        <span><strong>{gpu.memory_percent.toFixed(1)}%</strong></span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span><strong>Utilization:</strong> {gpu.utilization_percent.toFixed(0)}%</span>
                        {gpu.temperature_c && <span><strong>Temp:</strong> {gpu.temperature_c.toFixed(0)}°C</span>}
                      </div>
                      {gpu.power_usage_w && (
                        <div><strong>Power:</strong> {gpu.power_usage_w.toFixed(1)} W</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* System Stats (like btop) */}
            {modelStatus.system && (
              <div
                style={{
                  padding: "12px",
                  background: "#e3f2fd",
                  borderRadius: 8,
                  fontSize: 11,
                  marginBottom: 12,
                  border: "1px solid #2196F3",
                }}
              >
                <div style={{ fontWeight: 600, color: "#1565c0", marginBottom: 6 }}>
                  💻 System Resources
                </div>
                <div style={{ color: "#666" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span><strong>CPU:</strong> {modelStatus.system.cpu_percent.toFixed(1)}%</span>
                    <span><strong>Process:</strong> {modelStatus.system.process_cpu_percent.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span><strong>RAM:</strong> {(modelStatus.system.ram_used_mb / 1024).toFixed(1)} / {(modelStatus.system.ram_total_mb / 1024).toFixed(1)} GB</span>
                    <span><strong>{modelStatus.system.ram_percent.toFixed(1)}%</strong></span>
                  </div>
                  <div>
                    <strong>Process RAM:</strong> {modelStatus.system.process_ram_mb.toFixed(0)} MB
                  </div>
                </div>
              </div>
            )}

            {/* CUDA Info */}
            {modelStatus.cuda?.available && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#f3e5f5",
                  borderRadius: 8,
                  fontSize: 11,
                  marginBottom: 12,
                  border: "1px solid #9C27B0",
                }}
              >
                <div style={{ fontWeight: 600, color: "#6a1b9a", marginBottom: 4 }}>
                  ⚡ PyTorch CUDA
                </div>
                <div style={{ color: "#666" }}>
                  <div><strong>Devices:</strong> {modelStatus.cuda.device_count}</div>
                  <div><strong>Current:</strong> {modelStatus.cuda.current_device}</div>
                </div>
              </div>
            )}

            {/* Model Cards */}
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 12, color: "#666", textTransform: "uppercase" }}>
                Active Models
              </h4>

              {renderModelCard("LLM", modelStatus.models.llm)}
              {renderModelCard("Speech-to-Text", modelStatus.models.stt)}
              {renderModelCard("Text-to-Speech", modelStatus.models.tts)}
              {renderModelCard("Image Generator", modelStatus.models.image_generator)}
              {renderModelCard("Image Explainer", modelStatus.models.image_explainer)}

              {!modelStatus.models.llm &&
                !modelStatus.models.stt &&
                !modelStatus.models.tts &&
                !modelStatus.models.image_generator &&
                !modelStatus.models.image_explainer && (
                  <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 12 }}>
                    No models loaded
                  </div>
                )}
            </div>
          </>
        )}
      </div>

      {/* Refresh Button */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e1e8ed", background: "white" }}>
        <button
          onClick={fetchModelStatus}
          disabled={loading}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: loading ? "#ccc" : "#667eea",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          {loading ? "Refreshing..." : "🔄 Refresh Status"}
        </button>
      </div>
    </div>
  );
}
