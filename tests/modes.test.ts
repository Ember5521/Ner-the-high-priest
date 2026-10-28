// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import { initialState, type Card } from '../src/core/state';
import {
  loadMode,
  saveMode,
  saveSettings,
  loadCollection,
  saveCollection,
} from '../src/save/storage';
import { mount } from '../src/ui/app';
import { endingScreen, titleScreen } from '../src/ui/screens';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';

beforeEach(() => {
  vi.useFakeTimers();
  saveSettings({
    sfx: 100,
    lastSfx: 100,
    bgm: 100,
    language: 'ko',
    tutorialSeen: true, musicAsked: true,
  });
});
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
  vi.useRealTimers();
});

it.each(['apprentice', 'priest'] as const)(
  'updates only the played %s record during play and at the ending',
  (mode) => {
    vi.useFakeTimers();
    saveMode(mode);
    saveCollection({
      bestYear: { apprentice: 30, priest: 40, bishop: 0 },
      endings: ['sleep'],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    });
    const state = {
      ...initialState(mode),
      current: card,
      year: 80,
      bestYear: 90,
    };
    vi.spyOn(deck, 'nextDocument').mockReturnValueOnce(state);
    const process = vi
      .spyOn(loop, 'processDocument')
      .mockReturnValueOnce(state)
      .mockReturnValueOnce({ ...state, year: 70, ending: { id: 'faith_low' } });
    const root = document.createElement('div');
    document.body.append(root);
    dispose = mount(root);
    root
      .querySelector<HTMLButtonElement>('.mode-option[aria-checked="true"]')!
      .click();
    vi.advanceTimersByTime(620);
    const choose = () => {
      for (const key of ['ArrowRight', 'ArrowRight', ' '])
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    };
    choose();
    expect(process).toHaveBeenCalledTimes(1);
    const bestYear = { apprentice: 30, priest: 40, bishop: 0, [mode]: 90 };
    expect(loadCollection()).toEqual({
      bestYear,
      endings: ['sleep'],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    });
    root.querySelector<HTMLButtonElement>('.menu-button')!.click();
    expect(root.querySelector('.menu-note .best-year')!.textContent).toBe(
      `최장 재임 (${system.modes[mode].name}) 90년`,
    );
    root.querySelector<HTMLButtonElement>('[data-menu="resume"]')!.click();
    choose();
    expect(process).toHaveBeenCalledTimes(2);
    expect(loadCollection()).toEqual({
      bestYear,
      endings: ['sleep', 'faith_low'],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    });
    expect(root.querySelector('.ending-paper')!.textContent).toContain(
      `최장 재임 (${system.modes[mode].name}) 90년`,
    );
    root.querySelector<HTMLButtonElement>('.return')!.click();
    const other = mode === 'apprentice' ? 'priest' : 'apprentice';
    root.querySelector<HTMLButtonElement>(`[data-mode="${other}"]`)!.click();
    expect(root.querySelector(`[data-record="${other}"]`)!.textContent).toBe(
      `${system.modes[other].name} ${bestYear[other]}년`,
    );
    expect(root.querySelector('.album-count')!.textContent).toBe('2 / 12');
    expect(root.querySelectorAll('.album-card.found')).toHaveLength(2);
  },
);

it.each(['apprentice', 'priest'] as const)(
  'labels the %s record on both screens',
  (mode) => {
    const collection = {
      bestYear: { apprentice: 63, priest: 142, bishop: 0 },
      endings: [],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    };
    const state = { ...initialState(mode), ending: { id: 'true' } };
    const root = document.createElement('div');
    for (const markup of [
      titleScreen(collection, mode),
      endingScreen(state, collection),
    ]) {
      root.innerHTML = markup;
      expect(root.textContent).toContain(
        markup.includes('title-screen')
          ? `${system.modes[mode].name} ${collection.bestYear[mode]}년`
          : `최장 재임 (${system.modes[mode].name}) ${collection.bestYear[mode]}년`,
      );
    }
  },
);

it('defaults, validates and persists mode independently of the legacy collection', () => {
  expect(loadMode()).toBe('priest');
  localStorage.setItem(
    'ner-m1-collection',
    JSON.stringify({ bestYear: 42, endings: ['sleep'] }),
  );
  saveMode('apprentice');
  expect(loadMode()).toBe('apprentice');
  expect(loadCollection()).toEqual({
    bestYear: { apprentice: 0, priest: 42, bishop: 0 },
    endings: ['sleep'],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  });
  saveMode('priest');
  expect(loadMode()).toBe('priest');
  localStorage.setItem('ner-m1-mode', 'unknown');
  expect(loadMode()).toBe('priest');
});

