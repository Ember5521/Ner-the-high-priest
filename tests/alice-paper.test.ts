// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import { initialState, type Card, type State } from '../src/core/state';
import * as deck from '../src/core/deck';
import { mount } from '../src/ui/app';
import { deskMarkup } from '../src/ui/desk';
import { documentMarkup } from '../src/ui/document';
import { liftTool, playAction } from '../src/ui/fx';

const daily = (cards as Card[]).find((card) => card.kind === 'daily')!;
let root: HTMLDivElement;
let unmount: (() => void) | undefined;
const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const key = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
const pointer = (target: HTMLElement, type: string) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 200,
    clientY: 200,
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
it('places Alice at the bottom centre of the document, outside the tools row', () => {
  const state: State = {
    ...initialState(),
    current: daily,
    boons: { alice: true },
  };
  root.innerHTML = deskMarkup(state);
  const button = find('.document > .paper-alice');
  expect(root.querySelector('.axe-pair .alice')).toBeNull();
  // positioned by .tool.paper-alice in style.css, not inline
  expect(button.classList.contains('tool')).toBe(true);
  expect(button.getAttribute('aria-label')).toBe(system.boons.alice.name);
  expect(button.title).toBe(
    `${system.boons.alice.name} — ${system.boons.alice.desc}`,
  );
  // keys still work, but no key hints are drawn
  expect(button.querySelector('kbd')).toBeNull();
  expect(button.getAttribute('aria-disabled')).toBe('false');
  root.innerHTML = deskMarkup({ ...state, boons: {} });
  expect(root.querySelector('.paper-alice')).toBeNull();
});
it.each(['story', 'fixed', 'special', 'daily', 'speaki'] as const)(
  'preserves Alice availability for %s',
  (kind) => {
    root.innerHTML = documentMarkup({ ...daily, kind }, true);
    expect(find('.paper-alice').getAttribute('aria-disabled')).toBe(
      String(kind !== 'daily' && kind !== 'speaki'),
    );
    root.innerHTML = documentMarkup({ ...daily, kind }, true, true);
    expect(find('.paper-alice').getAttribute('aria-disabled')).toBe('true');
    root.innerHTML = documentMarkup({ ...daily, kind }, true, false, false);
    expect(find('.paper-alice').getAttribute('aria-disabled')).toBe('true');
  },
);
it.each(['click', 'tap', 'R'])('aims then rerolls with %s', (mode) => {
  start();
  const paper = find('.document');
  const paperPointer = vi.fn();
  paper.addEventListener('pointerdown', paperPointer);
  paper.addEventListener('pointerup', paperPointer);
  paper.addEventListener('click', paperPointer);
  const activate = () => {
    if (mode === 'R') key('R');
    else if (mode === 'click') find('.paper-alice').click();
    else {
      const face = find('.paper-alice .reroll-face');
      pointer(face, 'pointerdown');
      pointer(face, 'pointerup');
      face.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    }
  };
  activate();
  expect(find('.paper-alice').classList.contains('aimed')).toBe(true);
  expect(find('.choice-caption').textContent).toBe(system.aliceLine);
  expect(paper.classList.contains('processed-alice')).toBe(false);
  vi.advanceTimersByTime(250);
  activate();
  expect(paper.classList.contains('processed-alice')).toBe(true);
  expect(paperPointer).not.toHaveBeenCalled();
  expect(root.querySelector('.ghost .paper-alice')).toBeNull();
  vi.advanceTimersByTime(500);
  expect(root.querySelector('.paper-alice')).toBeNull();
  expect(find('.document h1').textContent).not.toBe(daily.title);
  expect(find('.year b').textContent).toBe('50');
});
it.each(['Escape', 'paper', 'background'])(
  'clears Alice aim with %s',
  (mode) => {
    start();
    find('.paper-alice').click();
    if (mode === 'Escape') key('Escape');
    else pointer(find(mode === 'paper' ? '.document' : '.desk'), 'pointerdown');
    expect(root.querySelector('.aimed, .processed-alice')).toBeNull();
    expect(find('.choice-caption').textContent).toBe('');
  },
);
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
