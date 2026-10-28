// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '../src/ui/app';
import {
  emptyCollection,
  loadCollection,
  loadMode,
  loadSettings,
  saveCollection,
  saveSettings,
} from '../src/save/storage';
import { setSoundEnabled, setSoundVolume } from '../src/ui/sound';
import system from '../data/system.json';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';
import * as sound from '../src/ui/sound';

let root: HTMLDivElement;
let dispose: (() => void) | undefined;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
const key = (key: string, target: EventTarget = window, repeat = false) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
const launch = () => {
  dispose = mount(root);
};
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  saveSettings({
    sfx: 100,
    lastSfx: 100,
    bgm: 100,
    language: 'ko',
    tutorialSeen: true, musicAsked: true,
  });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each(['apprentice', 'priest'] as const)(
  'stamps %s with Enter, ignoring held arrow repeats',
  (mode) => {
    const next = vi.spyOn(deck, 'nextDocument');
    const play = vi.spyOn(sound, 'playSound');
    launch();
    const selected = () =>
      root.querySelector<HTMLElement>('[aria-checked="true"]')!;
    const arrow = mode === 'apprentice' ? 'ArrowLeft' : 'ArrowRight';
    if (mode === 'apprentice') key(arrow, selected());
    key(arrow, selected(), true);
    expect(next).not.toHaveBeenCalled();
    key('Enter', selected());
    expect(
      root.querySelector(`[data-mode="${mode}"] .title-imprint`),
    ).not.toBeNull();
    expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
    expect(
      root
        .querySelector(`[data-mode="${mode}"]`)!
        .classList.contains('stamped'),
    ).toBe(true);
    expect(root.querySelector('.title-stamp')!.classList.contains('used')).toBe(
      true,
    );
    vi.advanceTimersByTime(619);
    expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(next.mock.calls[0]![0].mode).toBe(mode);
    expect(loadMode()).toBe(mode);
  },
);

it.each(['Enter', ' '])('stamps the selected paper with %s', (action) => {
  const next = vi.spyOn(deck, 'nextDocument');
  const play = vi.spyOn(sound, 'playSound');
  launch();
  key(action, root.querySelector('[aria-checked="true"]')!);
  expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
  vi.advanceTimersByTime(620);
  expect(next.mock.calls[0]![0].mode).toBe('priest');
});

it.each(['apprentice', 'priest'] as const)(
  'drags the approval stamp onto %s',
  (mode) => {
    const next = vi.spyOn(deck, 'nextDocument');
    const play = vi.spyOn(sound, 'playSound');
    launch();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (!this.dataset.mode) return new DOMRect(-200, 0, 100, 100);
        return new DOMRect(
          this.dataset.mode === 'apprentice' ? 0 : 200,
          0,
          100,
          100,
        );
      },
    );
    const home = root.querySelector('.title-stamp')!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      home.dispatchEvent(event);
    };
    pointer('pointerdown', 150, 200);
    pointer('pointermove', 600, 400);
    expect(root.querySelector<HTMLElement>('.title-ghost')!.style.left).toBe(
      '600px',
    );
    pointer('pointerup', 600, 400);
    expect(root.querySelector('.ghost.returning')).not.toBeNull();
    vi.advanceTimersByTime(240);
    expect(next).not.toHaveBeenCalled();
    expect(root.querySelector('.ghost')).toBeNull();
    expect(play).not.toHaveBeenCalled();
    pointer('pointerdown', 150, 200);
    pointer('pointerup', mode === 'apprentice' ? 50 : 250, 50);
    expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
    vi.advanceTimersByTime(620);
    expect(next.mock.calls[0]![0].mode).toBe(mode);
  },
);

it('selects by tap, then stamps, and prevents changing mode during the imprint', () => {
  const next = vi.spyOn(deck, 'nextDocument');
  const play = vi.spyOn(sound, 'playSound');
  launch();
  click('[data-mode="apprentice"]');
  expect(next).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
  click('[data-mode="apprentice"]');
  key('ArrowRight', root.querySelector('[data-mode="apprentice"]')!);
  expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
  vi.advanceTimersByTime(620);
  expect(next.mock.calls[0]![0].mode).toBe('apprentice');
});

