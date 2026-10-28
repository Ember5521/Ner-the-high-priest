// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let paths: Record<string, string | null>;
const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});
let context: FakeAudioContext;
class FakeAudioContext {
  state = 'suspended';
  sampleRate = 100;
  currentTime = 3;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  decodeAudioData = vi.fn(async () => ({ recorded: true }));
  createOscillator = vi.fn(() => this.node());
  createBufferSource = vi.fn(() => this.node());
  constructor() {
    context = this;
  }
  node() {
    return {
      connect: vi.fn((target: unknown) => target),
      gain: param(),
      frequency: param(),
      playbackRate: param(),
      Q: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
    };
  }
  createGain = vi.fn(() => this.node());
  createDynamicsCompressor = vi.fn(() => this.node());
  createBiquadFilter() {
    return this.node();
  }
  createWaveShaper() {
    return this.node();
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(100) };
  }
}
beforeEach(async () => {
  vi.resetModules();
  paths = (await import('../data/art.json')).default.sounds;
  localStorage.clear();
  paths.stamp = null;
  paths.axe = null;
  paths.shot = null;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});
afterEach(() => {
  paths.stamp = null;
  paths.axe = null;
  paths.shot = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('unlocks audio and synthesises each recipe with the requested delay', async () => {
  const { unlockAudio, playSound } = await import('../src/ui/sound');
  unlockAudio();
  expect(context.resume).toHaveBeenCalledTimes(1);
  // recipe internals change with sound design; check that layers are
  // scheduled at the requested time rather than counting them
  playSound('stamp', 140);
  const stampLayers = context.createBufferSource.mock.calls.length;
  expect(stampLayers).toBeGreaterThan(0);
  expect(
    context.createBufferSource.mock.results[0]!.value.start,
  ).toHaveBeenCalledWith(3.14, expect.any(Number));
  playSound('axe');
  expect(context.createBufferSource.mock.calls.length).toBeGreaterThan(
    stampLayers,
  );
  expect(context.createOscillator).toHaveBeenCalled();
  const axeLayers = context.createBufferSource.mock.calls.length;
  playSound('shot');
  expect(context.createBufferSource.mock.calls.length).toBeGreaterThan(
    axeLayers,
  );
});

it('honours persisted mute and keeps toggling when storage throws', async () => {
  localStorage.setItem('ner-sound', 'off');
  const { soundEnabled, setSoundEnabled, playSound } =
    await import('../src/ui/sound');
  const ctor = vi.fn(FakeAudioContext);
  vi.stubGlobal('AudioContext', ctor);
  playSound('stamp');
  expect(ctor).not.toHaveBeenCalled();
  setSoundEnabled(true);
  expect(localStorage.getItem('ner-sound')).toBe('on');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw Error();
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error();
  });
  setSoundEnabled(false);
  expect(soundEnabled()).toBe(false);
  playSound('axe');
  expect(ctor).not.toHaveBeenCalled();
  setSoundEnabled(true);
  expect(soundEnabled()).toBe(true);
});

it.each(['stamp', 'shot'] as const)(
  'fetches and caches a %s recording',
  async (name) => {
    paths[name] = 'sounds/stamp hit.wav';
    const fetcher = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    }));
    vi.stubGlobal('fetch', fetcher);
    const { playSound } = await import('../src/ui/sound');
    playSound(name);
    context.currentTime += 0.05;
    playSound(name);
    await vi.waitFor(() =>
      expect(context.createBufferSource).toHaveBeenCalledTimes(2),
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `${import.meta.env.BASE_URL}art/sounds/stamp%20hit.wav`,
    );
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(context.createBufferSource.mock.results[0]!.value.buffer).toEqual({
      recorded: true,
    });
  },
);

it.each(['fetch', 'http', 'decode', 'playback', 'path'])(
  'falls back to synthesis on %s failure',
  async (failure) => {
    paths.axe = failure === 'path' ? '../bad.wav' : 'axe.wav';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (failure === 'fetch') throw Error();
        return {
          ok: failure !== 'http',
          arrayBuffer: async () => new ArrayBuffer(4),
        };
      }),
    );
    const { unlockAudio, playSound } = await import('../src/ui/sound');
    // Create the context before selecting a recording.
    const path = paths.axe;
    paths.axe = null;
    unlockAudio();
    paths.axe = path;
    if (failure === 'decode')
      context.decodeAudioData.mockRejectedValueOnce(Error());
    if (failure === 'playback')
      context.createBufferSource.mockImplementationOnce(() => {
        throw Error();
      });
    playSound('axe');
    await vi.waitFor(() => expect(context.createOscillator).toHaveBeenCalled());
  },
);

