// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openTutorial, openOptions } from '../src/ui/preferences';
import { system, setLanguage } from '../src/i18n';
import { mount } from '../src/ui/app';
import { loadSettings, saveSettings } from '../src/save/storage';
import cards from '../data/cards/m1.json';
import { materializeCard } from '../src/core/deck';
import type { Card } from '../src/core/state';
import { documentMarkup } from '../src/ui/document';

let root: HTMLDivElement;
let dispose: (() => void) | undefined;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
const key = (value: string, repeat = false) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: value,
      repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
const line = () => root.querySelector<HTMLElement>('.tutorial-try')!;
const snapshot = () => JSON.stringify({ ...localStorage });
const demo = () => root.querySelector<HTMLElement>('.tutorial-demo')!;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => ({}) as Animation),
  });
  localStorage.clear();
  saveSettings({ ...loadSettings(), tutorialSeen: true, musicAsked: true });
  setLanguage('en');
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  root
    .querySelectorAll('.preferences-overlay')
    .forEach((el) => el.dispatchEvent(new Event('dispose')));
  dispose?.();
  dispose = undefined;
  root.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

it.each(['ArrowLeft', 'ArrowRight'])(
  'stamps with %s twice, ignores axe and navigation while busy, and resets',
  (arrow) => {
    openTutorial(root);
    const saved = snapshot();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(demo().dataset.live).toBe('true');
    expect(demo().hasAttribute('inert')).toBe(false);
    key('ArrowDown');
    key('ArrowDown');
    click('.tool.axe');
    expect(demo().querySelector('.processed-axe')).toBeNull();
    key(arrow);
    key(arrow, true);
    expect(demo().querySelector('.ink')).toBeNull();
    key(arrow);
    expect(demo().querySelector('.ink')).not.toBeNull();
    expect(line().dataset.state).toBe('try');
    click('.tutorial-next');
    expect(
      root.querySelector('.preferences-overlay')!.getAttribute('data-step'),
    ).toBe('0');
    vi.runAllTimers();
    expect(line().textContent).toBe(system.tutorial.steps[0]!.success);
    expect(
      demo().querySelector('.processed-approve, .processed-reject'),
    ).toBeNull();
    expect(demo().querySelector('.gain, .loss')).not.toBeNull();
    key(arrow);
    key(arrow);
    vi.runAllTimers();
    expect(line().dataset.state).toBe('success');
    expect(snapshot()).toBe(saved);
    expect(writes).not.toHaveBeenCalled();
    click('.tutorial-next');
    expect(demo().hasAttribute('inert')).toBe(true);
    click('.tutorial-prev');
    expect(line().dataset.state).toBe('try');
    expect(demo().querySelector('[aria-valuenow="50"]')).not.toBeNull();
  },
);

it('uses only the axe on step 4, adds drowse and resets on return', () => {
  openTutorial(root, 4);
  const saved = snapshot();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe('0');
  key('ArrowLeft');
  key('ArrowLeft');
  click('.tool.approve');
  click('.tool.approve');
  expect(demo().querySelector('.ink')).toBeNull();
  key('ArrowDown');
  key('ArrowDown');
  expect(demo().querySelector('.chopped')).not.toBeNull();
  click('.tutorial-prev');
  expect(
    root.querySelector('.preferences-overlay')!.getAttribute('data-step'),
  ).toBe('4');
  vi.runAllTimers();
  expect(line().textContent).toBe(system.tutorial.steps[4]!.success);
  expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe('1');
  expect(demo().querySelector('.chopped')).toBeNull();
  expect(snapshot()).toBe(saved);
  expect(writes).not.toHaveBeenCalled();
  click('.tutorial-prev');
  click('.tutorial-next');
  expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe('0');
  expect(line().dataset.state).toBe('try');
});

