import { useRef, useEffect, useState } from "react";
import { Character, ContinuityReport, Message, RiggedCharacter, SightlineLeak, StageAnimationDirective, VoiceInfo, TtsEngine, OutputMode, SceneState } from "../types";
import { MessageItem } from "./MessageItem";
import { StoryNavigator } from "./StoryNavigator";
import { ActionMenu, MenuAction, MenuSeparator } from "./ActionMenu";
import { StreamingBubble } from "./StreamingBubble";
import { RigStage } from "./RigStage";
import { SceneFX } from "../scenefx";
import { moodToEmoji, moodToColor } from "../mood";
import { Theme } from "../theme";
import {
  IconPanelLeft, IconPanelRight, IconBookOpen, IconSliders, IconEraser,
  IconStop, IconVolume, IconFilm, IconMessage, IconImage, IconItalic, IconFeather,
  IconSparkles, IconBrain, IconShield, IconThreads, IconEye,
  IconSearch, IconChevronDown, IconMoreH,
} from "./Icons";

interface ConversationPanelProps {
  conversationHistory: Message[];
  /** Increments when a saved/imported story replaces the current transcript. */
  historyRevision: number;
  userName: string;
  assistantName: string;
  showLeftPanel: boolean;
  connected: boolean;
  ttsEngine: TtsEngine;
  outputMode: OutputMode;
  currentVoice: string;
  availableVoices: VoiceInfo[];
  useContext: boolean;
  includeImageGen: boolean;
  playingMessageIndex: number | null;
  editingMessage: { index: number; text: string } | null;
  showRealtimePanel: boolean;
  userCharacterImage: string | null;
  assistantCharacterImage: string | null;
  inSceneCharacters: Character[];
  selectedCharacterId: string;
  rigAssets: RiggedCharacter[];
  stageEnabled: boolean;
  stageDirective: StageAnimationDirective | null;
  assistantMood: string;
  streamingText: string;
  isStreaming: boolean;
  formattingEnabled: boolean;
  /** Reactive scene/mood gradient for the reading area (falls back to theme bg). */
  ambient: string;
  /** Cinematic reading mode — serif prose, wider column, calmer spacing. */
  immersive: boolean;
  /** Current scene — drives the stage particle effects. */
  scene: SceneState;
  fxEnabled: boolean;
  /** Story memory — how many older messages the model's record stands in for. */
  memoryEnabled: boolean;
  memoryCovered: number;
  memoryBusy: boolean;
  /** Continuity Guard — the canon's size, whether it is on, and any open conflict. */
  canonSize: number;
  continuityEnabled: boolean;
  continuityBusy: boolean;
  continuityReports: ContinuityReport[];
  /** Dramatic tracker — unresolved threads are surfaced as a calm count, not an alert. */
  activeThreadCount: number;
  pinnedThreadCount: number;
  threadsEnabled: boolean;
  threadsBusy: boolean;
  /** Sightlines — how much is being withheld, and any leak in the latest reply. */
  withheldCount: number;
  sightlinesEnabled: boolean;
  sightlinesBusy: boolean;
  sightlineLeaks: SightlineLeak[];
  leakSpeaker: string;
  theme: Theme;
  onToggleImmersive: () => void;
  onToggleFormatting: (enabled: boolean) => void;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onVoiceChange: (voice: string) => void;
  onToggleContext: (enabled: boolean) => void;
  onToggleImageGen: (enabled: boolean) => void;
  onToggleStage: (enabled: boolean) => void;
  onClearChat: () => void;
  onStopAudio: () => void;
  onShowSettings: () => void;
  onToggleLeftPanel: () => void;
  onToggleRealtimePanel: () => void;
  onEditMessage: (index: number) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDeleteMessage: (index: number) => void;
  onRewindToMessage: (index: number) => void;
  onResendMessage: () => void;
  onSwipe: (index: number, direction: "left" | "right") => void;
  onPlayMessage: (text: string, index: number) => void;
  onToggleBookmark: (index: number) => void;
  onEditingTextChange: (text: string) => void;
  onShowLorebook: () => void;
  onShowMemory: () => void;
  onShowCanon: () => void;
  onShowThreads: () => void;
  onShowSightlines: () => void;
  onResolveContinuity: (action: "reroll" | "accept" | "dismiss") => void;
  onResolveSightline: (action: "reroll" | "accept" | "dismiss") => void;
}

