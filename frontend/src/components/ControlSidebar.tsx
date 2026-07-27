import { useRef } from "react";
import { OutputMode, TtsEngine, VoiceInfo } from "../types";
import { Theme } from "../theme";
import {
  IconSun, IconMoon, IconPower, IconRefresh, IconHistory,
  IconSave, IconFolder, IconDownload, IconCode, IconActivity, IconAlert,
  IconFeather,
} from "./Icons";

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
  imageExplainerProvider: "local" | "ollama";
  imageExplainerModel: string;
  onImageExplainerProviderChange: (provider: "local" | "ollama") => void;
  onImageExplainerModelChange: (model: string) => void;
  onSaveSession: () => void;
  onLoadSession: (file: File) => void;
  /** Open the server-side story library (saved sessions). */
  onOpenSessions: () => void;
  /** Download the conversation as a formatted Markdown story. */
  onExportStory: () => void;
  onWipeEverything: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 18px 16px" }}>
      <div className="label-caps" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function FieldLabel({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <label style={{ display: "block", marginBottom: 4, fontSize: 11.5, fontWeight: 500, color: theme.colors.textSecondary }}>
      {children}
    </label>
  );
}

export function ControlSidebar({
  connected,
  llmHost,
  llmModel,
  availableModels,
  outputMode,
  showModelStatus,
  showJsonPayload,
  theme,
  themeName,
  imageExplainerProvider,
  imageExplainerModel,
  onConnect,
  onDisconnect,
  onLlmHostChange,
  onLlmModelChange,
  onRefreshModels,
  onOutputModeChange,
  onImageExplainerProviderChange,
  onImageExplainerModelChange,
  onToggleDebug,
  onToggleModelStatus,
  onThemeChange,
  onSaveSession,
  onLoadSession,
  onOpenSessions,
  onExportStory,
  onWipeEverything
}: ControlSidebarProps) {
  const sessionFileRef = useRef<HTMLInputElement>(null);
  const divider = <div style={{ height: 1, background: theme.colors.borderLight, margin: "0 18px" }} />;

  return (
    <div style={{
      width: 320,
      background: theme.colors.surface,
      borderRight: `1px solid ${theme.colors.border}`,
      display: "flex",
      flexDirection: "column",
      overflow: "auto",
      flexShrink: 0,
    }}>
      {/* Wordmark */}
      <div style={{
        padding: "16px 18px",
        borderBottom: `1px solid ${theme.colors.border}`,
        display: "flex",
        alignItems: "center",
        gap: 11,
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: theme.colors.primaryLight,
          color: theme.colors.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <IconFeather size={17} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.colors.textPrimary, letterSpacing: 0.1 }}>
            PersonaParlour
          </div>
          <div style={{ fontSize: 10.5, color: theme.colors.textTertiary, marginTop: 1 }}>
            Local · private · yours
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => onThemeChange(themeName === 'light' ? 'dark' : 'light')}
          title={`Switch to ${themeName === 'light' ? 'dark' : 'light'} theme`}
        >
          {themeName === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
        </button>
      </div>

      {/* Connection */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${theme.colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="live-dot" data-on={connected} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: connected ? theme.colors.textPrimary : theme.colors.textTertiary, flex: 1 }}>
            {connected ? "Connected" : "Not connected"}
          </span>
          {!connected ? (
            <button className="btn btn-primary" onClick={onConnect} style={{ padding: "6px 16px" }}>
              <IconPower size={14} /> Connect
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={onDisconnect} style={{ padding: "6px 12px" }}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Language model */}
      <Section title="Language model">
        <div style={{ marginBottom: 10 }}>
          <FieldLabel theme={theme}>Host</FieldLabel>
          <input
            type="text"
            className="input"
            value={llmHost}
            onChange={(e) => onLlmHostChange(e.target.value)}
            placeholder="http://localhost:11434"
            style={{ width: "100%", fontSize: 12 }}
          />
        </div>
        <FieldLabel theme={theme}>Model</FieldLabel>
        <div style={{ display: "flex", gap: 6 }}>
          <select
            className="input"
            value={llmModel}
            onChange={(e) => onLlmModelChange(e.target.value)}
            disabled={!connected}
            style={{ flex: 1, fontSize: 12, minWidth: 0 }}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value={llmModel}>{llmModel}</option>
            )}
          </select>
          <button className="icon-btn" onClick={onRefreshModels} title="Refresh model list">
            <IconRefresh size={15} />
          </button>
        </div>
      </Section>

      {divider}

      {/* Vision */}
      <Section title="Vision (image understanding)">
        <div className="seg" style={{ display: "flex", width: "100%" }}>
          <button
            style={{ flex: 1 }}
            data-active={imageExplainerProvider === "local"}
            onClick={() => onImageExplainerProviderChange("local")}
          >
            Local (Qwen-VL)
          </button>
          <button
            style={{ flex: 1 }}
            data-active={imageExplainerProvider === "ollama"}
            onClick={() => onImageExplainerProviderChange("ollama")}
          >
            Ollama
          </button>
        </div>
        {imageExplainerProvider === "ollama" && (
          <div style={{ marginTop: 10 }}>
            <FieldLabel theme={theme}>Ollama vision model</FieldLabel>
            <select
              className="input"
              value={imageExplainerModel}
              onChange={(e) => onImageExplainerModelChange(e.target.value)}
              style={{ width: "100%", fontSize: 12 }}
            >
              {availableModels.length > 0 ? (
                availableModels.map(m => <option key={m} value={m}>{m}</option>)
              ) : (
                <option value={imageExplainerModel}>{imageExplainerModel}</option>
              )}
            </select>
            <p style={{ margin: "5px 0 0", fontSize: 10.5, color: theme.colors.warning }}>
              Pick a model that supports vision
            </p>
          </div>
        )}
      </Section>

      {divider}

      {/* Replies */}
      <Section title="Replies">
        <div className="seg" style={{ display: "flex", width: "100%" }}>
          <button style={{ flex: 1 }} data-active={outputMode === "text"} onClick={() => onOutputModeChange("text")}>
            Text
          </button>
          <button style={{ flex: 1 }} data-active={outputMode === "voice"} onClick={() => onOutputModeChange("voice")}>
            Voice + text
          </button>
        </div>
      </Section>

      {divider}

      {/* Story library */}
      <Section title="Story library">
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: theme.colors.textTertiary, lineHeight: 1.5 }}>
          Park a whole story — chat, cast, lorebook &amp; settings — and pick it up later.
        </p>
        <input
          ref={sessionFileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onLoadSession(file);
          }}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn btn-quiet" onClick={onOpenSessions} style={{ justifyContent: "flex-start" }}>
            <IconHistory size={15} /> Open library…
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-quiet" onClick={onSaveSession} style={{ flex: 1 }} title="Download the session as a JSON file">
              <IconSave size={14} /> Save file
            </button>
            <button className="btn btn-quiet" onClick={() => sessionFileRef.current?.click()} style={{ flex: 1 }} title="Load a session JSON file">
              <IconFolder size={14} /> Load file
            </button>
          </div>
          <button className="btn btn-quiet" onClick={onExportStory} style={{ justifyContent: "flex-start" }} title="Download the conversation as a readable Markdown story">
            <IconDownload size={15} /> Export as story (.md)
          </button>
        </div>
      </Section>

      {divider}

      {/* Under the hood */}
      <Section title="Under the hood">
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-quiet"
            data-active={showJsonPayload}
            onClick={onToggleDebug}
            style={{ flex: 1, ...(showJsonPayload ? { background: theme.colors.primaryLight, color: theme.colors.primary } : {}) }}
          >
            <IconCode size={14} /> Debug
          </button>
          <button
            className="btn btn-quiet"
            onClick={onToggleModelStatus}
            style={{ flex: 1, ...(showModelStatus ? { background: theme.colors.primaryLight, color: theme.colors.primary } : {}) }}
          >
            <IconActivity size={14} /> Models
          </button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10.5, color: theme.colors.textTertiary, lineHeight: 1.55 }}>
          Speech, vision &amp; image generation run on this machine. Your story never leaves it
          unless you point the model host at a cloud endpoint.
        </p>
      </Section>

      <div style={{ flex: 1 }} />

      {/* Danger zone — irreversible full wipe */}
      <div style={{
        margin: "10px 18px 16px",
        padding: 12,
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${theme.colors.error} 40%, transparent)`,
        background: theme.colors.errorLight,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: theme.colors.error }}>
          <IconAlert size={13} />
          <span className="label-caps" style={{ color: theme.colors.error }}>Danger zone</span>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11, lineHeight: 1.5, color: theme.colors.textSecondary }}>
          Erase everything — chat, cast, lorebook, settings, and all images, uploads,
          sessions &amp; logs on disk. No undo.
        </p>
        <button className="btn btn-danger" onClick={onWipeEverything} style={{ width: "100%" }}>
          Wipe everything
        </button>
      </div>
    </div>
  );
}