it('shows neutral preview dots without a toggle', () => {
  openTutorial(root, 2);
  expect(root.querySelectorAll('.tutorial-toggle:not([hidden])')).toHaveLength(0);
  const dots = [...demo().querySelectorAll<HTMLElement>('.preview-dot:not([hidden])')];
  expect(dots.length).toBeGreaterThan(0);
  expect(dots.every((dot) => !dot.dataset.dir)).toBe(true);
});

it('switches the era while retaining neutral preview dots', () => {
  openTutorial(root, 3);
  const dots = () => [...demo().querySelectorAll<HTMLElement>('.preview-dot:not([hidden])')];
  const cool = dots().map((dot) => Number(dot.dataset.tier));
  const counts = dots().map((dot) => dot.dataset.pips);
  click('[data-toggle="era"] button:nth-child(2)');
  expect(dots().every((dot, i) => Number(dot.dataset.tier) > cool[i]!)).toBe(true);
  expect(dots().every((dot) => !dot.dataset.dir)).toBe(true);
  expect(dots().map((dot) => dot.dataset.pips)).toEqual(counts);
});

it.each([1, 2, 3, 7])(
  'keeps step %i inert and prevents keyboard actions',
  (step) => {
    openTutorial(root, step);
    expect(demo().hasAttribute('inert')).toBe(true);
    expect(demo().getAttribute('aria-hidden')).toBe('true');
    expect(demo().dataset.live).toBeUndefined();
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowDown');
    key('ArrowDown');
    expect(demo().querySelector('.ink, .chopped')).toBeNull();
  },
);

