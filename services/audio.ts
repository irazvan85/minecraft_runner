export class SoundService {
  private ctx: AudioContext | null = null;
  
  // Volume State (0.0 to 1.0)
  private _sfxVolume: number = 0.5;
  private _musicVolume: number = 0.5;

  // Music State
  private musicRunning = false;
  private musicNodes: AudioNode[] = [];
  private musicTimeout: any = null;

  constructor() {
    // Try to load saved settings
    try {
        const savedSfx = localStorage.getItem('blocky_sfx_vol');
        const savedMusic = localStorage.getItem('blocky_music_vol');
        if (savedSfx !== null) this._sfxVolume = parseFloat(savedSfx);
        if (savedMusic !== null) this._musicVolume = parseFloat(savedMusic);
    } catch (e) {}
  }

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(v: number) { 
      this._sfxVolume = Math.max(0, Math.min(1, v));
      localStorage.setItem('blocky_sfx_vol', this._sfxVolume.toString());
  }

  get musicVolume() { return this._musicVolume; }
  set musicVolume(v: number) { 
      this._musicVolume = Math.max(0, Math.min(1, v)); 
      localStorage.setItem('blocky_music_vol', this._musicVolume.toString());
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  public async initialize() {
     const ctx = this.getContext();
     if (ctx.state === 'suspended') {
        await ctx.resume();
     }
  }

  // --- Music Methods ---

  public startMusic() {
    this.getContext(); // Ensure context exists
    if (this.musicRunning) return;
    this.musicRunning = true;
    this.playAmbientLoop();
  }

  public stopMusic() {
    this.musicRunning = false;
    if (this.musicTimeout) {
        clearTimeout(this.musicTimeout);
        this.musicTimeout = null;
    }
    this.musicNodes.forEach(n => {
        try { 
            if (n instanceof OscillatorNode) {
                n.stop(this.getContext().currentTime + 0.5); 
            }
        } catch(e) {}
    });
    setTimeout(() => {
        this.musicNodes.forEach(n => { try{ n.disconnect(); }catch(e){} });
        this.musicNodes = [];
    }, 500);
  }

  private playAmbientLoop() {
    if (!this.musicRunning) return;
    const ctx = this.getContext();
    const t = ctx.currentTime;
    
    // Minecraft-esque chord progression (Cmaj7, Em, Fmaj7, Am, G6)
    const chords = [
        [261.63, 329.63, 392.00, 493.88], // Cmaj7
        [164.81, 196.00, 246.94],         // Em
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [220.00, 261.63, 329.63],         // Am
        [196.00, 246.94, 293.66, 329.63]  // G6
    ];
    
    const chord = chords[Math.floor(Math.random() * chords.length)];
    const duration = 6 + Math.random() * 2; 

    // Play chord notes
    chord.forEach((freq) => {
        const start = t + Math.random() * 0.8;
        // Base val 0.3 * musicVolume (at 0.5 vol -> 0.15 effective)
        this.playAmbientNote(freq, start, duration, 0.3); 
    });
    
    // Bass note
    // Base val 0.5 * musicVolume (at 0.5 vol -> 0.25 effective)
    this.playAmbientNote(chord[0] / 2, t, duration + 2, 0.5); 

    this.musicTimeout = setTimeout(() => this.playAmbientLoop(), (duration - 1) * 1000);
  }

  private playAmbientNote(freq: number, startTime: number, duration: number, baseVol: number = 0.3) {
     if (!this.musicRunning) return;
     const finalVol = baseVol * this._musicVolume;
     if (finalVol <= 0.001) return;

     const ctx = this.getContext();
     const osc = ctx.createOscillator();
     const gain = ctx.createGain();
     const filter = ctx.createBiquadFilter(); 

     osc.type = Math.random() > 0.4 ? 'sine' : 'triangle';
     osc.frequency.setValueAtTime(freq, startTime);
     osc.detune.setValueAtTime((Math.random() - 0.5) * 8, startTime);

     filter.type = 'lowpass';
     filter.frequency.setValueAtTime(300, startTime);
     filter.frequency.linearRampToValueAtTime(500, startTime + duration/3); 
     filter.frequency.linearRampToValueAtTime(300, startTime + duration);

     gain.gain.setValueAtTime(0, startTime);
     gain.gain.linearRampToValueAtTime(finalVol, startTime + 2); 
     gain.gain.setValueAtTime(finalVol, startTime + duration - 2);
     gain.gain.linearRampToValueAtTime(0, startTime + duration);

     osc.connect(filter);
     filter.connect(gain);
     gain.connect(ctx.destination);
     
     osc.start(startTime);
     osc.stop(startTime + duration);
     
     this.musicNodes.push(osc);
     this.musicNodes.push(gain);
     this.musicNodes.push(filter);

     osc.onended = () => {
         this.musicNodes = this.musicNodes.filter(n => n !== osc && n !== gain && n !== filter);
     };
  }

  // --- SFX Methods ---

  playJump() {
    if (this._sfxVolume <= 0.001) return;
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);

      // Base 0.1 * sfxVolume (at 0.5 -> 0.05 effective)
      gain.gain.setValueAtTime(0.1 * this._sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(t + 0.1);
    } catch (e) {}
  }

  playCollect() {
    if (this._sfxVolume <= 0.001) return;
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      const note = (freq: number, offset: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + offset);
        // Base 0.15
        gain.gain.setValueAtTime(0.15 * this._sfxVolume, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, t + offset + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + dur);
      };

      note(1396.91, 0, 0.1); 
      note(2093.00, 0.08, 0.2);
    } catch (e) {}
  }

  playHit() {
    if (this._sfxVolume <= 0.001) return;
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      // Base 0.2
      noiseGain.gain.setValueAtTime(0.2 * this._sfxVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
      gain.gain.setValueAtTime(0.2 * this._sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(t + 0.3);

    } catch (e) {}
  }

  playWin() {
    if (this._sfxVolume <= 0.001) return;
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; 
      const times = [0, 0.15, 0.3, 0.45, 0.6, 0.75];
      const lens  = [0.1, 0.1, 0.1, 0.1, 0.1, 0.4];

      notes.forEach((freq, i) => {
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.type = 'square';
         osc.frequency.setValueAtTime(freq, t + times[i]);
         
         // Base 0.15
         gain.gain.setValueAtTime(0.15 * this._sfxVolume, t + times[i]);
         gain.gain.exponentialRampToValueAtTime(0.01, t + times[i] + lens[i]);
         
         osc.connect(gain);
         gain.connect(ctx.destination);
         osc.start(t + times[i]);
         osc.stop(t + times[i] + lens[i]);
      });
    } catch (e) {}
  }

  playGameOver() {
    if (this._sfxVolume <= 0.001) return;
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(50, t + 1.5);
      
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 10;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      // Base 0.15
      gain.gain.setValueAtTime(0.15 * this._sfxVolume, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(t + 1.5);
      lfo.stop(t + 1.5);
    } catch (e) {}
  }
}

export const audioService = new SoundService();
