// @vitest-environment jsdom
import {
  type MockInstance,
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import rawCards from '../data/cards/m1.json';
import { DANGER_HIGH, DANGER_LOW } from '../src/core/config';
import { initialState, type Card, type State } from '../src/core/state';
import { format, setLanguage, system } from '../src/i18n';
import { loadSettings, saveSettings, saveRun } from '../src/save/storage';
import { gaugesMarkup, animateGauges } from '../src/ui/gauges';
import { deskMarkup } from '../src/ui/desk';
import { mount } from '../src/ui/app';
import * as sound from '../src/ui/sound';
import * as loop from '../src/core/loop';

const cards = rawCards as Card[];
const daily = cards.find((c) => c.kind === 'daily' && c.axe === true)!;
let root: HTMLDivElement;
let dispose: (() => void) | undefined;
let play: MockInstance<typeof sound.playSound>;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
function launch(state: State) {
  saveRun(state);
  dispose = mount(root);
  click('.title-continue');
}
function resolve(next: State, action = 'approve') {
  vi.spyOn(loop, 'processDocument').mockReturnValueOnce(next);
  click(`[data-action="${action}"]`);
  click(`[data-action="${action}"]`);
  vi.advanceTimersByTime(1400);
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  saveSettings({ ...loadSettings(), tutorialSeen: true, musicAsked: true });
  root = document.createElement('div');
  document.body.append(root);
  play = vi.spyOn(sound, 'playSound').mockImplementation(() => {});
  vi.spyOn(history, 'pushState').mockImplementation(() => {});
  vi.spyOn(history, 'back').mockImplementation(() => {});
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  root.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  DANGER_LOW - 1,
  DANGER_LOW,
  DANGER_LOW + 1,
  DANGER_HIGH - 1,
  DANGER_HIGH,
  DANGER_HIGH + 1,
])('marks and announces danger at %s', (value) => {
  const state = initialState();
  state.gauges.sugar = value;
  root.innerHTML = gaugesMarkup(state);
  const gauge = root.querySelector('[data-gauge="sugar"]')!;
  expect(gauge.classList.contains('extreme')).toBe(
    value <= DANGER_LOW || value >= DANGER_HIGH,
  );
  expect(gauge.classList.contains('danger-low')).toBe(value <= DANGER_LOW);
  expect(gauge.classList.contains('danger-high')).toBe(value >= DANGER_HIGH);
  const label = system.gauges.find((g) => g.key === 'sugar')!.label;
  const danger =
    value <= DANGER_LOW
      ? system.ui.gaugeDangerLow
      : value >= DANGER_HIGH
        ? system.ui.gaugeDangerHigh
        : '';
  expect(
    gauge.querySelector('[role="meter"]')!.getAttribute('aria-label'),
  ).toBe(label + (danger ? ', ' + format(danger, { gauge: label }) : ''));
});
it('sounds staggered directional ticks and no warning even with reduced motion', () => {
  const old = {
    sugar: DANGER_LOW + 1,
    people: DANGER_HIGH - 1,
    faith: 50,
    erpin: 50,
  };
  const next = {
    sugar: DANGER_LOW,
    people: DANGER_HIGH,
    faith: 55,
    erpin: 45,
  };
  animateGauges(root, old, next);
  expect(play.mock.calls.filter(([name]) => name === 'tick')).toEqual([
    ['tick', 0, 'loss'],
    ['tick', 60, 'gain'],
    ['tick', 120, 'gain'],
    ['tick', 180, 'loss'],
  ]);
});
it('keeps the experienced hint in the DOM and always shows the sleep hint', () => {
  saveSettings({ ...loadSettings(), stampsSeen: 5 });
  const state = { ...initialState(), current: daily };
  root.innerHTML = deskMarkup(state);
  expect(root.querySelector('.hint.hint-done')!.textContent).toBe(
    system.ui.stampHint,
  );
  root.innerHTML = deskMarkup({ ...state, sleep: 2 });
  expect(root.querySelector('.hint.hint-done')).toBeNull();
  expect(root.querySelector('.hint')!.textContent).toBe(system.ui.sleepHint);
});
it.each(['approve', 'reject', 'axe', 'bullet'])(
  'counts an awake %s resolution once and hides the fifth hint',
  (action) => {
    saveSettings({ ...loadSettings(), stampsSeen: 4 });
    const state = { ...initialState(), current: daily, boons: { bullet: 2 } };
    launch(state);
    expect(play).not.toHaveBeenCalled();
    resolve({ ...state, year: 2 }, action);
    expect(loadSettings().stampsSeen).toBe(5);
    expect(root.querySelector('.hint.hint-done')).not.toBeNull();
  },
);
it('does not count automatic stamps during sleep', () => {
  const state = { ...initialState(), current: daily, sleep: 2 };
  launch(state);
  vi.spyOn(loop, 'processDocument').mockReturnValueOnce({ ...state, sleep: 1 });
  vi.advanceTimersByTime(2600);
  expect(loadSettings().stampsSeen).toBe(0);
});
it.each(['speakiCaught', 'speakiFooled', 'erpinSave', 'stitch', 'asleep'])(
  'sounds the %s scene on transition',
  (scene) => {
    const state = { ...initialState(), current: daily };
    launch(state);
    resolve({ ...state, scene });
    expect(play).toHaveBeenCalledWith(
      scene.startsWith('speaki')
        ? 'speaki'
        : scene === 'asleep'
          ? 'drowse'
          : 'boon',
    );
  },
);
it('sounds gameover before presenting a rewind prompt', () => {
  const state = {
    ...initialState(),
    year: 160,
    current: daily,
    boons: { rewind: true as const },
  };
  launch(state);
  resolve({ ...state, ending: { id: 'sugar_low' } });
  expect(root.querySelector('[data-rewind="yes"]')).not.toBeNull();
  expect(play).toHaveBeenCalledWith('gameover');
});
it('suspends audio when the document becomes hidden', () => {
  launch({ ...initialState(), current: daily });
  const suspend = vi.spyOn(sound, 'suspendAudio').mockImplementation(() => {});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(suspend).toHaveBeenCalledTimes(1);
});