it.each([false, true])(
  'selects by click and keyboard and keeps the mode on restart (blocked storage: %s)',
  (blocked) => {
    if (blocked)
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw Error('blocked');
        },
        setItem: () => {
          throw Error('blocked');
        },
      });
    expect(loadMode()).toBe('priest');
    expect(() => saveMode('apprentice')).not.toThrow();
    if (!blocked) saveMode('priest');
    const next = vi.spyOn(deck, 'nextDocument');
    const root = document.createElement('div');
    document.body.append(root);
    dispose = mount(root);
    const apprentice = root.querySelector<HTMLButtonElement>(
      '[data-mode="apprentice"]',
    )!;
    const priest = root.querySelector<HTMLButtonElement>(
      '[data-mode="priest"]',
    )!;
    expect(priest.getAttribute('aria-checked')).toBe('true');
    expect(priest.tabIndex).toBe(0);
    apprentice.click();
    expect(apprentice.getAttribute('aria-checked')).toBe('true');
    expect(priest.tabIndex).toBe(-1);
    for (const [button, key, selected] of [
      [apprentice, 'ArrowRight', priest],
      [priest, 'ArrowLeft', apprentice],
    ] as const) {
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      expect(selected.getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(selected);
    }
    root
      .querySelector<HTMLButtonElement>('.mode-option[aria-checked="true"]')!
      .click();
    vi.advanceTimersByTime(620);
    expect(next.mock.calls.at(-1)![0].mode).toBe('apprentice');
    root.querySelector<HTMLButtonElement>('.menu-button')!.click();
    root.querySelector<HTMLButtonElement>('[data-menu="restart"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-menu="confirm"]')!.click();
    expect(next.mock.calls.at(-1)![0].mode).toBe('apprentice');
    dispose();
    dispose = mount(root);
    expect(
      root.querySelector('[aria-checked="true"]')?.getAttribute('data-mode'),
    ).toBe(blocked ? 'priest' : 'apprentice');
  },
);

const card: Card = {
  ...(cards[0] as Card),
  kind: 'story',
  approve: { label: 'Test', effects: { sugar: 12, people: -20 } },
};
it.each(['apprentice', 'priest'] as const)(
  'renders pips, dim and hyean in %s',
  (mode) => {
    const state = initialState(mode);
    const root = document.createElement('div');
    root.innerHTML = gaugesMarkup(state);
    for (const dim of [false, true]) {
      state.drowse = { stack: dim ? 2 : 0, left: dim ? 4 : 0 };
      updateGaugePreview(root, card, 'approve', dim, state);
      for (const [gauge, dir, pips, direction] of [
        ['sugar', 'up', 3, '증가'],
        ['people', 'down', 4, '감소'],
      ] as const) {
        const dot = root.querySelector<HTMLElement>(
          `[data-gauge="${gauge}"] .preview-dot`,
        )!;
        const hiddenSize = dim;
        expect(dot.dataset.pips).toBe(String(hiddenSize ? 0 : pips));
        expect(dot.querySelectorAll('.pips > i')).toHaveLength(
          hiddenSize ? 0 : pips,
        );
        if (hiddenSize) expect(dot.querySelector('.pips.unknown')?.textContent).toBe('?');
        expect(dot.querySelector('.pips')?.classList.contains('unknown')).toBe(
          hiddenSize,
        );
        expect(dot.querySelector('.pips')?.getAttribute('aria-hidden')).toBe(
          'true',
        );
        expect(dot.dataset.dir).toBe(
          undefined,
        );
        expect(dot.getAttribute('aria-label')).toBe(
          hiddenSize
            ? '변화 있음, 크기·방향 불명'
            : `변화 크기 약 ${gauge === 'sugar' ? 12 : 20}, 방향 불명`,
        );
      }
      state.boons.hyean = { left: 5 };
      updateGaugePreview(root, card, 'approve', dim, state);
      for (const [gauge, dir, text, label] of [
        ['sugar', 'up', '+12', '증가 12'],
        ['people', 'down', '−20', '감소 20'],
      ]) {
        const dot = root.querySelector<HTMLElement>(
          `[data-gauge="${gauge}"] .preview-dot`,
        )!;
        expect(dot.classList.contains('exact')).toBe(true);
        expect(dot.dataset.dir).toBe(dir);
        expect(dot.textContent).toBe(text);
        expect(dot.getAttribute('aria-label')).toBe(label);
        expect(dot.querySelector('svg')).toBeNull();
      }
      delete state.boons.hyean;
    }
    updateGaugePreview(root, card, null, false, state);
    expect(root.querySelector('[data-dir]')).toBeNull();
  },
);

it.each(['apprentice', 'priest'] as const)(
  'shows the %s ending line below the year',
  (mode) => {
    const state = initialState(mode);
    state.ending = { id: 'true' };
    const root = document.createElement('div');
    root.innerHTML = endingScreen(state, {
      bestYear: { apprentice: 63, priest: 200, bishop: 0 },
      endings: [],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    });
    const line = root.querySelector('.ending-mode')!;
    expect(line.textContent).toBe(system.modes[mode].endingLine);
    expect(line.previousElementSibling?.textContent).toContain('에르피엔력');
  },
);
