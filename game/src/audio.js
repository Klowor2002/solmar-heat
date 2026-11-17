// Solmar Heat — all sound is synthesised with WebAudio: an engine oscillator,
// a siren wail, gunshots, jingles, a horn, a punch thud, and a sunset chord
// loop in A minor, F, C, G. Every call is guarded so audio can never break
// the game — if the context is missing or suspended, the call is a no-op.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.muted = false;
  }

  // Start on the first user gesture; browsers block audio before that.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      return true;
    } catch {
      return false;
    }
  }

  _tone(freq, dur, type = 'sine', vol = 0.15, when = 0) {
    try {
      if (!this.ensure() || this.muted) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch { /* audio must never break the game */ }
  }

  _noise(dur, vol = 0.25, lowpass = 1200) {
    try {
      if (!this.ensure() || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t);
    } catch { /* audio must never break the game */ }
  }

  gunshot() { this._noise(0.14, 0.3, 900); this._tone(140, 0.1, 'square', 0.12); }
  punch() { this._noise(0.08, 0.2, 500); }
  hit() { this._tone(190, 0.08, 'square', 0.1); }
  jingle(freq = 880) {
    this._tone(freq, 0.12, 'sine', 0.14, 0);
    this._tone(freq * 1.25, 0.14, 'sine', 0.14, 0.1);
    this._tone(freq * 1.5, 0.2, 'sine', 0.14, 0.2);
  }
  horn() { this._tone(370, 0.35, 'sawtooth', 0.12); this._tone(466, 0.35, 'sawtooth', 0.1); }
  engineStart() { this._tone(90, 0.4, 'sawtooth', 0.12); }

  // The engine hum follows the car's speed; call every frame while driving.
  engine(speedRatio) {
    try {
      if (!this.ensure() || this.muted) return;
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
        this.engineOsc.start();
      }
      const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, this.ctx.currentTime, 0.1);
    } catch { /* audio must never break the game */ }
  }

  // Two-tone siren wail while any wanted level is active.
  siren(on) {
    try {
      if (!this.ensure() || this.muted) return;
      if (on && !this._sirenOsc) {
        this._sirenOsc = this.ctx.createOscillator();
        this._sirenOsc.type = 'sine';
        this._sirenGain = this.ctx.createGain();
        this._sirenGain.gain.value = 0.04;
        this._sirenOsc.connect(this._sirenGain).connect(this.ctx.destination);
        this._sirenOsc.start();
        this._sirenPhase = 0;
      } else if (!on && this._sirenOsc) {
        this._sirenOsc.stop();
        this._sirenOsc = null;
      }
      if (this._sirenOsc) {
        this._sirenPhase = (this._sirenPhase + 0.06) % (Math.PI * 2);
        this._sirenOsc.frequency.value = 700 + Math.sin(this._sirenPhase) * 220;
      }
    } catch { /* audio must never break the game */ }
  }

  // The sunset loop: Am – F – C – G, one soft chord every four seconds.
  startMusic() {
    try {
      if (!this.ensure() || this.musicTimer) return;
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 261.6, 329.6], [196, 246.9, 293.7]];
      let i = 0;
      const play = () => {
        if (this.muted) return;
        for (const f of chords[i % chords.length]) this._tone(f, 3.6, 'triangle', 0.05);
        i++;
      };
      play();
      this.musicTimer = setInterval(play, 4000);
    } catch { /* audio must never break the game */ }
  }
}