it('does not play a loading recording if muted before decoding finishes', async () => {
  paths.stamp = 'stamp.wav';
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  const { playSound, setSoundEnabled } = await import('../src/ui/sound');
  playSound('stamp');
  setSoundEnabled(false);
  resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await vi.waitFor(() =>
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1),
  );
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(context.createOscillator).not.toHaveBeenCalled();
});

it('applies volume to the shared master for every sound and remembers mute volume', async () => {
  const { setSoundVolume, setSoundEnabled, unlockAudio, playSound } =
    await import('../src/ui/sound');
  setSoundVolume(42);
  unlockAudio();
  const master = context.createGain.mock.results[0]!.value;
  expect(master.gain.value).toBe(0.42 ** 2);
  for (const name of ['stamp', 'axe', 'shot', 'shatter'] as const)
    playSound(name);
  setSoundVolume(17);
  expect(master.gain.value).toBe(0.17 ** 2);
  setSoundEnabled(false);
  expect(master.gain.value).toBe(0);
  setSoundEnabled(true);
  expect(master.gain.value).toBe(0.17 ** 2);
});

it('resumes interrupted audio, sets ambient once, and suspends on request', async () => {
  let type = '';
  const assigned = vi.fn((value: string) => {
    type = value;
  });
  Object.defineProperty(navigator, 'audioSession', {
    configurable: true,
    value: {
      set type(value: string) {
        assigned(value);
      },
      get type() {
        return type;
      },
    },
  });
  const { unlockAudio, playSound, suspendAudio } =
    await import('../src/ui/sound');
  unlockAudio();
  expect(assigned).toHaveBeenCalledExactlyOnceWith('ambient');
  context.state = 'interrupted';
  unlockAudio();
  context.state = 'interrupted';
  playSound('click');
  expect(context.resume).toHaveBeenCalledTimes(3);
  suspendAudio();
  expect(context.suspend).toHaveBeenCalledTimes(1);
  expect(assigned).toHaveBeenCalledTimes(1);
  Reflect.deleteProperty(navigator, 'audioSession');
});
it('limits each sound to 40 ms and ticks to four per document', async () => {
  const { playSound, resetDocumentSounds } = await import('../src/ui/sound');
  playSound('click');
  const layers = context.createBufferSource.mock.calls.length;
  playSound('click');
  expect(context.createBufferSource).toHaveBeenCalledTimes(layers);
  context.currentTime += 0.041;
  playSound('click');
  expect(context.createBufferSource).toHaveBeenCalledTimes(layers * 2);
  context.createBufferSource.mockClear();
  for (let i = 0; i < 5; i++) playSound('tick', i * 60, 'loss');
  expect(context.createBufferSource).toHaveBeenCalledTimes(4);
  resetDocumentSounds();
  playSound('tick', 300, 'gain');
  expect(context.createBufferSource).toHaveBeenCalledTimes(6);
});
it('creates every new recipe at the requested time', async () => {
  const { playSound } = await import('../src/ui/sound');
  for (const name of [
    'paper',
    'tick',
    'click',
    'drowse',
    'gameover',
    'unlock',
    'speaki',
    'rewind',
    'boon',
  ] as const) {
    playSound(name, 250);
  }
  expect(context.createOscillator).toHaveBeenCalled();
  expect(
    context.createBufferSource.mock.results[0]!.value.start,
  ).toHaveBeenCalledWith(3.25, expect.any(Number));
});

it('routes master through trim, compressor, and the final limiter', async () => {
  const { unlockAudio } = await import('../src/ui/sound');
  unlockAudio();
  const master = context.createGain.mock.results[0]!.value;
  const trim = context.createGain.mock.results[1]!.value;
  const compressor = context.createDynamicsCompressor.mock.results[0]!.value;
  const limiter = context.createDynamicsCompressor.mock.results[1]!.value;
  expect(master.connect).toHaveBeenCalledWith(trim);
  expect(trim.gain.value).toBe(0.7);
  expect(trim.connect).toHaveBeenCalledWith(compressor);
  expect(compressor.connect).toHaveBeenCalledWith(limiter);
  expect(limiter.connect).toHaveBeenCalledWith(context.destination);
  expect([
    limiter.threshold.value,
    limiter.knee.value,
    limiter.ratio.value,
    limiter.attack.value,
    limiter.release.value,
  ]).toEqual([-2, 0, 20, 0.001, 0.08]);
});
