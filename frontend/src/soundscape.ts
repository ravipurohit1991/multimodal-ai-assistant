import { SceneTime, SceneWeather } from "./types";

/**
 * Soundscape — synthesized scene ambience.
 *
 * Everything is generated with WebAudio (filtered noise, oscillators); no
 * audio assets, nothing fetched — in keeping with the app running fully
 * locally. The active layer follows the scene: rain, storm (rain + rolling
 * thunder), wind, a soft snow hush, and crickets on clear nights. All layers
 * are deliberately quiet — ambience, not soundtrack.
 */

type LayerName = "rain" | "storm" | "wind" | "hush" | "crickets" | "";

function noiseBuffer(ctx: AudioContext, seconds = 2, brown = false): AudioBuffer {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, seconds * rate, rate);
  const data = buf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      // Integrated (brown) noise — deep rumble base for wind/thunder.
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layerNodes: AudioNode[] = [];
  private timers: number[] = [];
  private current: LayerName = "";
  private enabled = false;
  private volume = 0.5;
  private scene: { time: SceneTime; weather: SceneWeather } = { time: "", weather: "" };

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.1);
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.stopLayer();
      // Suspend so the audio thread goes fully quiet.
      this.ctx?.suspend().catch(() => {});
    } else {
      this.ctx?.resume().catch(() => {});
      this.apply();
    }
  }

  update(scene: { time: SceneTime; weather: SceneWeather }) {
    this.scene = scene;
    if (this.enabled) this.apply();
  }

  dispose() {
    this.stopLayer();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }

  // ----- internals -----

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      this.master.connect(this.ctx.destination);
    }
    this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private layerFor(scene: { time: SceneTime; weather: SceneWeather }): LayerName {
    switch (scene.weather) {
      case "rain": return "rain";
      case "storm": return "storm";
      case "wind": return "wind";
      case "snow": return "hush";
      case "fog": return "hush";
      default: break;
    }
    if (scene.time === "night" && (scene.weather === "" || scene.weather === "clear")) {
      return "crickets";
    }
    return "";
  }

  private apply() {
    const want = this.layerFor(this.scene);
    if (want === this.current) return;
    this.stopLayer();
    this.current = want;
    if (!want) return;

    const ctx = this.ensureCtx();
    if (want === "rain") this.startRain(ctx, 1);
    else if (want === "storm") this.startRain(ctx, 1.35, true);
    else if (want === "wind") this.startWind(ctx, 1);
    else if (want === "hush") this.startWind(ctx, 0.45, 0.06);
    else if (want === "crickets") this.startCrickets(ctx);
  }

  private stopLayer() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    for (const n of this.layerNodes) {
      try {
        if (n instanceof AudioBufferSourceNode || n instanceof OscillatorNode) n.stop();
      } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* detached */ }
    }
    this.layerNodes = [];
    this.current = "";
  }

  private startRain(ctx: AudioContext, intensity: number, thunder = false) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2);
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;

    const gain = ctx.createGain();
    gain.gain.value = 0.055 * intensity;

    // A slow LFO gives the shower a natural swell.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.014 * intensity;
    lfo.connect(lfoGain).connect(gain.gain);

    src.connect(hp).connect(lp).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    this.layerNodes.push(src, hp, lp, gain, lfo, lfoGain);

    if (thunder) this.scheduleThunder(ctx);
  }

  private scheduleThunder(ctx: AudioContext) {
    const roll = () => {
      if (this.current !== "storm") return;
      const dur = 2 + Math.random() * 2.5;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, Math.ceil(dur), true);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(160, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + dur);
      const g = ctx.createGain();
      const peak = 0.16 + Math.random() * 0.2;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.12 + Math.random() * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(lp).connect(g).connect(this.master!);
      src.start();
      src.stop(ctx.currentTime + dur + 0.1);
      src.onended = () => { try { src.disconnect(); lp.disconnect(); g.disconnect(); } catch { /* ok */ } };
      this.timers.push(window.setTimeout(roll, 6000 + Math.random() * 18000));
    };
    this.timers.push(window.setTimeout(roll, 1500 + Math.random() * 5000));
  }

  private startWind(ctx: AudioContext, intensity: number, baseGain = 0.1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 3, true);
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 320;
    bp.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = baseGain * intensity;

    // Two slow LFOs — one breathes the volume, one bends the pitch of the gusts.
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.07;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = baseGain * 0.55 * intensity;
    lfo1.connect(lfo1Gain).connect(gain.gain);

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 140;
    lfo2.connect(lfo2Gain).connect(bp.frequency);

    src.connect(bp).connect(gain).connect(this.master!);
    src.start();
    lfo1.start();
    lfo2.start();
    this.layerNodes.push(src, bp, gain, lfo1, lfo1Gain, lfo2, lfo2Gain);
  }

  private startCrickets(ctx: AudioContext) {
    // A cricket chirp = a short trill of high sine pulses; a few of them call
    // back and forth at slightly different pitches.
    const chirper = (freq: number, initialDelay: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(this.master!);
      osc.start();
      this.layerNodes.push(osc, g);

      const chirp = () => {
        if (this.current !== "crickets") return;
        const t0 = ctx.currentTime;
        const pulses = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) {
          const t = t0 + i * 0.062;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.012, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        }
        this.timers.push(window.setTimeout(chirp, 700 + Math.random() * 1600));
      };
      this.timers.push(window.setTimeout(chirp, initialDelay));
    };
    chirper(4300, 300);
    chirper(3800, 1200);
  }
}
