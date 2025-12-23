export class SoundService {
  private ctx: AudioContext | null = null;
  private volume: number = 0.3;

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

  playJump() {
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);

      gain.gain.setValueAtTime(this.volume * 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(t + 0.1);
    } catch (e) {}
  }

  playCollect() {
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      const note = (freq: number, offset: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + offset);
        gain.gain.setValueAtTime(this.volume * 0.4, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, t + offset + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + dur);
      };

      note(1396.91, 0, 0.1); // F6
      note(2093.00, 0.08, 0.2); // C7
    } catch (e) {}
  }

  playHit() {
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      // Noise buffer for impact
      const bufferSize = ctx.sampleRate * 0.2; // 0.2 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(this.volume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();

      // Low frequency thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
      gain.gain.setValueAtTime(this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(t + 0.3);

    } catch (e) {}
  }

  playWin() {
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      // C Major Victory Fanfare
      const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; 
      const times = [0, 0.15, 0.3, 0.45, 0.6, 0.75];
      const lens  = [0.1, 0.1, 0.1, 0.1, 0.1, 0.4];

      notes.forEach((freq, i) => {
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.type = 'square';
         osc.frequency.setValueAtTime(freq, t + times[i]);
         
         gain.gain.setValueAtTime(this.volume * 0.3, t + times[i]);
         gain.gain.exponentialRampToValueAtTime(0.01, t + times[i] + lens[i]);
         
         osc.connect(gain);
         gain.connect(ctx.destination);
         osc.start(t + times[i]);
         osc.stop(t + times[i] + lens[i]);
      });
    } catch (e) {}
  }

  playGameOver() {
    try {
      const ctx = this.getContext();
      const t = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(50, t + 1.5);
      
      // Vibrato
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 10;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      gain.gain.setValueAtTime(this.volume * 0.4, t);
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