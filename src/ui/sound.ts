// Sound effects, synthesised with the Web Audio API so the game ships no
// audio files. A recorded file can replace a recipe later through
// data/art.json "sounds".

import manifest from '../../data/art.json';
import { artUrl } from './art';
import { loadSettings, saveSettings } from '../save/storage';

export type SoundName =
  | 'stamp'
  | 'axe'
  | 'shot'
  | 'shatter'
  | 'paper'
  | 'tick'
  | 'click'
  | 'drowse'
  | 'gameover'
  | 'unlock'
  | 'speaki'
  | 'rewind'
  | 'boon';

const recordings = new Map<string, Promise<AudioBuffer | null>>();
const level = (v: number) => (v / 100) ** 2;
const sfxGain = (s: { sfx: number; master: number }) => level(s.sfx) * level(s.master);
/** The master slider: scales the effects here and the music in music.ts. */
export function setMasterVolume(volume: number): void {
  const settings = loadSettings();
  settings.master = Math.max(0, Math.min(100, volume));
  if (settings.master > 0) settings.lastMaster = settings.master;
  saveSettings(settings);
  if (master) master.gain.value = sfxGain(settings);
}
export function setMasterEnabled(on: boolean): void {
  setMasterVolume(on ? loadSettings().lastMaster : 0);
}
export function soundEnabled(): boolean {
  return loadSettings().sfx > 0;
}
export function setSoundVolume(volume: number): void {
  const settings = loadSettings();
  settings.sfx = Math.max(0, Math.min(100, volume));
  if (settings.sfx > 0) settings.lastSfx = settings.sfx;
  saveSettings(settings);
  if (master) master.gain.value = sfxGain(settings);
}
export function setSoundEnabled(on: boolean): void {
  const settings = loadSettings();
  setSoundVolume(on ? settings.lastSfx : 0);
  try {
    localStorage.setItem('ner-sound', on ? 'on' : 'off');
  } catch {
    /* Optional storage. */
  }
}

function recording(a: AudioContext, name: SoundName) {
  const url = artUrl(manifest.sounds[name]);
  if (!url) return null;
  if (!recordings.has(url)) {
    recordings.set(
      url,
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error('Sound download failed');
          return response.arrayBuffer();
        })
        .then((bytes) => a.decodeAudioData(bytes))
        .catch(() => null),
    );
  }
  return recordings.get(url)!;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (session) {
    try {
      session.type = 'ambient';
    } catch {
      /* Older browsers may reject the session type. */
    }
  }
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -8;
  squash.ratio.value = 3;
  squash.attack.value = 0.002;
  squash.release.value = 0.15;
  master = ctx.createGain();
  master.gain.value = sfxGain(loadSettings());
  const trim = ctx.createGain();
  trim.gain.value = 0.7;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  master
    .connect(trim)
    .connect(squash)
    .connect(limiter)
    .connect(ctx.destination);
  // one second of white noise, reused by every burst
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Browsers only allow sound after a user gesture; call from one. */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state !== 'running') void a.resume().catch(() => {});
  if (a && soundEnabled()) {
    recording(a, 'stamp');
    recording(a, 'axe');
    recording(a, 'shot');
  }
}

export function suspendAudio(): void {
  if (ctx) void ctx.suspend().catch(() => {});
}

const vary = (amount = 0.08) => 1 + (Math.random() * 2 - 1) * amount;

function envelope(
  gain: GainNode,
  t: number,
  peak: number,
  decay: number,
  attack = 0.003,
) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

/**
 * Filtered noise with its own envelope. Unpitched on purpose: a falling
 * sine reads as a kick drum, wood and paper don't have a pitch sweep.
 */
function burst(
  a: AudioContext,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  decay: number,
  attack?: number,
  sweepTo?: number,
) {
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.playbackRate.value = vary(0.1);
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq * vary(0.08);
  filter.Q.value = q;
  if (sweepTo !== undefined) {
    filter.frequency.setValueAtTime(freq * vary(), t);
    filter.frequency.exponentialRampToValueAtTime(sweepTo, t + decay * 0.9);
  }
  const gain = a.createGain();
  envelope(gain, t, peak, decay, attack);
  src.connect(filter).connect(gain).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.02);
}

