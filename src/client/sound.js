// Liero26 - Sound Engine
// Generates retro sound effects using Web Audio API

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.3;
    this.sounds = {};
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
      this._generateSounds();
    } catch (e) {
      console.warn('Audio not available:', e);
      this.enabled = false;
    }
  }

  _generateSounds() {
    // Generate all sound effects procedurally
    this.sounds.shotgun = this._createNoise(0.15, 800, 200, 'bandpass');
    this.sounds.shot = this._createNoise(0.08, 1200, 400, 'bandpass');
    this.sounds.rifle = this._createNoise(0.2, 600, 150, 'lowpass');
    this.sounds.bazooka = this._createNoise(0.12, 300, 100, 'lowpass');
    this.sounds.blaster = this._createTone(0.1, 400, 200, 'square');
    this.sounds.throw = this._createTone(0.08, 600, 300, 'sine');
    this.sounds.larpa = this._createTone(0.15, 500, 250, 'sawtooth');
    this.sounds.burner = this._createNoise(0.05, 2000, 800, 'bandpass');
    this.sounds.exp2 = this._createExplosion(0.2, 200);
    this.sounds.exp3 = this._createExplosion(0.3, 150);
    this.sounds.exp4 = this._createExplosion(0.15, 300);
    this.sounds.exp5 = this._createExplosion(0.4, 100);
    this.sounds.bump = this._createTone(0.05, 200, 100, 'sine');
    this.sounds.death1 = this._createDeath(0.3, 400);
    this.sounds.death2 = this._createDeath(0.3, 300);
    this.sounds.death3 = this._createDeath(0.3, 500);
    this.sounds.hurt1 = this._createTone(0.1, 800, 400, 'sawtooth');
    this.sounds.hurt2 = this._createTone(0.1, 700, 350, 'sawtooth');
    this.sounds.hurt3 = this._createTone(0.1, 900, 450, 'sawtooth');
    this.sounds.alive = this._createTone(0.2, 600, 800, 'sine');
    this.sounds.begin = this._createTone(0.3, 400, 600, 'square');
    this.sounds.reloaded = this._createTone(0.15, 1000, 1200, 'sine');
    this.sounds.select = this._createTone(0.05, 800, 900, 'sine');
    this.sounds.boing = this._createTone(0.1, 300, 600, 'sine');
  }

  _createNoise(duration, freqStart, freqEnd, filterType) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = (1 - t) * (1 - t);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    return { buffer, freqStart, freqEnd, filterType };
  }

  _createTone(duration, freqStart, freqEnd, waveType) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const freq = freqStart + (freqEnd - freqStart) * t;
      const env = (1 - t);
      phase += freq / sr;

      let sample = 0;
      switch (waveType) {
        case 'sine': sample = Math.sin(phase * Math.PI * 2); break;
        case 'square': sample = Math.sin(phase * Math.PI * 2) > 0 ? 1 : -1; break;
        case 'sawtooth': sample = (phase % 1) * 2 - 1; break;
        default: sample = Math.sin(phase * Math.PI * 2);
      }
      data[i] = sample * env * 0.5;
    }

    return { buffer };
  }

  _createExplosion(duration, baseFreq) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 1.5);
      const noise = (Math.random() * 2 - 1);
      const tone = Math.sin(i / sr * baseFreq * Math.PI * 2 * (1 - t * 0.5));
      data[i] = (noise * 0.7 + tone * 0.3) * env;
    }

    return { buffer };
  }

  _createDeath(duration, freq) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const currentFreq = freq * (1 - t * 0.6);
      const env = Math.pow(1 - t, 0.8);
      phase += currentFreq / sr;
      const sample = Math.sin(phase * Math.PI * 2) * 0.5 +
                     (Math.random() * 2 - 1) * 0.3;
      data[i] = sample * env;
    }

    return { buffer };
  }

  play(name, x, y, listenerX, listenerY) {
    if (!this.enabled || !this.initialized || !this.sounds[name]) return;

    // Spatial audio: reduce volume for distant sounds
    let vol = 1;
    if (x !== undefined && listenerX !== undefined) {
      const dist = Math.sqrt((x - listenerX) ** 2 + (y - listenerY) ** 2);
      vol = Math.max(0, 1 - dist / 400);
      if (vol <= 0) return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.sounds[name].buffer;

      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      source.connect(gain);
      gain.connect(this.masterGain);

      source.start(0);
    } catch (e) {
      // Ignore audio errors
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  async startMusic(url) {
    if (!this.enabled || !this.initialized) return;
    this.stopMusic();

    // Per-channel wave shapes for variety (ch 10 = drums, skipped)
    const WAVES = [
      'triangle','sine','triangle','sawtooth',
      'triangle','sine','sawtooth','triangle',
      'triangle', null, 'triangle','sine',
      'sawtooth','triangle','sine','triangle',
    ];

    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.value = 0.18;
    this._musicGain.connect(this.masterGain);
    this._activeNotes = {};

    const player = new MidiPlayer.Player((event) => {
      if (event.channel === 10) return; // skip drums
      const key = `${event.channel}-${event.noteNumber}`;

      if (event.name === 'Note on' && event.velocity > 0) {
        // Release previous note on same pitch if any
        if (this._activeNotes[key]) this._musicRelease(this._activeNotes[key]);

        const freq = 440 * Math.pow(2, (event.noteNumber - 69) / 12);
        const wave = WAVES[(event.channel - 1) % 16] || 'triangle';
        const vol  = (event.velocity / 127) * 0.12;

        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type            = wave;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0,   this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.015);
        osc.connect(gain);
        gain.connect(this._musicGain);
        osc.start();

        this._activeNotes[key] = { osc, gain };

      } else if (event.name === 'Note off' ||
                (event.name === 'Note on' && event.velocity === 0)) {
        if (this._activeNotes[key]) {
          this._musicRelease(this._activeNotes[key]);
          delete this._activeNotes[key];
        }
      }
    });

    // Loop: restart when the file ends
    player.on('endOfFile', () => {
      this._stopAllNotes();
      player.stop();
      player.play();
    });

    try {
      const resp = await fetch(url);
      const buf  = await resp.arrayBuffer();
      player.loadArrayBuffer(buf);
      player.play();
      this._midiPlayer = player;
    } catch (e) {
      console.warn('Background music failed:', e);
    }
  }

  _musicRelease({ osc, gain }) {
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.07);
    try { osc.stop(t + 0.08); } catch (_) {}
    setTimeout(() => { try { gain.disconnect(); } catch (_) {} }, 200);
  }

  _stopAllNotes() {
    for (const node of Object.values(this._activeNotes || {})) {
      this._musicRelease(node);
    }
    this._activeNotes = {};
  }

  stopMusic() {
    if (this._midiPlayer) { this._midiPlayer.stop(); this._midiPlayer = null; }
    this._stopAllNotes();
    if (this._musicGain) { this._musicGain.disconnect(); this._musicGain = null; }
  }
}
