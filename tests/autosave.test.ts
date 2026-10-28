// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '../src/ui/app';
import { initialState, type Card, type State } from '../src/core/state';
import {
  clearRun,
  emptyCollection,
  loadCollection,
  loadRun,
  loadSettings,
  saveCollection,
  saveRun,
  saveSettings,
} from '../src/save/storage';
import cardsData from '../data/cards/m1.json';
import system from '../data/system.json';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';

const cards = cardsData as Card[];
let root: HTMLDivElement;
let dispose: (() => void) | undefined;
let state: State;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
const key = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const start = () => {
  click('.mode-option[aria-checked="true"]');
  vi.advanceTimersByTime(620);
};
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  saveSettings({
    sfx: 0,
    lastSfx: 100,
    bgm: 0,
    language: 'ko',
    tutorialSeen: true, musicAsked: true,
  });
  root = document.createElement('div');
  document.body.append(root);
  state = {
    ...initialState('apprentice'),
    year: 42,
    rewindYear: 42,
    current: cards.find((c) => c.kind === 'daily')!,
    gauges: { sugar: 35, people: 65, faith: 45, erpin: 55 },
    boons: { alice: true, rewind: true },
    drowse: { stack: 2, left: 3 },
    sleep: 2,
  };
  vi.spyOn(history, 'pushState').mockImplementation(() => {});
  vi.spyOn(history, 'back').mockImplementation(() => {});
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  root.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('round trips a run and all rewind snapshots', () => {
  const { past: _, ...snapshot } = state;
  state.past = [snapshot];
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
  clearRun();
  expect(loadRun(cards)).toBeNull();
});
it.each([
  'json',
  'version',
  'shape',
  'current',
  'scheduled',
  'seen',
  'recent',
  'windowYears',
  'appearanceYears',
  'past',
])('discards invalid formats and repairs removed ids: %s', (kind) => {
  const value = { version: 1, state: structuredClone(state) };
  if (kind === 'version') value.version = 99;
  if (kind === 'shape') (value as any).state = {};
  if (kind === 'current') value.state.current!.id = 'removed';
  if (kind === 'scheduled' || kind === 'windowYears')
    value.state[kind] = { removed: 10 };
  if (kind === 'appearanceYears')
    value.state.appearanceYears = { removed: [10] };
  if (kind === 'seen' || kind === 'recent') value.state[kind] = ['removed'];
  if (kind === 'past') {
    const { past: _, ...snapshot } = structuredClone(state);
    snapshot.current!.id = 'removed';
    value.state.past = [snapshot];
  }
  localStorage.setItem(
    'ner-m1-run',
    kind === 'json' ? '{' : JSON.stringify(value),
  );
  const loaded = loadRun(cards);
  if (['json', 'version', 'shape'].includes(kind)) {
    expect(loaded).toBeNull();
    expect(localStorage.getItem('ner-m1-run')).toBeNull();
  } else {
    expect(loaded).not.toBeNull();
    expect(localStorage.getItem('ner-m1-run')).not.toBeNull();
    if (kind === 'current') {
      expect(loaded!.current).toBeNull();
      expect(
        deck.nextDocument(loaded!, cards, () => 0.5).current,
      ).not.toBeNull();
    } else if (kind === 'past') expect(loaded!.past[0]!.current).toBeNull();
    else
      expect(loaded![kind as 'seen']).toEqual(
        ['seen', 'recent'].includes(kind) ? [] : {},
      );
  }
});
it('keeps storage failures optional', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw Error('blocked');
  });
  expect(() => saveRun(state)).not.toThrow();
  expect(() => clearRun()).not.toThrow();
  expect(loadRun(cards)).toBeNull();
});
it.each([null, 'asleep'])(
  'renders continue and restores the exact run with scene %s',
  (scene) => {
    state.scene = scene;
    saveRun(state);
    dispose = mount(root);
    expect(root.querySelector('.continue-name')!.textContent).toBe(
      system.title.continue,
    );
    expect(root.querySelector('.continue-detail')!.textContent).toBe(
      system.title.continueDetail
        .replace('{mode}', system.modes.apprentice.name)
        .replace('{year}', '42'),
    );
    const button = root.querySelector<HTMLButtonElement>('.title-continue')!;
    expect(button.tabIndex).toBe(0);
    expect(button.nextElementSibling!.className).toBe('continue-note');
    expect(
      button.compareDocumentPosition(root.querySelector('.mode-picker')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    button.focus();
    for (const k of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', {
        key: k,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    click('.title-continue');
    expect(loadRun(cards)).toEqual(state);
    expect(root.querySelector('.document h1')!.textContent).toBe(
      state.current!.title,
    );
    expect(!!root.querySelector('.scene')).toBe(!!scene);
    if (scene) {
      click('.scene-next');
      expect(loadRun(cards)!.scene).toBeNull();
    }
  },
);
it('restores a rewind prompt without recording an ending', () => {
  state.ending = { id: 'sugar_low' };
  saveRun(state);
  dispose = mount(root);
  click('.title-continue');
  expect(root.querySelector('.rewind')).not.toBeNull();
  expect(root.querySelector('.title-screen')).toBeNull();
  expect(root.querySelector('.document h1')!.textContent).toBe(
    state.current!.title,
  );
  expect(loadRun(cards)).toEqual(state);
  click('[data-rewind="no"]');
  expect(root.querySelector('.ending-screen')).not.toBeNull();
  expect(loadRun(cards)).toBeNull();
});
it('replaces a previous run when a new run starts', () => {
  saveRun(state);
  dispose = mount(root);
  start();
  expect(loadRun(cards)!.year).toBe(0);
  expect(loadRun(cards)!.mode).toBe('priest');
});
it('saves settled documents, retains the prior state during animation, and clears on ending', () => {
  state.sleep = 0;
  vi.spyOn(deck, 'nextDocument').mockReturnValue(state);
  dispose = mount(root);
  start();
  const next = { ...state, year: 43 };
  const process = vi.spyOn(loop, 'processDocument').mockReturnValue(next);
  key('ArrowRight');
  key('ArrowRight');
  window.dispatchEvent(new Event('pagehide'));
  expect(loadRun(cards)).toEqual(state);
  key(' ');
  expect(loadRun(cards)).toEqual(next);
  clearRun();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(loadRun(cards)).toEqual(next);
  process.mockReturnValue({ ...next, boons: {}, ending: { id: 'sugar_low' } });
  key('ArrowRight');
  key('ArrowRight');
  key(' ');
  expect(root.querySelector('.ending-screen')).not.toBeNull();
  expect(loadRun(cards)).toBeNull();
  window.dispatchEvent(new Event('pagehide'));
  expect(loadRun(cards)).toBeNull();
});
it.each(['title', 'game'])(
  'clears the save on records reset from %s',
  (screen) => {
    saveRun(state);
    saveCollection({ ...emptyCollection(), bishopUnlocked: true });
    dispose = mount(root);
    if (screen === 'game') {
      click('.title-continue');
      click('.menu-button');
      click('[data-menu="options"]');
    } else click('.options-open');
    click('.erase-records');
    click('.erase-yes');
    expect(loadCollection()).toEqual(emptyCollection());
    expect(
      root.querySelector<HTMLButtonElement>('.unlock-bishop')!.disabled,
    ).toBe(false);
    expect(loadRun(cards)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(loadRun(cards)).toBeNull();
    click('[data-close]');
    if (screen === 'title')
      expect(root.querySelector('.title-continue')).toBeNull();
  },
);

it.each(['title', 'game'])(
  'unlocks bishop from %s without discarding a run or settings',
  (screen) => {
    saveRun(state);
    dispose = mount(root);
    if (screen === 'game') {
      click('.title-continue');
      click('.menu-button');
      click('[data-menu="options"]');
    } else click('.options-open');
    const run = loadRun(cards);
    const settings = loadSettings();
    click('.unlock-bishop');
    click('.unlock-yes');
    expect(loadCollection().bishopUnlocked).toBe(true);
    expect(loadRun(cards)).toEqual(run);
    expect(loadSettings()).toEqual(settings);
    click('[data-close]');
    if (screen === 'game') {
      expect(root.querySelector<HTMLElement>('.menu')!.hidden).toBe(false);
      window.dispatchEvent(new Event('pagehide'));
    }
    expect(loadRun(cards)).toEqual(run);
  },
);
