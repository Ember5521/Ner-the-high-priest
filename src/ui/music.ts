import manifest from '../../data/art.json';
import { loadSettings, saveSettings } from '../save/storage';
import { artUrl } from './art';
import { audio } from './sound';

/** Overall music level: 25% below the earlier 0.8. */
const MUSIC_GAIN = 0.6;

let element: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let started = false;
let playing = false;
let suspended = false;
let attempt = 0;

function ramp(volume: number, seconds: number): void {
  const ctx = audio();
  if (!ctx || !gain) return;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  // MUSIC_GAIN keeps the track under the stamps at any slider level
  const masterLevel = (loadSettings().master / 100) ** 2;
  gain.gain.linearRampToValueAtTime((volume / 100) ** 2 * masterLevel * MUSIC_GAIN, ctx.currentTime + seconds);
}

function play(): void {
  if (playing || suspended || !started || loadSettings().bgm <= 0) return;
  try {
    const ctx = audio();
    const url = artUrl(manifest.music.town);
    if (!ctx || !url) return;
    if (!element) {
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const node = ctx.createGain();
      node.gain.value = 0;
      ctx.createMediaElementSource(el).connect(node);
      node.connect(ctx.destination);
      element = el;
      gain = node;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    gain!.gain.value = 0;
    ramp(loadSettings().bgm, 1.5);
    playing = true;
    const current = ++attempt;
    void element.play().catch(() => { if (attempt === current) playing = false; });
  } catch {
    playing = false;
  }
}

export function startMusic(): void {
  started = true;
  play();
}

export function setMusicVolume(volume: number): void {
  const settings = loadSettings();
  settings.bgm = Math.max(0, Math.min(100, volume));
  if (settings.bgm > 0) settings.lastBgm = settings.bgm;
  saveSettings(settings);
  if (gain) ramp(settings.bgm, 0.2);
  if (settings.bgm === 0) {
    ++attempt;
    element?.pause();
    playing = false;
  } else play();
}

/** Re-applies the music level after the master slider moved. */
export function refreshMusicVolume(): void {
  if (gain) ramp(loadSettings().bgm, 0.2);
}

export function pauseMusic(): void {
  suspended = true;
  ++attempt;
  element?.pause();
  playing = false;
}

export function resumeMusic(): void {
  suspended = false;
  play();
}

/** The mute button: off keeps the last level so on brings it back. */
export function setMusicEnabled(on: boolean): void {
  setMusicVolume(on ? loadSettings().lastBgm : 0);
}