it('adds Erpin under Ner after an apprentice clear and the patting arm over her after a priest clear', () => {
  const layers = () =>
    [...root.querySelectorAll<HTMLElement>('.intro-art > .art-slot')].map(
      (slot) => slot.dataset.artSlot,
    );
  launch();
  expect(layers()).toEqual(['ui.nerIntro']);
  dispose?.();
  saveCollection({
    ...emptyCollection(),
    cleared: { ...emptyCollection().cleared, apprentice: true },
  });
  launch();
  expect(layers()).toEqual(['ui.titleErpin', 'ui.nerIntro']);
  dispose?.();
  saveCollection({
    ...emptyCollection(),
    cleared: { ...emptyCollection().cleared, apprentice: true, priest: true },
  });
  launch();
  expect(layers()).toEqual([
    'ui.titleErpin',
    'ui.nerIntro',
    'ui.titlePlate',
    'ui.titlePat',
  ]);
});

it('places the stamp beside the intro art and title controls outside the footer', () => {
  launch();
  const stage = root.querySelector('.title-screen > .title-stage')!;
  expect(stage.querySelector('.intro-art')!.nextElementSibling).toBe(
    stage.querySelector('.title-stamp-home'),
  );
  expect(root.querySelector('.title-copy .title-stamp-home')).toBeNull();
  // the tutorial button sits right beside the title
  expect(
    root.querySelector('.title-head > h1 + .tutorial-open.title-tutorial'),
  ).not.toBeNull();
  expect(
    root.querySelector('.title-screen > .options-open.title-options'),
  ).not.toBeNull();
  expect(root.querySelector('.title-desk .tutorial-open')).toBeNull();
});

it('shows three records and migrates legacy true endings only to priest', () => {
  localStorage.setItem(
    'ner-m1-collection',
    JSON.stringify({ bestYear: 200, endings: ['true'] }),
  );
  expect(loadCollection().cleared).toEqual({ apprentice: false, priest: true });
  launch();
  expect(
    [...root.querySelectorAll<HTMLElement>('.title-record')].map(
      (record) => record.dataset.record,
    ),
  ).toEqual(['apprentice', 'priest', 'bishop']);
  expect(root.textContent).not.toContain('로그라이크');
  expect(
    root.querySelector('[data-record="apprentice"]')!.textContent,
  ).toContain(system.title.noRecord);
  expect(root.querySelector('[data-record="priest"]')!.textContent).toContain(
    '200년',
  );
  expect(root.querySelectorAll('.clear-seal')).toHaveLength(1);
  expect(
    root
      .querySelector('[data-mode="priest"] .clear-seal')!
      .getAttribute('aria-label'),
  ).toBe(system.clear.priest);
});

it.each(['apprentice', 'priest'] as const)(
  'records a true ending in %s only',
  (mode) => {
    launch();
    if (mode === 'apprentice') click('[data-mode="apprentice"]');
    click(`[data-mode="${mode}"]`);
    vi.advanceTimersByTime(620);
    root.querySelector<HTMLButtonElement>('.scene-next')?.click();
    const process = vi
      .spyOn(loop, 'processDocument')
      .mockImplementation((state) => ({ ...state, ending: { id: 'true' } }));
    key('ArrowRight');
    key('ArrowRight');
    key(' ');
    expect(process).toHaveBeenCalled();
    expect(loadCollection().cleared).toEqual({
      apprentice: mode === 'apprentice',
      priest: mode === 'priest',
    });
  },
);

