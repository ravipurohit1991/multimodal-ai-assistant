import React, { useEffect, useMemo, useRef, useState } from "react";
import { startMic } from "./audio/mic";
import { PcmPlayer } from "./audio/player";
import { MicVAD } from "@ricky0123/vad-web";
import { ServerMsg, Message, VoiceInfo, InputMode, OutputMode, TtsEngine } from "./types";
import { ControlSidebar } from "./components/ControlSidebar";
import { ConversationPanel } from "./components/ConversationPanel";
import { ModelStatusPanel } from "./components/ModelStatusPanel";
import { RealtimeStatusPanel } from "./components/RealtimeStatusPanel";
import { SettingsModal } from "./components/SettingsModal";
import { DebugModal } from "./components/DebugModal";
import { TextInputArea } from "./components/TextInputArea";
import { CharacterProfileModal } from "./components/CharacterProfileModal";
import { getTheme, Theme } from "./theme";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");

  // Theme state
  const [themeName, setThemeName] = useState<'light' | 'dark'>('light');
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  // Conversation history
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [showJsonPayload, setShowJsonPayload] = useState(false);
  const [showRealtimePanel, setShowRealtimePanel] = useState(true);
  const [showModelStatus, setShowModelStatus] = useState(false);
  const [showRealtimeUser, setShowRealtimeUser] = useState(true);
  const [showRealtimeAssistant, setShowRealtimeAssistant] = useState(true);
  const [lastLlmPayload, setLastLlmPayload] = useState<any>(null);
  const [lastLlmResponse, setLastLlmResponse] = useState<any>(null);
  const currentAssistantTextRef = useRef<string>("");
  const [editingMessage, setEditingMessage] = useState<{ index: number; text: string } | null>(null);

  // Roleplaying settings
  const [userName, setUserName] = useState("You");
  const [assistantName, setAssistantName] = useState("Assistant");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful voice assistant. Keep answers conversational and concise.");
  const [characterDef, setCharacterDef] = useState("");
  const [scenario, setScenario] = useState("");
  const [personality, setPersonality] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [textInput, setTextInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [outputMode, setOutputMode] = useState<OutputMode>("voice");
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [useContext, setUseContext] = useState(true);
  const [includeImageGen, setIncludeImageGen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Character images
  const [userCharacterImage, setUserCharacterImage] = useState<string | null>(null);
  const [assistantCharacterImage, setAssistantCharacterImage] = useState<string | null>(null);
  const [showUserCharacterModal, setShowUserCharacterModal] = useState(false);
  const [showAssistantCharacterModal, setShowAssistantCharacterModal] = useState(false);
  const [userCharacterPath, setUserCharacterPath] = useState("");
  const [assistantCharacterPath, setAssistantCharacterPath] = useState("");

  // Call mode state
  const [inCall, setInCall] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const vadRef = useRef<MicVAD | null>(null);
  const callAudioBufferRef = useRef<Int16Array[]>([]);
  const isSendingAudioRef = useRef(false);

  // Voice & Model settings
  const [llmHost, setLlmHost] = useState("http://localhost:11434");
  const [llmModel, setLlmModel] = useState("glm-4.7:cloud");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
  const [currentVoice, setCurrentVoice] = useState("en_GB-jenny_dioco-medium");
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>("piper");

  const wsRef = useRef<WebSocket | null>(null);
  const micStopRef = useRef<null | (() => Promise<void>)>(null);

  const player = useMemo(() => new PcmPlayer(), []);
  const pendingAudioSr = useRef<number | null>(null);

  const connect = () => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws");
    ws.binaryType = "arraybuffer";
    ws.onopen = () => setConnected(true);

    ws.onmessage = async (ev) => {
      if (typeof ev.data === "string") {
        const msg: ServerMsg = JSON.parse(ev.data);
        if (msg.type === "config") {
          // Receive initial configuration from backend
          if (msg.tts_engine) setTtsEngine(msg.tts_engine as TtsEngine);
          if (msg.llm_model) setLlmModel(msg.llm_model);
          if (msg.output_mode && (msg.output_mode === "voice" || msg.output_mode === "text")) {
            setOutputMode(msg.output_mode as OutputMode);
          }
        }
        if (msg.type === "ack_recording") setRecording(msg.recording);
        if (msg.type === "transcript") {
          setTranscript(msg.text);
          if (msg.text) {
            setConversationHistory(prev => [...prev, { role: "user", content: msg.text, timestamp: new Date() }]);
          }
        }
        if (msg.type === "assistant_start") {
          setAssistantText("");
          currentAssistantTextRef.current = "";
        }
        if (msg.type === "assistant_delta") {
          currentAssistantTextRef.current += msg.delta;
          setAssistantText(currentAssistantTextRef.current);
        }
        if (msg.type === "assistant_end") {
          const finalText = currentAssistantTextRef.current;
          if (finalText) {
            setConversationHistory(prev => [...prev, { role: "assistant", content: finalText, timestamp: new Date() }]);
            // Construct the received response object
            setLastLlmResponse({
              role: "assistant",
              content: finalText,
              timestamp: new Date().toISOString(),
              model: llmModel
            });
          }
          currentAssistantTextRef.current = "";
        }
        if (msg.type === "image_generating") {
          console.log(`🎨 Generating image: ${msg.prompt}`);
          setAssistantText(current => current + "\n[Generating image...]");
        }
        if (msg.type === "image_generated") {
          console.log(`✅ Image generated: ${msg.prompt}`);
          // Add image to the last assistant message or create new one
          setConversationHistory(prev => {
            if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
              // Update last assistant message with image
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                image: msg.image,
                imagePrompt: msg.prompt
              };
              return updated;
            } else {
              // Create new assistant message with image
              return [...prev, {
                role: "assistant",
                content: `[Image: ${msg.prompt}]`,
                timestamp: new Date(),
                image: msg.image,
                imagePrompt: msg.prompt
              }];
            }
          });
        }
        if (msg.type === "image_error") {
          console.error(`❌ Image generation failed: ${msg.error}`);
          setAssistantText(current => current + `\n[Image generation failed: ${msg.error}]`);
        }
        if (msg.type === "tts_engine_changed") {
          // TTS engine changed, refetch available voices
          console.log(`TTS engine changed to: ${msg.tts_engine}`);
          fetchAvailableVoices();
        }
        if (msg.type === "audio_start") pendingAudioSr.current = msg.sample_rate;
        if (msg.type === "llm_payload") {
          setLastLlmPayload(msg.payload);
          // Store the actual model being used from the payload
          if (msg.payload && msg.payload.model) {
            setLlmModel(msg.payload.model);
          }
        }
        if (msg.type === "interrupted") {
          player.resetQueue();
          setAssistantText((s) => s + "\n[interrupted]\n");
        }
        if (msg.type === "chat_cleared") {
          setConversationHistory([]);
        }
      } else {
        // binary audio chunk
        const sr = pendingAudioSr.current ?? 24000;
        await player.playPcm16le(ev.data, sr);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    wsRef.current = ws;
  };

  const disconnect = async () => {
    if (micStopRef.current) await micStopRef.current();
    micStopRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRecording(false);
  };

  const sendJson = (obj: any) => wsRef.current?.send(JSON.stringify(obj));

  const updateSystemPrompt = () => {
    if (!wsRef.current) return;

    // Build system prompt in SillyTavern's story_string style
    // Order: system -> description -> personality -> scenario -> instructions
    let fullPrompt = "";

    // System prompt (base instructions)
    if (systemPrompt.trim()) {
      fullPrompt += `${systemPrompt.trim()}\n\n`;
    }

    // Scenario/Setting
    if (scenario.trim()) {
      fullPrompt += `### Scenario\n${scenario.trim()}\n\n`;
    }

    // Character Description
    if (characterDef.trim()) {
      fullPrompt += `### Character Description\n${characterDef.trim()}\n\n`;
    }

    // Personality
    if (personality.trim()) {
      fullPrompt += `### Personality\n${personality.trim()}\n\n`;
    }

    // User Persona (if needed)
    fullPrompt += `### User\nYou are speaking with ${userName}.`;

    sendJson({ type: "set_system_prompt", content: fullPrompt });
  };

  const handleCharacterUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const data = json.spec === "chara_card_v2" ? json.data : json;

        // Populate fields from character card
        if (data.name) setAssistantName(data.name);
        if (data.description) setCharacterDef(data.description.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.personality) setPersonality(data.personality.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.scenario) setScenario(data.scenario.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.first_mes) setFirstMessage(data.first_mes.replace(/{{char}}/g, data.name).replace(/{{user}}/g, userName));
        if (data.system_prompt) setSystemPrompt(data.system_prompt);

        alert(`Character "${data.name}" loaded successfully!`);
      } catch (error) {
        alert("Failed to parse character file. Please check the format.");
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  const sendTextMessage = () => {
    if (!wsRef.current || (!textInput.trim() && !attachedImage)) return;

    // Display the text immediately in the user box
    setTranscript(textInput || "[Image attached]");

    // Add to history immediately for text mode with optional image
    setConversationHistory(prev => [...prev, {
      role: "user",
      content: textInput || "[Image attached]",
      timestamp: new Date(),
      ...(attachedImage && { image: attachedImage })
    }]);

    // Send to backend for LLM processing with optional image
    wsRef.current.send(JSON.stringify({
      type: "text_message",
      text: textInput,
      image: attachedImage  // Send base64 image if attached
    }));

    setTextInput("");
    setAttachedImage(null);  // Clear attached image after sending
  };

  const clearChat = () => {
    sendJson({ type: "clear_chat" });
    setTranscript("");
    setAssistantText("");
    setConversationHistory([]);
    setLastLlmPayload(null);
    setLastLlmResponse(null);
  };

  const toggleContext = (enabled: boolean) => {
    setUseContext(enabled);
    sendJson({ type: "set_context_mode", enabled });
  };

  const toggleImageGen = (enabled: boolean) => {
    setIncludeImageGen(enabled);
    sendJson({ type: "set_imagegen_mode", enabled });
  };

  const handleUserCharacterImageUpdate = (image: string, path: string) => {
    setUserCharacterImage(image);
    setUserCharacterPath(path);
    if (wsRef.current) {
      sendJson({ type: "set_character_image", character_type: "user", image_path: path });
    }
  };

  const handleAssistantCharacterImageUpdate = (image: string, path: string) => {
    setAssistantCharacterImage(image);
    setAssistantCharacterPath(path);
    if (wsRef.current) {
      sendJson({ type: "set_character_image", character_type: "assistant", image_path: path });
    }
  };

  const loadCharacterImages = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/character/images");
      const data = await response.json();

      if (data.user) {
        setUserCharacterImage(`data:image/png;base64,${data.user.image}`);
        setUserCharacterPath(data.user.path);
      }

      if (data.assistant) {
        setAssistantCharacterImage(`data:image/png;base64,${data.assistant.image}`);
        setAssistantCharacterPath(data.assistant.path);
      }
    } catch (error) {
      console.error("Error loading character images:", error);
    }
  };

  const updateLlmModel = (model: string) => {
    setLlmModel(model);
    sendJson({ type: "set_llm_model", model });
  };

  const updateLlmHost = (hostUrl: string) => {
    setLlmHost(hostUrl);
    sendJson({ type: "set_llm_host", host: hostUrl });
  };

  const changeVoice = (voice: string) => {
    setCurrentVoice(voice);
    sendJson({ type: "set_voice", voice });
  };

  const toggleOutputMode = (mode: "voice" | "text") => {
    setOutputMode(mode);
    sendJson({ type: "set_output_mode", mode });
  };



  const handleDeleteMessage = (index: number) => {
    const newHistory = conversationHistory.filter((_, i) => i !== index);
    setConversationHistory(newHistory);

    // Sync to backend
    if (wsRef.current) {
      const historyForBackend = newHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      sendJson({ type: "sync_history", history: historyForBackend });
    }
  };

  const handleEditMessage = (index: number) => {
    setEditingMessage({ index, text: conversationHistory[index].content });
  };

  const handleSaveEdit = (index: number) => {
    if (editingMessage) {
      const newHistory = conversationHistory.map((msg, i) =>
        i === index ? { ...msg, content: editingMessage.text } : msg
      );
      setConversationHistory(newHistory);
      setEditingMessage(null);

      // Sync to backend
      if (wsRef.current) {
        const historyForBackend = newHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        sendJson({ type: "sync_history", history: historyForBackend });
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
  };

  const handleRewindToMessage = (index: number) => {
    // Remove all messages after this index
    const newHistory = conversationHistory.slice(0, index + 1);
    setConversationHistory(newHistory);

    // Sync to backend
    if (wsRef.current) {
      const historyForBackend = newHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      sendJson({ type: "sync_history", history: historyForBackend });
    }
  };

  const handleResendMessage = () => {
    // Get the last message (which should be a user message)
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    // Simply resend the message - backend will handle duplicate prevention
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: lastMessage.content
      }));
    }
  };

  const handleRegenerateResponse = () => {
    // Find the last assistant message and remove it
    const lastAssistantIndex = conversationHistory.findLastIndex(msg => msg.role === "assistant");
    if (lastAssistantIndex === -1) return;

    // Remove the last assistant message
    const newHistory = conversationHistory.filter((_, i) => i !== lastAssistantIndex);
    setConversationHistory(newHistory);

    // Find the last user message
    const lastUserMessage = newHistory.findLast(msg => msg.role === "user");
    if (!lastUserMessage) return;

    // Sync history without the assistant message
    if (wsRef.current) {
      const historyForBackend = newHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      sendJson({ type: "sync_history", history: historyForBackend });

      // Resend the last user message to get a new response
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: lastUserMessage.content
      }));
    }
  };

  const handleContinue = () => {
    // Send a continue prompt to the LLM
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "text_message",
        text: "[Continue]"
      }));
    }
  };

  const handlePlayAssistantMessage = async (text: string, index: number) => {
    // If this message is currently playing, stop it
    if (playingMessageIndex === index) {
      player.resetQueue();
      setPlayingMessageIndex(null);
      return;
    }

    try {
      setPlayingMessageIndex(index);
      // Remove emotion tags if present
      const cleanText = text.replace(/\[emotion:\w+\]/g, '');
      // Call backend TTS API to synthesize
      const response = await fetch("http://127.0.0.1:8000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voice: currentVoice
        })
      });
      if (response.ok) {
        const sampleRate = parseInt(response.headers.get("X-Sample-Rate") || "24000");
        const audioData = await response.arrayBuffer();
        // Play the audio with correct sample rate
        await player.playPcm16le(audioData, sampleRate);
      } else {
        console.error("TTS request failed:", response.status);
      }
    } catch (error) {
      console.error("Failed to play message:", error);
    } finally {
      setPlayingMessageIndex(null);
    }
  };

  const fetchAvailableVoices = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/voices");
      const data = await response.json();
      setAvailableVoices(data.voices);
      setCurrentVoice(data.current);
    } catch (error) {
      console.error("Failed to fetch voices:", error);
    }
  };

  const fetchLlmModels = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/llm-models?host=${encodeURIComponent(llmHost)}`);
      const data = await response.json();
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models);
      }
    } catch (error) {
      console.error("Failed to fetch llm models:", error);
    }
  };

  const startRecording = async () => {
    if (!wsRef.current) return;
    sendJson({ type: "interrupt" }); // barge-in: stop the assistant
    player.resetQueue();

    sendJson({ type: "user_audio_start" });
    setRecording(true); // Set recording to true BEFORE starting mic

    const mic = await startMic({
      onPcmChunk: (buf) => {
        // stream binary PCM16 chunks while holding
        if (wsRef.current) {
          wsRef.current.send(buf);
        }
      }
    });
    micStopRef.current = mic.stop;
  };

  const stopRecording = async () => {
    sendJson({ type: "user_audio_end" });
    setRecording(false);
    if (micStopRef.current) await micStopRef.current();
    micStopRef.current = null;
  };

  // Call mode handlers
  const startCall = async () => {
    if (!wsRef.current || inCall) return;

    try {
      setInCall(true);
      setInputMode("call");
      console.log("🔵 Starting call mode with VAD...");

      // Initialize VAD
      const vad = await MicVAD.new({
        onSpeechStart: () => {
          console.log("🎤 Speech started");
          setIsUserSpeaking(true);
          callAudioBufferRef.current = [];
          isSendingAudioRef.current = false;
        },
        onSpeechEnd: async (audio: Float32Array) => {
          console.log("🎤 Speech ended, processing audio...");
          setIsUserSpeaking(false);

          if (isSendingAudioRef.current) return;
          isSendingAudioRef.current = true;

          try {
            // Convert Float32Array to Int16Array (PCM16)
            const pcm16 = new Int16Array(audio.length);
            for (let i = 0; i < audio.length; i++) {
              const s = Math.max(-1, Math.min(1, audio[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send audio to backend for transcription
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log("📤 Sending audio chunk for transcription...");
              sendJson({ type: "user_audio_start" });
              wsRef.current.send(pcm16.buffer);
              sendJson({ type: "user_audio_end" });
            }
          } catch (error) {
            console.error("❌ Error sending audio:", error);
          } finally {
            isSendingAudioRef.current = false;
          }
        },
        onVADMisfire: () => {
          console.log("⚠️ VAD misfire detected");
          setIsUserSpeaking(false);
          isSendingAudioRef.current = false;
        },
        redemptionFrames: 10,
        minSpeechFrames: 5,
        preSpeechPadFrames: 10,
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
      });

      vadRef.current = vad;
      vad.start();
      console.log("✅ Call mode active, VAD listening...");
    } catch (error) {
      console.error("❌ Failed to start call:", error);
      setInCall(false);
      setInputMode("voice");
    }
  };

  const endCall = async () => {
    if (!inCall) return;

    console.log("🔴 Ending call mode...");

    // Stop VAD
    if (vadRef.current) {
      try {
        vadRef.current.pause();
      } catch (error) {
        console.error("Error pausing VAD:", error);
      }
      vadRef.current = null;
    }

    setInCall(false);
    setIsUserSpeaking(false);
    setInputMode("voice");
    callAudioBufferRef.current = [];
    isSendingAudioRef.current = false;

    console.log("✅ Call ended");
  };

  // Cleanup VAD on unmount or disconnect
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        try {
          vadRef.current.pause();
        } catch (error) {
          console.error("Error cleaning up VAD:", error);
        }
        vadRef.current = null;
      }
    };
  }, []);

  // End call when disconnected
  useEffect(() => {
    if (!connected && inCall) {
      // Stop VAD
      if (vadRef.current) {
        try {
          vadRef.current.pause();
        } catch (error) {
          console.error("Error pausing VAD:", error);
        }
        vadRef.current = null;
      }
      setInCall(false);
      setIsUserSpeaking(false);
      setInputMode("voice");
      callAudioBufferRef.current = [];
      isSendingAudioRef.current = false;
    }
  }, [connected, inCall]);

  useEffect(() => {
    if (connected) {
      updateSystemPrompt();
      sendJson({ type: "set_context_mode", enabled: useContext });
      sendJson({ type: "set_imagegen_mode", enabled: includeImageGen });
      sendJson({ type: "set_llm_model", model: llmModel });
      sendJson({ type: "set_llm_host", host: llmHost });
      sendJson({ type: "set_output_mode", mode: outputMode });
      fetchAvailableVoices();
      loadCharacterImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    fetchLlmModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmHost]);

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      height: "100vh",
      display: "flex",
      overflow: "hidden",
      background: theme.colors.background,
      color: theme.colors.textPrimary,
      transition: "background-color 0.3s ease, color 0.3s ease"
    }}>
      {/* Left Sidebar - Controls */}
      <ControlSidebar
        connected={connected}
        llmHost={llmHost}
        llmModel={llmModel}
        availableModels={availableModels}
        outputMode={outputMode}
        ttsEngine={ttsEngine}
        availableVoices={availableVoices}
        currentVoice={currentVoice}
        useContext={useContext}
        includeImageGen={includeImageGen}
        showJsonPayload={showJsonPayload}
        showModelStatus={showModelStatus}
        theme={theme}
        themeName={themeName}
        onConnect={connect}
        onDisconnect={disconnect}
        onLlmHostChange={updateLlmHost}
        onLlmModelChange={updateLlmModel}
        onRefreshModels={fetchLlmModels}
        onOutputModeChange={toggleOutputMode}
        onToggleDebug={() => setShowJsonPayload(!showJsonPayload)}
        onToggleModelStatus={() => setShowModelStatus(!showModelStatus)}
        onThemeChange={(newTheme) => setThemeName(newTheme)}
      />

      {/* Middle - Conversation Panel with Text Input */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: theme.colors.surface
      }}>
        <ConversationPanel
          conversationHistory={conversationHistory}
          userName={userName}
          assistantName={assistantName}
          connected={connected}
          ttsEngine={ttsEngine}
          outputMode={outputMode}
          currentVoice={currentVoice}
          availableVoices={availableVoices}
          useContext={useContext}
          includeImageGen={includeImageGen}
          playingMessageIndex={playingMessageIndex}
          editingMessage={editingMessage}
          showRealtimePanel={showRealtimePanel}
          userCharacterImage={userCharacterImage}
          assistantCharacterImage={assistantCharacterImage}
          theme={theme}
          onTtsEngineChange={(engine) => {
            setTtsEngine(engine);
            sendJson({ type: "set_tts_engine", engine });
            setTimeout(() => fetchAvailableVoices(), 500);
          }}
          onVoiceChange={changeVoice}
          onToggleContext={toggleContext}
          onToggleImageGen={toggleImageGen}
          onClearChat={clearChat}
          onStopAudio={() => {
            player.resetQueue();
            sendJson({ type: "stop_audio" });
            setAssistantText((s) => s + "\n[stopped]\n");
          }}
          onShowSettings={() => setShowSettings(true)}
          onToggleRealtimePanel={() => setShowRealtimePanel(!showRealtimePanel)}
          onEditMessage={handleEditMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDeleteMessage={handleDeleteMessage}
          onRewindToMessage={handleRewindToMessage}
          onResendMessage={handleResendMessage}
          onRegenerateResponse={handleRegenerateResponse}
          onPlayMessage={handlePlayAssistantMessage}
          onEditingTextChange={(text) => setEditingMessage(editingMessage ? { ...editingMessage, text } : null)}
          onShowUserCharacter={() => setShowUserCharacterModal(true)}
          onShowAssistantCharacter={() => setShowAssistantCharacterModal(true)}
        />

        {/* Text Input Area */}
        <TextInputArea
          connected={connected}
          textInput={textInput}
          conversationLength={conversationHistory.length}
          attachedImage={attachedImage}
          theme={theme}
          onTextChange={setTextInput}
          onImageAttach={setAttachedImage}
          onSend={sendTextMessage}
          onContinue={handleContinue}
        />
      </div>

      {/* Right Panel - Real-time Status */}
      <RealtimeStatusPanel
        show={showRealtimePanel}
        connected={connected}
        recording={recording}
        inCall={inCall}
        isUserSpeaking={isUserSpeaking}
        userName={userName}
        assistantName={assistantName}
        transcript={transcript}
        assistantText={assistantText}
        showRealtimeUser={showRealtimeUser}
        showRealtimeAssistant={showRealtimeAssistant}
        theme={theme}
        onStartCall={startCall}
        onEndCall={endCall}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onToggleRealtimeUser={() => setShowRealtimeUser(!showRealtimeUser)}
        onToggleRealtimeAssistant={() => setShowRealtimeAssistant(!showRealtimeAssistant)}
      />

      {/* Model Status Panel */}
      <ModelStatusPanel show={showModelStatus} theme={theme} />

      {/* Settings Modal */}
      <SettingsModal
        show={showSettings}
        userName={userName}
        assistantName={assistantName}
        systemPrompt={systemPrompt}
        scenario={scenario}
        characterDef={characterDef}
        personality={personality}
        connected={connected}
        theme={theme}
        onClose={() => setShowSettings(false)}
        onUserNameChange={setUserName}
        onAssistantNameChange={setAssistantName}
        onSystemPromptChange={setSystemPrompt}
        onScenarioChange={setScenario}
        onCharacterDefChange={setCharacterDef}
        onPersonalityChange={setPersonality}
        onCharacterUpload={handleCharacterUpload}
        onUpdateSystemPrompt={updateSystemPrompt}
      />

      {/* Debug Info Modal */}
      <DebugModal
        show={showJsonPayload}
        lastLlmPayload={lastLlmPayload}
        lastLlmResponse={lastLlmResponse}
        theme={theme}
        onClose={() => setShowJsonPayload(false)}
      />

      {/* Character Profile Modals */}
      <CharacterProfileModal
        isOpen={showUserCharacterModal}
        onClose={() => setShowUserCharacterModal(false)}
        characterType="user"
        currentImage={userCharacterImage}
        theme={theme}
        onImageUpdate={handleUserCharacterImageUpdate}
      />

      <CharacterProfileModal
        isOpen={showAssistantCharacterModal}
        onClose={() => setShowAssistantCharacterModal(false)}
        characterType="assistant"
        currentImage={assistantCharacterImage}
        theme={theme}
        onImageUpdate={handleAssistantCharacterImageUpdate}
      />
    </div>
  );
}
