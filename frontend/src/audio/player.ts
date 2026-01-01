export class PcmPlayer {
  private ctx: AudioContext;
  private t = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  constructor() {
    this.ctx = new AudioContext();
    this.t = this.ctx.currentTime;
  }

  async playPcm16le(pcm16le: ArrayBuffer, sampleRate: number) {
    const i16 = new Int16Array(pcm16le);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

    const buf = this.ctx.createBuffer(1, f32.length, sampleRate);
    buf.copyToChannel(f32, 0);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    // Track this source so we can stop it later
    this.activeSources.push(src);
    src.onended = () => {
      const idx = this.activeSources.indexOf(src);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };

    const now = this.ctx.currentTime;
    if (this.t < now) this.t = now;
    src.start(this.t);
    this.t += buf.duration;
  }

  resetQueue() {
    // Stop all currently playing/scheduled audio
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
    this.t = this.ctx.currentTime;
  }
}