it('persists sliders and language, remembers unmuted volume, and resets only records', () => {
  saveCollection({
    bestYear: { apprentice: 80, priest: 200, bishop: 0 },
    endings: ['true'],
    bishopUnlocked: true,
    cleared: { apprentice: false, priest: true },
  });
  launch();
  click('.options-open');
  for (const [name, value] of [['sfx', '37'], ['bgm', '42']]) {
    const input = root.querySelector<HTMLInputElement>(
      `[data-volume="${name}"]`,
    )!;
    input.value = value!;
    input.dispatchEvent(new Event('input'));
  }
  expect(root.querySelector('.bgm-credit')?.textContent).toBe(system.options.bgmNote);
  expect(loadSettings().bgm).toBe(42);
  expect(root.querySelector('[data-volume="bgm"] + output')?.textContent).toBe('42');
  expect(
    [...root.querySelectorAll('.flag + .flag-name')].map(
      (el) => el.textContent,
    ),
  ).toEqual(Object.values(system.options.languages));
  // three flags pick the language; the current one is checked
  const flags = [...root.querySelectorAll<HTMLButtonElement>('.flag')];
  expect(flags.map((flag) => flag.dataset.lang)).toEqual(['ko', 'en', 'ja']);
  expect(flags.map((flag) => flag.getAttribute('aria-checked'))).toEqual([
    'true',
    'false',
    'false',
  ]);
  const settings = loadSettings();
  expect(settings).toMatchObject({
    sfx: 37,
    lastSfx: 37,
    bgm: 42,
    language: 'ko',
  });
  setSoundEnabled(false);
  expect(loadSettings().sfx).toBe(0);
  setSoundEnabled(true);
  expect(loadSettings().sfx).toBe(37);
  expect(root.querySelector('.preferences-card h3')).toBeNull();
  expect(root.querySelector('.preferences-card .tutorial-open')).toBeNull();
  click('.erase-records');
  expect(document.activeElement).toBe(root.querySelector('.erase-no'));
  click('.erase-no');
  expect(document.activeElement).toBe(root.querySelector('.erase-records'));
  expect(loadCollection().endings).toEqual(['true']);
  click('.erase-records');
  click('.erase-yes');
  expect(loadCollection()).toEqual(emptyCollection());
  expect(loadSettings()).toEqual(settings);
  expect(root.querySelector('.reset-status')!.textContent).toBe(
    system.options.eraseDone,
  );
  click('[data-close]');
  expect(root.querySelectorAll('.clear-seal')).toHaveLength(0);
  expect(root.querySelector('[data-record="priest"]')!.textContent).toContain(
    system.title.noRecord,
  );
  click('.options-open');
  expect(
    root.querySelector<HTMLInputElement>('[data-volume="sfx"]')!.value,
  ).toBe('37');
  key('Escape');
  expect(root.querySelector('.preferences-overlay')).toBeNull();
});

it('opens options from the game menu and restores menu input', () => {
  launch();
  click('[aria-checked="true"]');
  vi.advanceTimersByTime(620);
  root.querySelector<HTMLButtonElement>('.scene-next')?.click();
  click('.menu-button');
  click('[data-menu="options"]');
  setSoundVolume(0);
  key('Escape');
  expect(root.querySelector<HTMLElement>('.menu')!.hidden).toBe(false);
  key('Escape');
  expect(root.querySelector<HTMLElement>('.menu')!.hidden).toBe(true);
});

it('offers tutorial once, navigates every focus over the real desk and returns to title', () => {
  saveSettings({ ...loadSettings(), tutorialSeen: false, musicAsked: true });
  launch();
  expect(root.querySelector('.tutorial-accept')).not.toBeNull();
  click('.tutorial-accept');
  expect(root.querySelector('.tutorial-demo .document')).not.toBeNull();
  expect(
    root.querySelector('.tutorial-demo .preview-dot:not([hidden]) .pips'),
  ).not.toBeNull();
  expect(
    root.querySelector<HTMLButtonElement>('.tutorial-prev')!.disabled,
  ).toBe(true);
  for (const [index, step] of system.tutorial.steps.entries()) {
    expect(
      root.querySelector('.preferences-overlay')!.getAttribute('data-focus'),
    ).toBe(step.focus ?? '');
    expect(root.querySelector('#tutorial-title')!.textContent).toBe(step.title);
    if (index === 1) {
      click('.tutorial-prev');
      expect(root.querySelector('#tutorial-title')!.textContent).toBe(
        system.tutorial.steps[0]!.title,
      );
      click('.tutorial-next');
    }
    click('.tutorial-next');
  }
  expect(root.querySelector('.preferences-overlay')).toBeNull();
  expect(root.querySelector('.title-screen')).not.toBeNull();
  dispose!();
  launch();
  expect(root.querySelector('.tutorial-accept')).toBeNull();
  click('.tutorial-open');
  key('Escape');
  expect(root.querySelector('.preferences-overlay')).toBeNull();
  click('.tutorial-open');
  click('[data-close]');
  expect(root.querySelector('.preferences-overlay')).toBeNull();
});

