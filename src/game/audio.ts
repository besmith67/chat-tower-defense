/**
 * Procedural sound: every effect and the music loop are synthesized with Web Audio, so the game
 * ships no audio files and needs no licenses. The audio context starts on the first key or click,
 * as browsers require. M mutes; the choice is remembered.
 */

export type Sound =
  | 'pierce' | 'blunt' | 'cold' | 'fire' | 'shock'
  | 'strong' | 'death' | 'leak' | 'build' | 'sell' | 'wave' | 'boss' | 'jam' | 'crowd' | 'deny';

const MUTE_KEY = 'ctd.muted';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<Sound, number>();
  private musicStep = 0;
  private musicTimer: number | null = null;
  private intense = false;
  muted: boolean;

  constructor() {
    this.muted = readMuted();
    const unlock = () => {
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.musicTimer = window.setInterval(() => this.tickMusic(), 60000 / 112 / 2);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts for this session.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Busier music while a wave is running. */
  setIntensity(intense: boolean): void {
    this.intense = intense;
  }

  stop(): void {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }

  play(sound: Sound): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted) return;
    // Rapid-fire sounds are throttled so a full defense does not turn into noise.
    const gap = sound === 'pierce' || sound === 'fire' ? 0.07 : sound === 'death' || sound === 'strong' ? 0.05 : 0.02;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(sound) ?? -1) < gap) return;
    this.lastPlayed.set(sound, now);

    switch (sound) {
      case 'pierce': return this.tone('triangle', 1400, 900, 0.05, 0.12);
      case 'blunt': return this.thump(110, 0.18, 0.5);
      case 'cold': return this.tone('sine', 1800, 2400, 0.25, 0.08, 6);
      case 'fire': return this.hiss(0.12, 1800, 0.12);
      case 'shock': return this.tone('sawtooth', 220, 1800, 0.08, 0.1, 30);
      case 'strong': return this.tone('square', 660, 880, 0.06, 0.06);
      case 'death': return this.tone('square', 520, 140, 0.12, 0.09);
      case 'leak': return this.tone('sawtooth', 200, 70, 0.4, 0.22);
      case 'build': return this.chord([523, 659, 784], 0.12, 0.1);
      case 'sell': return this.chord([784, 523], 0.12, 0.08);
      case 'deny': return this.tone('square', 160, 120, 0.12, 0.08);
      case 'wave': return this.chord([392, 523, 659, 784], 0.35, 0.1);
      case 'boss': return this.chord([110, 131, 165], 1.2, 0.2);
      case 'jam': return this.tone('sawtooth', 900, 120, 0.25, 0.1, 40);
      case 'crowd': return this.chord([659, 831, 988], 0.3, 0.1);
    }
  }

  private envelope(peak: number, duration: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this.sfx!);
    return g;
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, peak: number, wobble = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    if (wobble) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = wobble;
      depth.gain.value = from * 0.05;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + duration);
    }
    osc.connect(this.envelope(peak, duration));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private thump(freq: number, duration: number, peak: number): void {
    this.tone('sine', freq * 2, freq * 0.6, duration, peak);
    this.hiss(0.05, 900, peak * 0.3);
  }

  private hiss(duration: number, cutoff: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    src.connect(filter).connect(this.envelope(peak, duration));
    src.start(ctx.currentTime, Math.random() * 0.3);
    src.stop(ctx.currentTime + duration + 0.02);
  }

  private chord(freqs: number[], duration: number, peak: number): void {
    freqs.forEach((f, i) => {
      window.setTimeout(() => this.ctx && this.tone('triangle', f, f, duration, peak / freqs.length * 1.6), i * 45);
    });
  }

  /** A small minor-key loop: bass on every beat, an arpeggio on top, a hat when a wave is running. */
  private tickMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || this.muted) return;
    const step = this.musicStep++ % 32;
    const bar = Math.floor(step / 8) % 4;
    const roots = [110, 87.31, 130.81, 98];
    const t = ctx.currentTime;
    const note = (freq: number, len: number, peak: number, type: OscillatorType) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(this.music!);
      osc.start(t);
      osc.stop(t + len + 0.02);
    };
    if (step % 2 === 0) note(roots[bar], 0.22, 0.5, 'triangle');
    const arp = [1, 1.2, 1.5, 2, 1.5, 1.2, 1, 0.75];
    if (this.intense || step % 2 === 0) note(roots[bar] * 4 * arp[step % 8], 0.12, 0.18, 'square');
    if (this.intense && step % 2 === 1 && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(filter).connect(g).connect(this.music);
      src.start(t);
      src.stop(t + 0.05);
    }
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