let clip: WaveShaperNode['curve'] = null;
/** A gunshot's crack: bright noise driven into hard clipping, gone in 40 ms. */
function crack(a: AudioContext, t: number) {
  if (!clip) {
    clip = new Float32Array(1024);
    for (let i = 0; i < clip.length; i++) {
      const x = (i / (clip.length - 1)) * 2 - 1;
      clip[i] = Math.tanh(x * 6);
    }
  }
  const src = a.createBufferSource();
  src.buffer = noise;
  const filter = a.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1100 * vary(0.08);
  filter.Q.value = 0.7;
  const drive = a.createGain();
  drive.gain.value = 3;
  const shaper = a.createWaveShaper();
  shaper.curve = clip;
  const gain = a.createGain();
  envelope(gain, t, 1.8, 0.05, 0.0004);
  src
    .connect(filter)
    .connect(drive)
    .connect(shaper)
    .connect(gain)
    .connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.06);
}

/** Wood fibres stretching before they give: a rough, falling groan. */
function creak(
  a: AudioContext,
  t: number,
  from: number,
  to: number,
  peak: number,
  length: number,
) {
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(from * vary(), t);
  osc.frequency.linearRampToValueAtTime(to, t + length);
  // a fast wobble makes it grind instead of hum
  const wobble = a.createOscillator();
  const depth = a.createGain();
  wobble.frequency.value = 38 * vary(0.2);
  depth.gain.value = from * 0.18;
  wobble.connect(depth).connect(osc.frequency);
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 1.6;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + length * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(filter).connect(gain).connect(master!);
  for (const o of [osc, wobble]) {
    o.start(t);
    o.stop(t + length + 0.02);
  }
}

function tone(
  a: AudioContext,
  t: number,
  type: OscillatorType,
  frequency: number,
  peak: number,
  decay: number,
  attack = 0.01,
) {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency * vary(0.01), t);
  const gain = a.createGain();
  envelope(gain, t, peak, decay, attack);
  osc.connect(gain).connect(master!);
  osc.start(t);
  osc.stop(t + decay + 0.02);
  return osc;
}

const recipes: Record<
  SoundName,
  (a: AudioContext, t: number, direction?: 'gain' | 'loss') => void
