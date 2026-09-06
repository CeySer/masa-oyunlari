import { create } from 'zustand';

// Small synthesized sound effects via the Web Audio API - no audio files to
// ship/license, just short oscillator beeps. Kept deliberately simple:
// each "sound" is a tiny sequence of tones, not a real sample.
export type SoundName = 'draw' | 'discard' | 'win' | 'turn' | 'gosterme' | 'error';

const STORAGE_KEY = 'masa-oyunlari-sound';

interface SoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  play: (name: SoundName) => void;
}

function getStoredEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'off') return false;
  } catch {
    // localStorage unavailable - default to on
  }
  return true;
}

// Lazily created (and reused) - browsers refuse to start an AudioContext
// before a user gesture, and there's no reason to pay for one until the
// first sound actually plays.
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Each sound is a list of (frequency Hz, start offset s, duration s).
const SEQUENCES: Record<SoundName, Array<[number, number, number]>> = {
  draw: [[520, 0, 0.07]],
  discard: [[320, 0, 0.09]],
  turn: [[660, 0, 0.08], [880, 0.09, 0.09]],
  win: [[660, 0, 0.1], [880, 0.1, 0.1], [1100, 0.2, 0.22]],
  gosterme: [[900, 0, 0.08], [1200, 0.08, 0.1]],
  error: [[220, 0, 0.15]],
};

function playSequence(ctx: AudioContext, seq: Array<[number, number, number]>) {
  const now = ctx.currentTime;
  seq.forEach(([freq, offset, duration]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + duration + 0.02);
  });
}

export const useSoundStore = create<SoundState>((set, get) => ({
  enabled: getStoredEnabled(),
  setEnabled: (enabled: boolean) => {
    set({ enabled });
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // best-effort persistence only
    }
  },
  toggle: () => get().setEnabled(!get().enabled),
  play: (name: SoundName) => {
    if (!get().enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      playSequence(ctx, SEQUENCES[name]);
    } catch {
      // best-effort - never let a sound glitch break gameplay
    }
  },
}));