it('keeps the title usable after skipping the first-launch offer and does not offer again', () => {
  saveSettings({ ...loadSettings(), tutorialSeen: false, musicAsked: true });
  launch();
  click('[data-close]');
  expect(root.querySelector<HTMLElement>('.title-screen')!.inert).not.toBe(
    true,
  );
  dispose!();
  launch();
  expect(root.querySelector('.preferences-overlay')).toBeNull();
  const next = vi.spyOn(deck, 'nextDocument');
  click('[aria-checked="true"]');
  vi.advanceTimersByTime(620);
  expect(next).toHaveBeenCalledTimes(1);
});

it('confirms a forced bishop unlock, updates the title immediately and persists it', () => {
  const before = emptyCollection();
  before.bestYear.priest = 80;
  before.endings = ['sleep'];
  saveCollection(before);
  launch();
  const bishop = root.querySelector<HTMLButtonElement>('[data-mode="bishop"]')!;
  expect(bishop.getAttribute('aria-disabled')).toBe('true');
  click('.options-open');
  expect(root.querySelectorAll('.danger-row button')).toHaveLength(2);
  expect(root.querySelector<HTMLElement>('.unlock-confirm')!.hidden).toBe(true);
  click('.unlock-bishop');
  expect(document.activeElement).toBe(root.querySelector('.unlock-no'));
  key('Tab');
  expect(document.activeElement).toBe(root.querySelector('.unlock-yes'));
  click('.unlock-no');
  expect(document.activeElement).toBe(root.querySelector('.unlock-bishop'));
  expect(loadCollection()).toEqual(before);
  click('.erase-records');
  click('.unlock-bishop');
  expect(root.querySelector<HTMLElement>('.erase-confirm')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('.unlock-confirm')!.hidden).toBe(
    false,
  );
  click('.unlock-yes');
  expect(loadCollection()).toEqual({ ...before, bishopUnlocked: true });
  expect(bishop.hasAttribute('aria-disabled')).toBe(false);
  expect(bishop.hasAttribute('data-tip')).toBe(false);
  expect(bishop.hasAttribute('data-tip-title')).toBe(false);
  expect(bishop.hasAttribute('data-tip-text')).toBe(false);
  expect(bishop.querySelector('.mode-lock')).toBeNull();
  expect(root.querySelector('.reset-status')!.textContent).toBe(
    system.options.unlockDone,
  );
  expect(
    root.querySelector<HTMLButtonElement>('.unlock-bishop')!.disabled,
  ).toBe(true);
  expect(root.querySelector('.unlock-bishop')!.textContent).toBe(
    system.options.unlocked,
  );
  click('[data-close]');
  click('[data-mode="bishop"]');
  expect(loadMode()).toBe('bishop');
  dispose!();
  launch();
  expect(
    root.querySelector('[data-mode="bishop"]')!.getAttribute('aria-checked'),
  ).toBe('true');
  expect(root.querySelector('.mode-lock')).toBeNull();
  click('.options-open');
  expect(
    root.querySelector<HTMLButtonElement>('.unlock-bishop')!.disabled,
  ).toBe(true);
});

it.each(['apprentice', 'priest'] as const)(
  'disables bishop unlock after a %s clear',
  (mode) => {
    const collection = emptyCollection();
    collection.cleared[mode] = true;
    saveCollection(collection);
    launch();
    click('.options-open');
    const button = root.querySelector<HTMLButtonElement>('.unlock-bishop')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(system.options.unlocked);
    button.click();
    expect(root.querySelector<HTMLElement>('.unlock-confirm')!.hidden).toBe(
      true,
    );
    expect(loadCollection().bishopUnlocked).toBe(false);
  },
);