export function ConversationPanel({
  conversationHistory,
  historyRevision,
  userName,
  assistantName,
  showLeftPanel,
  connected,
  ttsEngine,
  outputMode,
  currentVoice,
  availableVoices,
  useContext,
  includeImageGen,
  playingMessageIndex,
  editingMessage,
  showRealtimePanel,
  userCharacterImage,
  assistantCharacterImage,
  inSceneCharacters,
  selectedCharacterId,
  rigAssets,
  stageEnabled,
  stageDirective,
  assistantMood,
  streamingText,
  isStreaming,
  formattingEnabled,
  ambient,
  immersive,
  scene,
  fxEnabled,
  memoryEnabled,
  memoryCovered,
  memoryBusy,
  canonSize,
  continuityEnabled,
  continuityBusy,
  continuityReports,
  activeThreadCount,
  pinnedThreadCount,
  threadsEnabled,
  threadsBusy,
  withheldCount,
  sightlinesEnabled,
  sightlinesBusy,
  sightlineLeaks,
  leakSpeaker,
  theme,
  onToggleImmersive,
  onToggleFormatting,
  onTtsEngineChange,
  onVoiceChange,
  onToggleContext,
  onToggleImageGen,
  onToggleStage,
  onClearChat,
  onStopAudio,
  onShowSettings,
  onToggleLeftPanel,
  onToggleRealtimePanel,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onDeleteMessage,
  onRewindToMessage,
  onResendMessage,
  onSwipe,
  onPlayMessage,
  onToggleBookmark,
  onEditingTextChange,
  onShowLorebook,
  onShowMemory,
  onShowCanon,
  onShowThreads,
  onShowSightlines,
  onResolveContinuity,
  onResolveSightline
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const historyScrollRef = useRef<{ length: number; tail: string; revision: number } | null>(null);
  const jumpTimerRef = useRef<number | null>(null);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const followSuspendedUntilRef = useRef(0);
  const navigatorOpenerRef = useRef<HTMLElement | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [jumpTargetIndex, setJumpTargetIndex] = useState<number | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const bookmarkCount = conversationHistory.filter((message) => message.bookmarked).length;

  const openNavigator = () => {
    if (navigatorOpen) {
      const search = document.querySelector<HTMLInputElement>('[aria-label="Search this story"]');
      search?.focus();
      search?.select();
      return;
    }
    // Do not stack this dialog behind another modal.
    if (document.querySelector(".modal-scrim")) return;
    navigatorOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setNavigatorOpen(true);
  };

  const closeNavigator = () => {
    setNavigatorOpen(false);
    window.requestAnimationFrame(() => navigatorOpenerRef.current?.focus());
  };

  const scrollToLatest = () => {
    programmaticScrollRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (programmaticScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, 500);
  };

  // Auto-scroll for actual story progress, but stay put when someone bookmarks
  // or navigates into an older passage. Scrolling back near the bottom resumes
  // live following; loading a different story always starts at its latest turn.
  useEffect(() => {
    const tailMessage = conversationHistory[conversationHistory.length - 1];
    const tail = tailMessage
      ? [
          new Date(tailMessage.timestamp).getTime(),
          tailMessage.role,
          tailMessage.speaker || "",
          tailMessage.content,
          tailMessage.image
            ? `${tailMessage.image.length}:${tailMessage.image.slice(-24)}`
            : "",
        ].join("|")
      : "";
    const previous = historyScrollRef.current;
    const storyReplaced = previous === null || previous.revision !== historyRevision;
    const storyAdvanced = previous === null
      || conversationHistory.length > previous.length
      || (conversationHistory.length >= previous.length && tail !== previous.tail);

    const storyCleared = previous !== null
      && previous.length > 0
      && conversationHistory.length === 0;

    if (storyReplaced || storyCleared) {
      setAutoFollow(true);
      if (conversationHistory.length > 0) scrollToLatest();
    } else if (autoFollow && (storyAdvanced || isStreaming)) {
      scrollToLatest();
    }
    historyScrollRef.current = { length: conversationHistory.length, tail, revision: historyRevision };
  }, [conversationHistory, historyRevision, streamingText, isStreaming, autoFollow]);

  const handleStoryScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (Date.now() < followSuspendedUntilRef.current) {
      setAutoFollow(false);
      return;
    }
    if (programmaticScrollRef.current) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
    setAutoFollow((current) => current === nearBottom ? current : nearBottom);
  };

  const handleManualScrollIntent = () => {
    programmaticScrollRef.current = false;
    if (programmaticScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handleKeyboardScrollIntent = (event: globalThis.KeyboardEvent) => {
      if (
        event.altKey
        || event.ctrlKey
        || event.metaKey
        || !["ArrowUp", "PageUp", "Home"].includes(event.key)
        || document.querySelector(".modal-scrim")
      ) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.matches("input, textarea, select")
        || target?.isContentEditable
        || target?.closest(".action-menu-panel")
      ) {
        return;
      }
      followSuspendedUntilRef.current = Date.now() + 300;
      handleManualScrollIntent();
      setAutoFollow(false);
    };
    window.addEventListener("keydown", handleKeyboardScrollIntent);
    return () => window.removeEventListener("keydown", handleKeyboardScrollIntent);
    // The handler only touches stable state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToLatest = () => {
    followSuspendedUntilRef.current = 0;
    setAutoFollow(true);
    scrollToLatest();
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        conversationHistory.length > 0
        && (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === "f"
      ) {
        if (!navigatorOpen && document.querySelector(".modal-scrim")) return;
        event.preventDefault();
        openNavigator();
      } else if (navigatorOpen && event.key === "Escape") {
        event.preventDefault();
        closeNavigator();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
    // openNavigator/closeNavigator intentionally follow the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationHistory.length, navigatorOpen]);

  useEffect(() => () => {
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    if (programmaticScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
  }, []);

  const jumpToMessage = (index: number) => {
    setNavigatorOpen(false);
    followSuspendedUntilRef.current = Date.now() + 900;
    handleManualScrollIntent();
    setAutoFollow(false);
    setJumpTargetIndex(index);
    window.requestAnimationFrame(() => {
      const destination = messageRefs.current[index];
      destination?.scrollIntoView({ behavior: "smooth", block: "center" });
      destination?.focus({ preventScroll: true });
    });
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = window.setTimeout(() => {
      setJumpTargetIndex(null);
      jumpTimerRef.current = null;
    }, 2200);
  };

  return (
    <>
      {/* Title bar — the story's marquee */}
      <div className="conversation-titlebar" style={{
        padding: "10px 20px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          className="icon-btn"
          onClick={onToggleLeftPanel}
          data-active={showLeftPanel}
          title={showLeftPanel ? "Hide controls panel" : "Show controls panel"}
        >
          <IconPanelLeft size={16} />
        </button>

        <div className="conversation-title-copy" style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flex: 1 }}>
          <h1 style={{
            margin: 0,
            fontSize: 15.5,
            fontWeight: 600,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.prose,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {assistantName || "Untitled story"}
          </h1>

          {/* Live mood — the character's emotional weather */}
          {assistantMood && (
            <span
              title={`${assistantName} feels ${assistantMood}`}
              className="fade-up conversation-mood"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 9px",
                borderRadius: 999,
                background: `color-mix(in srgb, ${moodToColor(assistantMood)} 14%, transparent)`,
                fontSize: 11.5,
                fontWeight: 500,
                color: theme.colors.textSecondary,
                whiteSpace: "nowrap",
                textTransform: "capitalize",
              }}
            >
              <span style={{ fontSize: 13 }}>{moodToEmoji(assistantMood)}</span>
              {assistantMood}
            </span>
          )}

          <span className="meta-mono conversation-message-count" style={{ whiteSpace: "nowrap" }}>
            {conversationHistory.length} messages
          </span>
        </div>

        <div className="toolbar-action-cluster">
          {/* Search stays one click away; everything else is grouped by intent. */}
          <button
            className="icon-btn"
            data-active={navigatorOpen}
            disabled={conversationHistory.length === 0}
            onClick={openNavigator}
            title={
              bookmarkCount > 0
                ? `Story navigator — search or browse ${bookmarkCount} bookmarked ${bookmarkCount === 1 ? "moment" : "moments"} (Ctrl/Cmd+F)`
                : "Story navigator — search and bookmark moments (Ctrl/Cmd+F)"
            }
            aria-label="Open Story navigator"
          >
            <IconSearch size={16} />
          </button>

          <ActionMenu
            label="Story"
            icon={<IconBookOpen size={15} />}
            active={continuityReports.length > 0 || sightlineLeaks.length > 0}
            panelWidth={310}
            title="Story tools, memory, canon, and settings"
          >
            {(closeMenu) => (
              <>
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconThreads size={15} className={threadsBusy ? "spin" : undefined} />}
                  label={threadsBusy ? "Finding story threads…" : "Story threads"}
                  status={threadsEnabled}
                  description={
                    threadsBusy
                      ? "Reading the latest turns for what remains unresolved"
                      : !threadsEnabled
                        ? `Tracking is off · ${activeThreadCount} still in play`
                        : activeThreadCount > 0
                          ? `${activeThreadCount} in play${pinnedThreadCount > 0 ? ` · ${pinnedThreadCount} pinned` : ""}`
                          : "Promises, mysteries, goals, and tensions"
                  }
                  trailing={activeThreadCount > 0 ? activeThreadCount : undefined}
                  restoreFocusOnClose={false}
                  onSelect={onShowThreads}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconBookOpen size={15} />}
                  label="Lorebook"
                  description="People, places, and world information"
                  restoreFocusOnClose={false}
                  onSelect={onShowLorebook}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconBrain size={15} className={memoryBusy ? "spin" : undefined} />}
                  label={memoryBusy ? "Story memory — updating…" : "Story memory"}
                  status={memoryEnabled}
                  description={
                    memoryCovered > 0
                      ? `Remembering ${memoryCovered} earlier ${memoryCovered === 1 ? "message" : "messages"}`
                      : "Review the long-term record of this story"
                  }
                  trailing={memoryCovered > 0 ? memoryCovered : undefined}
                  restoreFocusOnClose={false}
                  onSelect={onShowMemory}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconShield size={15} className={continuityBusy ? "spin" : undefined} />}
                  label={continuityReports.length > 0 ? "Continuity needs attention" : "Story canon"}
                  status={continuityEnabled}
                  description={
                    continuityEnabled
                      ? `${canonSize} established ${canonSize === 1 ? "fact" : "facts"} guarded`
                      : "Catch contradictions in established facts"
                  }
                  trailing={continuityReports.length > 0 ? continuityReports.length : undefined}
                  restoreFocusOnClose={false}
                  onSelect={onShowCanon}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconEye size={15} className={sightlinesBusy ? "spin" : undefined} />}
                  label={sightlineLeaks.length > 0 ? "Someone knew too much" : "Sightlines"}
                  status={sightlinesEnabled}
                  description={
                    withheldCount > 0
                      ? `${withheldCount} ${withheldCount === 1 ? "thing" : "things"} withheld from someone`
                      : "Keep each character to what they actually know"
                  }
                  trailing={
                    sightlineLeaks.length > 0
                      ? sightlineLeaks.length
                      : withheldCount > 0 ? withheldCount : undefined
                  }
                  restoreFocusOnClose={false}
                  onSelect={onShowSightlines}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconSliders size={15} />}
                  label="Story settings"
                  description="Scenario, system prompt, and author's note"
                  restoreFocusOnClose={false}
                  onSelect={onShowSettings}
                />
              </>
            )}
          </ActionMenu>

          <ActionMenu
            label="View"
            icon={<IconFilm size={15} />}
            active={immersive}
            panelWidth={310}
            title="Stage and reading options"
          >
            {(closeMenu) => (
              <>
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconSparkles size={15} />}
                  label="Animated stage"
                  description="Show character rigs and acting cues"
                  active={stageEnabled}
                  closeOnSelect={false}
                  onSelect={() => onToggleStage(!stageEnabled)}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconItalic size={15} />}
                  label="Rich prose formatting"
                  description="Style actions and dialogue as story prose"
                  active={formattingEnabled}
                  closeOnSelect={false}
                  onSelect={() => onToggleFormatting(!formattingEnabled)}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconFilm size={15} />}
                  label="Cinematic reading"
                  description="Focused book typography and living backdrop"
                  active={immersive}
                  closeOnSelect={false}
                  onSelect={onToggleImmersive}
                />
              </>
            )}
          </ActionMenu>

          {outputMode === "voice" && (
            <ActionMenu
              label="Voice"
              icon={<IconVolume size={15} />}
              panelRole="dialog"
              panelWidth={300}
              active={playingMessageIndex !== null}
              title="Speech engine, voice, and playback"
            >
              {(closeMenu) => (
                <>
                  <div className="action-menu-section">
                    <div className="action-menu-field">
                      <label className="label-caps" htmlFor="toolbar-tts-engine">Speech engine</label>
                      <select
                        id="toolbar-tts-engine"
                        className="input"
                        value={ttsEngine}
                        onChange={(event) => onTtsEngineChange(event.target.value as TtsEngine)}
                        disabled={!connected}
                      >
                        <option value="piper">Piper</option>
                        <option value="chatterbox">Chatterbox</option>
                        <option value="soprano">Soprano</option>
                      </select>
                    </div>
                    <div className="action-menu-field">
                      <label className="label-caps" htmlFor="toolbar-voice">Voice</label>
                      <select
                        id="toolbar-voice"
                        className="input"
                        value={currentVoice}
                        onChange={(event) => onVoiceChange(event.target.value)}
                        disabled={!connected}
                      >
                        {availableVoices.map((voice) => (
                          <option key={voice.name} value={voice.name}>{voice.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="action-menu-section">
                    <button
                      type="button"
                      className="action-menu-item danger"
                      disabled={!connected}
                      onClick={() => {
                        onStopAudio();
                        closeMenu();
                      }}
                    >
                      <span className="action-menu-item-icon"><IconStop size={15} /></span>
                      <span className="action-menu-item-copy">
                        <span className="action-menu-item-label">Stop audio</span>
                        <span className="action-menu-item-description">End current speech playback</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </ActionMenu>
          )}

          <ActionMenu
            label="More"
            icon={<IconMoreH size={15} />}
            panelWidth={310}
            title="Conversation and media options"
          >
            {(closeMenu) => (
              <>
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconMessage size={15} />}
                  label="Conversation context"
                  description="Let the model see earlier messages"
                  active={useContext}
                  disabled={!connected}
                  closeOnSelect={false}
                  onSelect={() => onToggleContext(!useContext)}
                />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconImage size={15} />}
                  label="Image generation"
                  description="Allow the character to create images"
                  active={includeImageGen}
                  disabled={!connected}
                  closeOnSelect={false}
                  onSelect={() => onToggleImageGen(!includeImageGen)}
                />
                <MenuSeparator />
                <MenuAction
                  closeMenu={closeMenu}
                  icon={<IconEraser size={15} />}
                  label="Clear conversation"
                  description="Remove every message from the current story"
                  danger
                  disabled={!connected || conversationHistory.length === 0}
                  onSelect={onClearChat}
                />
              </>
            )}
          </ActionMenu>

          <button
            className="icon-btn"
            data-active={showRealtimePanel}
            onClick={onToggleRealtimePanel}
            title={showRealtimePanel ? "Hide voice & status panel" : "Show voice & status panel"}
            aria-label={showRealtimePanel ? "Hide voice and status panel" : "Show voice and status panel"}
          >
            <IconPanelRight size={16} />
          </button>
        </div>
      </div>

      <StoryNavigator
        show={navigatorOpen}
        messages={conversationHistory}
        userName={userName}
        assistantName={assistantName}
        theme={theme}
        onClose={closeNavigator}
        onJump={jumpToMessage}
        onToggleBookmark={onToggleBookmark}
      />

      {/* The stage — scene light, weather, and the story itself */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: ambient || theme.colors.background,
        transition: "background 1.2s ease",
        position: "relative",
      }}>
        <SceneFX
          time={scene.time}
          weather={scene.weather}
          themeName={theme.name}
          enabled={fxEnabled}
        />
        {stageEnabled && (
          <RigStage
            characters={inSceneCharacters}
            selectedId={selectedCharacterId}
            rigAssets={rigAssets}
            conversationHistory={conversationHistory}
            assistantMood={assistantMood}
            stageDirective={stageDirective}
            isStreaming={isStreaming}
            immersive={immersive}
            theme={theme}
          />
        )}
        <div
          ref={scrollContainerRef}
          role="region"
          aria-label="Story transcript"
          tabIndex={0}
          onScroll={handleStoryScroll}
          onWheel={handleManualScrollIntent}
          onPointerDown={handleManualScrollIntent}
          style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          overflowY: "auto",
          padding: immersive ? "30px 24px" : "18px 22px",
        }}>
        <div style={{
          maxWidth: immersive ? 860 : "none",
          margin: immersive ? "0 auto" : undefined,
          position: "relative",
          zIndex: 1,
        }}>
        {conversationHistory.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "72px 20px",
            color: theme.colors.textTertiary,
          }}>
            <div style={{
              fontFamily: theme.fonts.prose,
              fontSize: 26,
              fontStyle: "italic",
              color: theme.colors.textSecondary,
              marginBottom: 10,
            }}>
              The stage is set.
            </div>
            <p style={{ fontSize: 13.5, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
              {connected
                ? "Say something below to begin — or set the scene above, pick your cast, and let the story find you."
                : "Connect in the left panel to raise the curtain."}
            </p>
            {connected && (
              <div style={{ marginTop: 22, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                <span className="chip" style={{ cursor: "default" }}><IconFeather size={13} /> Narrate a scene opening</span>
                <span className="chip" style={{ cursor: "default" }}>Import a character card</span>
                <span className="chip" style={{ cursor: "default" }}>Set time, weather &amp; place</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {conversationHistory.map((msg, idx) => (
              <div
                key={idx}
                ref={(node) => { messageRefs.current[idx] = node; }}
                className="story-message-anchor"
                data-jump-target={jumpTargetIndex === idx}
                tabIndex={-1}
              >
                <MessageItem
                  message={msg}
                  index={idx}
                  userName={userName}
                  assistantName={assistantName}
                  isLast={idx === conversationHistory.length - 1}
                  conversationLength={conversationHistory.length}
                  playingMessageIndex={playingMessageIndex}
                  editingMessage={editingMessage}
                  userCharacterImage={userCharacterImage}
                  assistantCharacterImage={assistantCharacterImage}
                  formattingEnabled={formattingEnabled}
                  immersive={immersive}
                  continuityReports={
                    idx === conversationHistory.length - 1 && msg.role === "assistant"
                      ? continuityReports
                      : undefined
                  }
                  sightlineLeaks={
                    idx === conversationHistory.length - 1 && msg.role === "assistant"
                      ? sightlineLeaks
                      : undefined
                  }
                  leakSpeaker={leakSpeaker}
                  theme={theme}
                  onResolveContinuity={onResolveContinuity}
                  onResolveSightline={onResolveSightline}
                  onEdit={onEditMessage}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onDelete={onDeleteMessage}
                  onRewind={onRewindToMessage}
                  onResend={onResendMessage}
                  onSwipe={onSwipe}
                  onPlay={onPlayMessage}
                  onToggleBookmark={onToggleBookmark}
                  onEditingTextChange={onEditingTextChange}
                />
              </div>
            ))}
            {isStreaming && (
              <StreamingBubble
                assistantName={assistantName}
                assistantCharacterImage={assistantCharacterImage}
                text={streamingText}
                mood={assistantMood}
                formattingEnabled={formattingEnabled}
                immersive={immersive}
                theme={theme}
              />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
        </div>
        </div>
        {!autoFollow && conversationHistory.length > 0 && (
          <button
            type="button"
            className="chip story-jump-latest"
            onClick={jumpToLatest}
            title="Return to the latest message and resume live scrolling"
          >
            <IconChevronDown size={14} />
            Latest
          </button>
        )}
      </div>
    </>
  );
}
