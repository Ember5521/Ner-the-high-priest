// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import { initialState, type Card, type State } from '../src/core/state';
import * as deck from '../src/core/deck';
import { mount } from '../src/ui/app';
import { deskMarkup } from '../src/ui/desk';
import { documentMarkup } from '../src/ui/document';
import { liftTool, playAction, showWildNotice } from '../src/ui/fx';

const daily = (cards as Card[]).find((card) => card.kind === 'daily')!;
let root: HTMLDivElement;
let unmount: (() => void) | undefined;
const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const key = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
const pointer = (target: HTMLElement, type: string, clientX = 200, clientY = 200) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
};
function start() {
  vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
    ...initialState(),
    year: 50,
    current: daily,
    boons: { alice: true },
  });
  unmount = mount(root);
  root.querySelector<HTMLButtonElement>('[data-close]')?.click();
  find('.mode-option[aria-checked="true"]').click();
  vi.advanceTimersByTime(620);
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  root = document.createElement('div');
  document.body.replaceChildren(root);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 400, 400),
  );
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('shows the wildcard as a faint corner picture, not a button', () => {
  const state: State = {
    ...initialState(),
    current: daily,
    boons: { alice: true },
  };
  root.innerHTML = deskMarkup(state);
  const card = find('.document > .paper-alice');
  expect(root.querySelector('.axe-pair .alice')).toBeNull();
  expect(card.classList.contains('tool')).toBe(false);
  expect(card.getAttribute('aria-hidden')).toBe('true');
  expect(card.querySelector('[data-art-slot="ui.aliceToken"]')).not.toBeNull();
  expect(card.classList.contains('spent')).toBe(false);
  root.innerHTML = deskMarkup({ ...state, boons: {} });
  expect(root.querySelector('.paper-alice')).toBeNull();
});
it.each(['story', 'fixed', 'special', 'daily', 'speaki'] as const)(
  'dims the wildcard when it cannot swap a %s document',
  (kind) => {
    root.innerHTML = documentMarkup({ ...daily, kind }, true);
    expect(find('.paper-alice').classList.contains('spent')).toBe(
      kind !== 'daily' && kind !== 'speaki',
    );
    root.innerHTML = documentMarkup({ ...daily, kind }, true, true);
    expect(find('.paper-alice').classList.contains('spent')).toBe(true);
    root.innerHTML = documentMarkup({ ...daily, kind }, true, false, false);
    expect(find('.paper-alice').classList.contains('spent')).toBe(true);
  },
);
it('glows while the paper is held and swaps once it slides far enough', () => {
  start();
  const paper = find('.document');
  pointer(paper, 'pointerdown');
  expect(paper.classList.contains('wild-hold')).toBe(true);
  expect(find('.choice-caption').textContent).toBe(system.aliceLine);
  pointer(paper, 'pointermove', 250);
  expect(paper.classList.contains('wild-ready')).toBe(false);
  pointer(paper, 'pointermove', 300);
  expect(paper.classList.contains('wild-ready')).toBe(true);
  pointer(paper, 'pointerup', 300);
  expect(paper.classList.contains('processed-alice')).toBe(true);
  vi.advanceTimersByTime(500);
  expect(root.querySelector('.paper-alice')).toBeNull();
  expect(find('.document').classList.contains('wild-arrive')).toBe(true);
  expect(find('.document h1').textContent).not.toBe(daily.title);
  expect(find('.year b').textContent).toBe('50');
});
it.each(['short', 'vertical', 'tap'])('keeps the document after a %s press', (mode) => {
  start();
  const paper = find('.document');
  pointer(paper, 'pointerdown');
  if (mode === 'short') pointer(paper, 'pointermove', 240);
  if (mode === 'vertical') pointer(paper, 'pointermove', 205, 260);
  pointer(paper, 'pointerup', mode === 'short' ? 240 : 200);
  expect(paper.classList.contains('processed-alice')).toBe(false);
  expect(paper.classList.contains('wild-hold')).toBe(false);
  expect(find('.choice-caption').textContent).toBe('');
  vi.advanceTimersByTime(500);
  expect(find('.document h1').textContent).toBe(daily.title);
});
it('still swaps with R pressed twice', () => {
  start();
  key('R');
  expect(find('.document').classList.contains('wild-hold')).toBe(true);
  expect(find('.choice-caption').textContent).toBe(system.aliceLine);
  vi.advanceTimersByTime(250);
  key('R');
  expect(find('.document').classList.contains('processed-alice')).toBe(true);
  vi.advanceTimersByTime(500);
  expect(find('.document h1').textContent).not.toBe(daily.title);
});
it('clears the R aim with Escape', () => {
  start();
  key('R');
  key('Escape');
  expect(root.querySelector('.wild-hold, .processed-alice')).toBeNull();
  expect(find('.choice-caption').textContent).toBe('');
});
it('explains the wildcard only the first time it is ever gained', () => {
  root.innerHTML = documentMarkup(daily, true);
  showWildNotice(root);
  expect(root.querySelectorAll('.wild-notice')).toHaveLength(1);
  expect(find('.wild-notice').textContent).toBe(system.ui.wildNotice);
  showWildNotice(root);
  expect(root.querySelectorAll('.wild-notice')).toHaveLength(1);
  vi.advanceTimersByTime(6000);
  expect(root.querySelector('.wild-notice')).toBeNull();
});
it.each(['axe', 'bullet'] as const)(
  'strips Alice from %s paper clones and ghosts',
  (action) => {
    root.innerHTML = deskMarkup({
      ...initialState(),
      current: daily,
      boons: { alice: true, bullet: 1 },
    });
    liftTool(root, action, { x: 200, y: 200 });
    playAction(root, action, null, false);
    const clones = root.querySelectorAll('.axe-half, .shot-shard, .ghost');
    expect(clones.length).toBeGreaterThanOrEqual(action === 'axe' ? 2 : 1);
    clones.forEach((clone) =>
      expect(clone.querySelector('.paper-alice')).toBeNull(),
    );
    expect(root.querySelectorAll('.paper-alice')).toHaveLength(1);
  },
);