> = {
  paper(a, t) {
    burst(a, t, 'bandpass', 3500, 0.8, 0.25, 0.18, 0.02, 2000);
  },
  tick(a, t, direction) {
    if (direction === 'loss') burst(a, t, 'lowpass', 450, 0.7, 0.3, 0.06);
    else {
      burst(a, t, 'bandpass', 2200, 0.8, 0.18, 0.03);
      burst(a, t + 0.025, 'bandpass', 2800, 0.8, 0.18, 0.03);
    }
  },
  click(a, t) {
    burst(a, t, 'bandpass', 1600, 2, 0.25, 0.025, 0.001);
  },
  drowse(a, t) {
    burst(a, t, 'bandpass', 1200, 0.7, 0.3, 0.9, 0.35);
    tone(a, t, 'sine', 330, 0.25, 1.4);
    tone(a, t, 'sine', 495, 0.1, 1.4);
  },
  gameover(a, t) {
    [392, 330, 262].forEach((hz, i) =>
      tone(a, t + i * 0.22, 'triangle', hz, 0.3, 0.5),
    );
    burst(a, t, 'lowpass', 200, 0.7, 1.5, 0.2);
  },
  unlock(a, t) {
    [523, 659, 784, 1047].forEach((hz, i) =>
      tone(a, t + i * 0.09, 'triangle', hz, 0.22, 0.6),
    );
    burst(a, t + 0.27, 'highpass', 4000, 0.7, 0.08, 0.4);
  },
  speaki(a, t) {
    const osc = tone(a, t, 'sine', 300, 0.3, 0.3);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.25);
  },
  rewind(a, t) {
    burst(a, t, 'bandpass', 3000, 0.8, 0.35, 1, 0.6, 400);
  },
  boon(a, t) {
    for (let i = 0; i < 6; i++)
      burst(a, t + i * 0.06, 'highpass', 5000, 0.7, 0.12, 0.04);
    tone(a, t, 'sine', 1320, 0.2, 0.5, 0.005);
  },
  // 탕: a sharp muzzle crack, the bang ringing off the office walls,
  // two echoes, then the burning paper bursting apart
  shot(a, t) {
    crack(a, t); // 탕 — the hard, clipped transient
    burst(a, t, 'bandpass', 900, 0.6, 2.4, 0.13, 0.0006); // the bang's body
    burst(a, t, 'lowpass', 150, 0.7, 5, 0.32, 0.002); // pressure in the chest
    burst(a, t + 0.004, 'bandpass', 2300, 9, 0.9, 0.28, 0.002); // 앙: the ring
    burst(a, t + 0.006, 'bandpass', 3400, 11, 0.45, 0.2, 0.002);
    // the walls answer twice, duller each time
    burst(a, t + 0.11, 'lowpass', 1700, 0.7, 0.45, 0.2, 0.004);
    burst(a, t + 0.24, 'lowpass', 1000, 0.7, 0.22, 0.28, 0.006);
  },
  // after the bang: blue fire crackles through the paper, then 와장창 it
  // bursts into shards (starts with the shot; kept apart so a recorded
  // gunshot can replace only the bang)
  shatter(a, t) {
    burst(a, t + 0.05, 'bandpass', 500, 0.8, 0.35, 0.36, 0.08); // fire catching
    for (let i = 0; i < 6; i++)
      burst(
        a,
        t + 0.12 + Math.random() * 0.24,
        'bandpass',
        2600 + Math.random() * 2800,
        5,
        0.25 * vary(0.4),
        0.006 + Math.random() * 0.01,
        0.0005,
      );
    // 와장창: the paper bursts into shards
    const burstAt = t + 0.38;
    burst(a, burstAt, 'highpass', 1800, 0.7, 0.55, 0.09, 0.0008);
    burst(a, burstAt, 'bandpass', 420, 1.2, 0.5, 0.12, 0.002);
    for (let i = 0; i < 8; i++)
      burst(
        a,
        burstAt + Math.pow(Math.random(), 1.6) * 0.18,
        'bandpass',
        2000 + Math.random() * 4000,
        3,
        0.28 * vary(0.4),
        0.008 + Math.random() * 0.02,
        0.0005,
      );
  },
  // 쾅: a heavy wooden stamp pressed down hard on paper over a thick desk
  stamp(a, t) {
    burst(a, t, 'lowpass', 220, 0.9, 6, 0.24); // the desk boards take the weight
    burst(a, t, 'bandpass', 130, 3, 9, 0.32); // low wooden boom of the desk
    burst(a, t, 'lowpass', 1400, 0.7, 2, 0.08); // dull "퍽" of the rubber face
    burst(a, t, 'bandpass', 2400, 1.2, 0.5, 0.03, 0.001); // paper pressed flat
    burst(a, t + 0.065, 'lowpass', 600, 0.8, 0.8, 0.06); // the stamp settling back
  },
  // 우지끈: the axe bites, the fibres groan and crack, then the wood snaps
  axe(a, t) {
    burst(a, t, 'lowpass', 1800, 0.8, 2.6, 0.12, 0.001); // the bite
    burst(a, t, 'bandpass', 150, 3, 7, 0.28); // blade into the desk
    creak(a, t + 0.03, 210, 130, 0.35, 0.3); // 우지: fibres stretching
    // 지-: splinters cracking, thickening toward the snap
    for (let i = 0; i < 16; i++) {
      const at = t + 0.04 + Math.pow(Math.random(), 0.7) * 0.26;
      burst(
        a,
        at,
        'bandpass',
        1200 + Math.random() * 2800,
        4,
        0.9 * vary(0.4),
        0.006 + Math.random() * 0.012,
        0.0005,
      );
    }
    // 끈: the last fibres give way
    const snap = t + 0.3 + Math.random() * 0.03;
    burst(a, snap, 'highpass', 700, 0.7, 0.75, 0.05, 0.0005);
    burst(a, snap, 'bandpass', 260, 2, 1.2, 0.16);
    burst(a, snap + 0.01, 'highpass', 3000, 0.6, 0.2, 0.18); // paper tearing apart
  },
};

const lastPlayed = new Map<SoundName, number>();
let ticks = 0;
export function resetDocumentSounds(): void {
  ticks = 0;
  lastPlayed.delete('tick');
}

export function playSound(
  name: SoundName,
  delayMs = 0,
  direction?: 'gain' | 'loss',
): void {
  if (!soundEnabled()) return;
  const a = audio();
  if (!a || !master) return;
  if (a.state !== 'running') void a.resume().catch(() => {});
  const at = a.currentTime + Math.max(0, delayMs) / 1000;
  const last = lastPlayed.get(name);
  if (last !== undefined && at - last < 0.04) return;
  if (name === 'tick' && ticks >= 4) return;
  lastPlayed.set(name, at);
  if (name === 'tick') ticks++;
  const file = recording(a, name);
  if (!file) {
    recipes[name](a, at, direction);
    return;
  }
  void file.then((buffer) => {
    if (!soundEnabled()) return;
    const start = Math.max(at, a.currentTime);
    if (buffer) {
      try {
        const source = a.createBufferSource();
        source.buffer = buffer;
        source.connect(master!);
        source.start(start);
        return;
      } catch {
        // A file that cannot play uses the original recipe.
      }
    }
    recipes[name](a, start, direction);
  });
}