it.each([
  [0, 'approve'],
  [0, 'reject'],
  [4, 'axe'],
  [6, 'axe'],
] as const)(
  'drags the permitted %s/%s tool using real desk input',
  (step, action) => {
    openTutorial(root, step);
    const tool = demo().querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    )!;
    vi.spyOn(
      demo().querySelector('.document')!,
      'getBoundingClientRect',
    ).mockReturnValue({
      left: 100,
      right: 300,
      top: 100,
      bottom: 400,
    } as DOMRect);
    for (const [type, x, y] of [
      ['pointerdown', 0, 0],
      ['pointermove', 150, 200],
      ['pointerup', 150, 200],
    ] as const) {
      const event = new MouseEvent(type, {
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      tool.dispatchEvent(event);
    }
    expect(demo().querySelector(`.processed-${action}`)).not.toBeNull();
    vi.runAllTimers();
    demo().querySelector<HTMLButtonElement>('.scene-next')?.click();
    expect(line().dataset.state).toBe('success');
  },
);

it('catches a materialized Speaki forgery with only the axe and no sandbox writes', () => {
  openTutorial(root, 6);
  const saved = snapshot();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const source = (cards as Card[]).find(
    (card) => card.kind === 'speaki' && !!card.mimic && card.axe === 'free',
  )!;
  const expected = document.createElement('div');
  expected.innerHTML = documentMarkup(materializeCard(source, cards as Card[]));
  expect(demo().querySelector('.document')!.textContent).toBe(
    expected.querySelector('.document')!.textContent,
  );
  expect(demo().hasAttribute('inert')).toBe(false);
  expect(
    [...demo().querySelectorAll<HTMLButtonElement>('.tool:not(:disabled)')].map(
      (tool) => tool.dataset.action,
    ),
  ).toEqual(['axe']);
  for (const arrow of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
    key(arrow);
    key(arrow);
  }
  click('.tool.approve');
  click('.tool.reject');
  expect(demo().querySelector('.ink, .chopped')).toBeNull();
  for (let attempt = 0; attempt < 2; attempt++) {
    const paper = demo().querySelector('.document');
    key('ArrowDown');
    key('ArrowDown');
    expect(demo().querySelector('.chopped')).not.toBeNull();
    vi.runAllTimers();
    expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe(
      '0',
    );
    expect(demo().querySelector('.scene')!.textContent).toContain(
      system.scenes.speakiCaught.title,
    );
    expect(document.activeElement).toBe(demo().querySelector('.scene-next'));
    key('ArrowDown');
    key('ArrowDown');
    click('.tutorial-next');
    expect(
      root.querySelector('[data-dialog="tutorial"]')!.getAttribute('data-step'),
    ).toBe('6');
    expect(demo().querySelector('.chopped')).toBeNull();
    click('.scene-next');
    expect(demo().querySelector('.scene')).toBeNull();
    expect(demo().querySelector('.document')).not.toBe(paper);
    expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe(
      '0',
    );
    expect(line().textContent).toBe(system.tutorial.steps[6]!.success);
  }
  expect(snapshot()).toBe(saved);
  expect(writes).not.toHaveBeenCalled();
  click('.tutorial-prev');
  expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe('2');
  click('.tutorial-next');
  expect(line().dataset.state).toBe('try');
});

it('uses demo kinds and preview labels after inserting a step', () => {
  const steps = system.tutorial.steps;
  steps.unshift({ ...steps[1]! });
  try {
    openTutorial(root, 4);
    expect(
      root.querySelector('[data-toggle="era"]')!.hasAttribute('hidden'),
    ).toBe(false);
    click('.tutorial-next');
    expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe(
      '0',
    );
    click('.tutorial-next');
    expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe(
      '2',
    );
    key('ArrowDown');
    key('ArrowDown');
    vi.runAllTimers();
    expect(demo().querySelector('.scene')!.textContent).toContain(
      system.scenes.asleep.title,
    );
  } finally {
    steps.shift();
  }
});

it('runs three random Erpin stamps, wakes, and replays without sandbox writes', () => {
  openTutorial(root, 5);
  const saved = snapshot();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const drowse = () =>
    demo().querySelector('.desk')!.getAttribute('data-drowse');
  expect(drowse()).toBe('2');
  expect(demo().querySelectorAll('.drowse i.on')).toHaveLength(2);
  expect(
    [...demo().querySelectorAll<HTMLButtonElement>('.tool:not(:disabled)')].map(
      (tool) => tool.dataset.action,
    ),
  ).toEqual(['axe']);
  key('ArrowRight');
  key('ArrowRight');
  click('.tool.approve');
  click('.tool.reject');
  expect(demo().querySelector('.ink, .chopped')).toBeNull();

  for (let round = 0; round < 2; round++) {
    demo().querySelector<HTMLButtonElement>('.tool.axe')!.focus();
    key('ArrowDown');
    key('ArrowDown');
    expect(drowse()).toBe('2');
    expect(demo().querySelector('.chopped')).not.toBeNull();
    click('.tutorial-next');
    click('.tutorial-prev');
    expect(
      root.querySelector('[data-dialog="tutorial"]')!.getAttribute('data-step'),
    ).toBe('5');
    vi.runAllTimers();
    expect(demo().querySelector('.scene')!.textContent).toContain(
      system.scenes.asleep.title,
    );
    expect(document.activeElement).toBe(demo().querySelector('.scene-next'));
    expect(line().dataset.state).toBe('try');
    click('.scene-next');
    expect(demo().querySelector('.hint')!.textContent).toBe(
      system.ui.sleepHint,
    );

    for (const [i, random] of [0.49, 0.5, 0.1].entries()) {
      const paper = demo().querySelector('.document');
      vi.spyOn(Math, 'random').mockReturnValue(random);
      if (i === 0) key('ArrowRight');
      else if (i === 1) click('.tool.reject');
      else
        demo().dispatchEvent(
          new MouseEvent('pointerdown', { button: 0, bubbles: true }),
        );
      expect(demo().querySelector('.erpin-ghost')).not.toBeNull();
      expect(
        demo().querySelector(
          `.processed-${random < 0.5 ? 'reject' : 'approve'}`,
        ),
      ).not.toBeNull();
      click('.tutorial-prev');
      expect(
        root
          .querySelector('[data-dialog="tutorial"]')!
          .getAttribute('data-step'),
      ).toBe('5');
      vi.advanceTimersByTime(1600);
      expect(demo().querySelector('.document')).not.toBe(paper);
      expect(Boolean(demo().querySelector('.sleeping'))).toBe(i < 2);
      expect(line().dataset.state).toBe(i < 2 ? 'try' : 'success');
    }
    expect(drowse()).toBe('0');
    expect(line().textContent).toBe(system.tutorial.steps[5]!.success);
    vi.runAllTimers();
    expect(demo().querySelector('.ink, .chopped')).toBeNull();
  }
  expect(snapshot()).toBe(saved);
  expect(writes).not.toHaveBeenCalled();
  click('.tutorial-prev');
  click('.tutorial-next');
  expect(drowse()).toBe('2');
  expect(line().dataset.state).toBe('try');
});

it('cancels pending sleep stamps when leaving or closing the step', () => {
  openTutorial(root, 5);
  key('ArrowDown');
  key('ArrowDown');
  vi.runAllTimers();
  click('.scene-next');
  click('.tutorial-next');
  vi.runAllTimers();
  expect(demo().querySelector('.sleeping, .ink')).toBeNull();
  click('.tutorial-prev');
  expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe('2');
  key('ArrowDown');
  key('ArrowDown');
  key('Escape');
  vi.runAllTimers();
  expect(root.querySelector('[data-dialog="tutorial"]')).toBeNull();
});

it.each(['ko', 'en', 'ja'] as const)(
  'automatically completes exactly three sleep stamps in %s',
  (language) => {
    setLanguage(language);
    openTutorial(
      root,
      system.tutorial.steps.findIndex((step) => step.demo === 'sleep'),
    );
    key('ArrowDown');
    key('ArrowDown');
    vi.runAllTimers();
    click('.scene-next');
    const documents = vi.spyOn(demo(), 'innerHTML', 'set');
    vi.advanceTimersByTime(1299);
    expect(demo().querySelector('.erpin-ghost')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(demo().querySelector('.erpin-ghost')).not.toBeNull();
    vi.runAllTimers();
    expect(documents).toHaveBeenCalledTimes(3);
    expect(demo().querySelector('.sleeping, .scene')).toBeNull();
    expect(demo().querySelector('.desk')!.getAttribute('data-drowse')).toBe(
      '0',
    );
    expect(line().dataset.state).toBe('success');
  },
);

it('keeps nested modal keyboard navigation, focus and cleanup working', () => {
  openOptions(
    root,
    () => {},
    () => {},
  );
  const trigger = root.querySelector<HTMLButtonElement>('.erase-records')!;
  trigger.focus();
  openTutorial(root);
  const saved = snapshot();
  key('Tab');
  expect(
    root
      .querySelector('[data-dialog="tutorial"]')!
      .contains(document.activeElement),
  ).toBe(true);
  key('ArrowRight');
  key('ArrowRight');
  key('Escape');
  vi.runAllTimers();
  expect(root.querySelector('[data-dialog="tutorial"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(snapshot()).toBe(saved);
  key('Escape');
  expect(root.querySelector('.preferences-overlay')).toBeNull();
});

it('has no tutorial button and leaves a real run unchanged from in-game options', () => {
  dispose = mount(root);
  click('[aria-checked="true"]');
  vi.advanceTimersByTime(620);
  root.querySelector<HTMLButtonElement>('.scene-next')?.click();
  click('.menu-button');
  click('[data-menu="options"]');
  expect(
    root.querySelector('[data-dialog="options"] .tutorial-open'),
  ).toBeNull();
  const saved = snapshot();
  const desk = root.querySelector('.desk');
  key('ArrowRight');
  key('ArrowRight');
  vi.runAllTimers();
  key('Escape');
  expect(root.querySelector('.desk')).toBe(desk);
  expect(snapshot()).toBe(saved);
  expect(root.querySelector<HTMLElement>('.menu')!.hidden).toBe(false);
});
