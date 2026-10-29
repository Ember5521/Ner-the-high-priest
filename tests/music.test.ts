// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const gain = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  const node = { gain, connect: vi.fn() };
  const source = { connect: vi.fn() };
  const ctx = { currentTime: 3, state: 'running', destination: {}, createGain: vi.fn(() => node), createMediaElementSource: vi.fn(() => source), resume: vi.fn(async () => {}) };
  return { gain, node, source, ctx };
});
vi.mock('../src/ui/sound', () => ({ audio: () => mocks.ctx }));

// these players already answered the first-visit music question
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); localStorage.setItem('ner-settings', JSON.stringify({ musicAsked: true, master: 100 })); });
afterEach(() => { vi.unstubAllGlobals(); });

it('starts on request, ramps volume, and pauses and resumes without restarting', async () => {
  const play = vi.fn(async () => {});
  const pause = vi.fn();
  const AudioMock = vi.fn(function () { return { play, pause, loop: false, preload: '' }; });
  vi.stubGlobal('Audio', AudioMock);
  const music = await import('../src/ui/music');
  const { loadSettings } = await import('../src/save/storage');
  music.setMusicVolume(50);
  expect(AudioMock).not.toHaveBeenCalled();
  music.startMusic();
  expect(AudioMock).toHaveBeenCalledTimes(1);
  const el = AudioMock.mock.results[0]!.value;
  expect(el.loop).toBe(true);
  expect(el.preload).toBe('auto');
  expect(mocks.source.connect).toHaveBeenCalledWith(mocks.node);
  expect(mocks.node.connect).toHaveBeenCalledWith(mocks.ctx.destination);
  expect(mocks.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.15), 4.5);
  music.startMusic();
  expect(play).toHaveBeenCalledTimes(1);
  music.setMusicVolume(25);
  expect(loadSettings().bgm).toBe(25);
  expect(mocks.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.0375), 3.2);
  music.setMusicVolume(0);
  expect(pause).toHaveBeenCalledTimes(1);
  music.setMusicVolume(50);
  expect(play).toHaveBeenCalledTimes(2);
  music.pauseMusic();
  expect(pause).toHaveBeenCalledTimes(2);
  music.resumeMusic();
  expect(play).toHaveBeenCalledTimes(3);
  expect(AudioMock).toHaveBeenCalledTimes(1);
});

it('does not start on visibility resume before a gesture and ignores rejected playback', async () => {
  const play = vi.fn().mockRejectedValue(new Error('blocked'));
  vi.stubGlobal('Audio', vi.fn(function () { return { play, pause: vi.fn() }; }));
  const music = await import('../src/ui/music');
  music.pauseMusic();
  music.resumeMusic();
  expect(play).not.toHaveBeenCalled();
  music.startMusic();
  await Promise.resolve();
  expect(play).toHaveBeenCalledTimes(1);
});