it('plays paper for a new story document but not load or language refresh', () => {
  const state = { ...initialState(), current: daily };
  launch(state);
  expect(play).not.toHaveBeenCalled();
  resolve({ ...state, current: cards.find((c) => c.kind === 'story')! });
  expect(play).toHaveBeenCalledWith('paper');
  play.mockClear();
  setLanguage('en');
  expect(play).not.toHaveBeenCalled();
  setLanguage('ko');
});
it.each(['hyean', 'rewind', 'stitch', 'alice', 'bullet'])(
  'sounds a received %s grant',
  (boon) => {
    const card = cards.find(
      (c) => c.reject?.grant?.boon === boon || c.approve?.grant?.boon === boon,
    )!;
    const side = card.reject.grant?.boon === boon ? 'reject' : 'approve';
    const state = { ...initialState(), current: card };
    launch(state);
    resolve({ ...state, current: daily }, side);
    expect(play).toHaveBeenCalledWith(boon === 'bullet' ? 'shot' : 'boon');
  },
);
it.each(['sugar_low', 'true'])(
  'plays unlock when %s is recorded and avoids replay on language refresh',
  (id) => {
    const state = { ...initialState(), current: daily };
    launch(state);
    resolve({ ...state, ending: { id } });
    expect(root.querySelector('.ending-screen')).not.toBeNull();
    expect(play).toHaveBeenCalledWith('unlock');
    play.mockClear();
    setLanguage('en');
    expect(play).not.toHaveBeenCalled();
    setLanguage('ko');
  },
);
it('plays rewind without replaying paper, danger, or adding a stamp', async () => {
  const state = {
    ...initialState(),
    year: 160,
    current: daily,
    boons: { rewind: true as const },
  };
  launch(state);
  resolve({ ...state, ending: { id: 'sugar_low' } });
  const count = loadSettings().stampsSeen;
  play.mockClear();
  click('[data-rewind="yes"]');
  expect(play).toHaveBeenCalledWith('rewind');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  await Promise.resolve();
  expect(play.mock.calls.some(([name]) => name === 'paper')).toBe(false);
  expect(loadSettings().stampsSeen).toBe(count);
});

it('sounds forced sleep once when its scene follows another scene', () => {
  const state = { ...initialState(), current: daily };
  launch(state);
  resolve({ ...state, sleep: 3, scene: 'speakiFooled', asleepPending: true });
  expect(play.mock.calls.filter(([name]) => name === 'drowse')).toHaveLength(0);
  click('.scene-next');
  expect(play.mock.calls.filter(([name]) => name === 'drowse')).toHaveLength(1);
  click('.scene-next');
  expect(play.mock.calls.filter(([name]) => name === 'drowse')).toHaveLength(1);
});
