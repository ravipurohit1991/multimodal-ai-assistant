export type MicCallbacks = {
  onPcmChunk: (pcm16le: ArrayBuffer) => void;
};

function downsampleTo16k(float32: Float32Array, inRate: number): Int16Array {
  if (inRate === 16000) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) out[i] = Math.max(-1, Math.min(1, float32[i])) * 32767;
    return out;
  }
  const ratio = inRate / 16000;
  const newLen = Math.floor(float32.length / ratio);
  const out = new Int16Array(newLen);
  let offset = 0;
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(offset);
    const sample = float32[idx] ?? 0;
    out[i] = Math.max(-1, Math.min(1, sample)) * 32767;
    offset += ratio;
  }
  return out;
}

export async function startMic(cb: MicCallbacks) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessorNode is deprecated but simplest for prototypes.
  const proc = audioCtx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm16 = downsampleTo16k(input, audioCtx.sampleRate);
    cb.onPcmChunk(pcm16.buffer);
  };

  source.connect(proc);
  proc.connect(audioCtx.destination);

  return {
    stop: async () => {
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await audioCtx.close();
    }
  };
}
