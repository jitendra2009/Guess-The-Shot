/**
 * Procedural sound effects via Web Audio API (no external assets).
 */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
  }

  tone(freq, duration, type = "square", gain = 0.08, when = 0) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
    g.gain.setValueAtTime(gain, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration + 0.05);
  }

  noise(duration = 0.15, gain = 0.06) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  playSelect() {
    this.tone(440, 0.06, "sine", 0.05);
  }

  playConfirm() {
    this.tone(523, 0.08, "sine", 0.06);
    this.tone(659, 0.1, "sine", 0.05, 0.06);
  }

  playShoot() {
    this.noise(0.2, 0.1);
    this.tone(120, 0.15, "sawtooth", 0.07);
    this.tone(80, 0.25, "square", 0.04, 0.05);
  }

  playShield() {
    this.tone(300, 0.2, "triangle", 0.06);
    this.tone(450, 0.25, "sine", 0.04, 0.08);
  }

  playReload() {
    this.tone(200, 0.05, "square", 0.04);
    this.tone(280, 0.05, "square", 0.04, 0.07);
    this.tone(360, 0.08, "square", 0.04, 0.14);
  }

  playRevert() {
    this.tone(600, 0.1, "sine", 0.05);
    this.tone(900, 0.15, "sine", 0.05, 0.08);
    this.tone(1200, 0.2, "sine", 0.04, 0.15);
  }

  playReveal() {
    this.tone(330, 0.12, "sine", 0.05);
    this.tone(415, 0.12, "sine", 0.05, 0.1);
    this.tone(523, 0.2, "sine", 0.06, 0.2);
  }

  playDeath() {
    this.tone(200, 0.4, "sawtooth", 0.08);
    this.tone(100, 0.5, "square", 0.06, 0.15);
    this.noise(0.3, 0.05);
  }

  playWin() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, 0.2, "sine", 0.06, i * 0.12);
    });
  }

  playCancel() {
    this.tone(180, 0.15, "triangle", 0.05);
  }
}

export const audio = new AudioManager();
