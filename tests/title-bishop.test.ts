// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Mode } from '../src/core/state';
import { emptyCollection } from '../src/save/storage';
import { setLanguage, system } from '../src/i18n';
import { titleScreen } from '../src/ui/screens';
import { bindTitle } from '../src/ui/title';
import { bindTooltips } from '../src/ui/tooltip';

let root: HTMLDivElement;
let dispose: () => void;
let select = vi.fn<(mode: Mode) => void>();
let start = vi.fn<() => void>();
const elementsFromPoint = Object.getOwnPropertyDescriptor(
  document,
  'elementsFromPoint',
);
const paper = (mode: string) =>
  root.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!;
const selected = () =>
  root.querySelector<HTMLElement>('[aria-checked="true"]')!;
const key = (key: string, repeat = false) =>
  selected().dispatchEvent(
    new KeyboardEvent('keydown', { key, repeat, bubbles: true }),
  );
const pointer = (type: string, x = 50, y = 50) => {
  const event = new MouseEvent(type, {
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  root.querySelector('.title-stamp')!.dispatchEvent(event);
};
const hitStack = (...elements: Element[]) => {
  const hit = vi.fn(() => elements);
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: hit,
  });
  return hit;
};

beforeEach(() => {
  vi.useFakeTimers();
  setLanguage('ko');
  root = document.createElement('div');
  root.innerHTML = titleScreen(emptyCollection());
  document.body.append(root);
  select = vi.fn();
  start = vi.fn();
  dispose = bindTitle(root, 'priest', select, start, { tutorial: vi.fn() });
});

afterEach(() => {
  dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (elementsFromPoint)
    Object.defineProperty(document, 'elementsFromPoint', elementsFromPoint);
  else Reflect.deleteProperty(document, 'elementsFromPoint');
  document.body.replaceChildren();
});

it('renders three indexed papers with a focusable locked Bishop and three records', () => {
  const papers = [...root.querySelectorAll<HTMLElement>('.mode-option.paper')];
  expect(papers.map((p) => p.dataset.mode)).toEqual([
    'apprentice',
    'priest',
    'bishop',
  ]);
  expect(papers.map((p) => p.style.getPropertyValue('--i'))).toEqual([
    '0',
    '1',
    '2',
  ]);
  expect(
    root.querySelectorAll('.mode-picker.mode-fan > .mode-option'),
  ).toHaveLength(3);
  const bishop = paper('bishop');
  expect(bishop.getAttribute('role')).toBe('radio');
  expect(bishop.getAttribute('aria-disabled')).toBe('true');
  expect(bishop.getAttribute('aria-checked')).toBe('false');
  expect(bishop.tabIndex).toBe(-1);
  expect(bishop.disabled).toBe(false);
  expect(bishop.hasAttribute('data-tip')).toBe(true);
  expect(bishop.dataset.tipTitle).toBe(system.modes.bishop.name);
  expect(bishop.dataset.tipText).toBe(system.modes.bishop.lockedHint);
  bishop.focus();
  expect(document.activeElement).toBe(bishop);
  expect(bishop.querySelector('.mode-name')!.textContent).toBe(
    system.modes.bishop.name,
  );
  expect(bishop.querySelector('.mode-desc')!.textContent).toBe(
    system.modes.bishop.desc,
  );
  expect(bishop.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
  expect(
    [...root.querySelectorAll<HTMLElement>('.title-record')].map(
      (p) => p.dataset.record,
    ),
  ).toEqual(['apprentice', 'priest', 'bishop']);
});

it('shows the Bishop tooltip on hover, focus and touch within a phone viewport', () => {
  const tips = bindTooltips(root);
  const bishop = paper('bishop');
  const send = (element: Element, type: string, pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    element.dispatchEvent(event);
  };
  vi.stubGlobal('innerWidth', 360);
  send(bishop, 'pointerover', 'mouse');
  const tip = root.querySelector<HTMLElement>('.tip')!;
  expect(tip.hidden).toBe(false);
  expect(tip.querySelector('b')!.textContent).toBe(system.modes.bishop.name);
  expect(tip.querySelector('span')!.textContent).toBe(
    system.modes.bishop.lockedHint,
  );
  expect(tip.style.maxWidth).toBe('344px');
  send(bishop, 'pointerout', 'mouse');
  bishop.focus();
  expect(tip.hidden).toBe(false);
  bishop.blur();
  send(bishop, 'pointerdown', 'touch');
  expect(tip.hidden).toBe(false);
  send(document.body, 'pointerdown', 'touch');
  expect(tip.hidden).toBe(true);
  tips.dispose();
  vi.unstubAllGlobals();
});

it.each(['apprentice', 'priest'])(
  'stamps %s by dragging with tooltips bound',
  (mode) => {
    const tips = bindTooltips(root);
    hitStack(paper(mode));
    pointer('pointerdown');
    pointer('pointermove');
    pointer('pointerup');
    expect(paper(mode).querySelector('.title-imprint')).not.toBeNull();
    vi.advanceTimersByTime(620);
    expect(start).toHaveBeenCalledTimes(1);
    tips.dispose();
  },
);

it('nudges Bishop on clicks and restarts the nudge without selecting or starting', () => {
  const bishop = paper('bishop');
  const tips = bindTooltips(root);
  bishop.click();
  expect(bishop.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
  expect(bishop.classList.contains('locked-nudge')).toBe(true);
  vi.advanceTimersByTime(300);
  bishop.click();
  vi.advanceTimersByTime(449);
  expect(bishop.classList.contains('locked-nudge')).toBe(true);
  vi.advanceTimersByTime(1);
  expect(bishop.classList.contains('locked-nudge')).toBe(false);
  expect(selected()).toBe(paper('priest'));
  expect(select).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(root.querySelector('.title-imprint')).toBeNull();
  expect(bishop.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
  tips.dispose();
  expect(root.querySelector('.title-screen')!.hasAttribute('inert')).toBe(
    false,
  );
});

it.each(['ArrowLeft', 'ArrowRight'])(
  'cycles only selectable papers with %s',
  (arrow) => {
    for (const mode of ['apprentice', 'priest', 'apprentice', 'priest']) {
      key(arrow);
      expect(selected()).toBe(paper(mode));
      expect(document.activeElement).toBe(paper(mode));
      expect(paper('bishop').tabIndex).toBe(-1);
    }
    key(arrow, true);
    expect(selected()).toBe(paper('priest'));
    vi.advanceTimersByTime(1000);
    expect(start).not.toHaveBeenCalled();
    expect(root.querySelector('.title-imprint')).toBeNull();
  },
);

it.each(['Enter', ' '])(
  'stamps the selected paper with %s after cycling',
  (action) => {
    key('ArrowRight');
    key(action);
    expect(paper('apprentice').querySelector('.title-imprint')).not.toBeNull();
    vi.advanceTimersByTime(620);
    expect(start).toHaveBeenCalledTimes(1);
  },
);

it('aims at the topmost paper and returns the stamp when dropped on Bishop', () => {
  const tips = bindTooltips(root);
  const bishop = paper('bishop');
  // The stack includes a foreign paper and nested children of overlapping papers.
  const foreign = document.createElement('button');
  foreign.className = 'mode-option';
  const hit = hitStack(
    foreign,
    bishop.querySelector('.mode-name')!,
    paper('priest'),
  );
  pointer('pointerdown');
  pointer('pointermove', 70, 80);
  expect(hit).toHaveBeenCalledWith(70, 80);
  expect([...root.querySelectorAll('.aimed')]).toEqual([bishop]);
  pointer('pointerup', 70, 80);
  expect(root.querySelector('.aimed')).toBeNull();
  expect(bishop.classList.contains('locked-nudge')).toBe(true);
  expect(bishop.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
  tips.dispose();
  expect(root.querySelector('.ghost.returning')).not.toBeNull();
  vi.advanceTimersByTime(240);
  expect(root.querySelector('.ghost')).toBeNull();
  expect(root.querySelector('.title-stamp')!.classList.contains('lifted')).toBe(
    false,
  );
  vi.advanceTimersByTime(1000);
  expect(selected()).toBe(paper('priest'));
  expect(select).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(root.querySelector('.title-imprint')).toBeNull();
});

it('uses rect hit-testing for Bishop when elementsFromPoint is unavailable', () => {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: undefined,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(this.dataset.mode === 'bishop' ? 0 : 200, 0, 100, 100);
    },
  );
  pointer('pointerdown');
  pointer('pointermove');
  expect(paper('bishop').classList.contains('aimed')).toBe(true);
  pointer('pointerup');
  expect(paper('bishop').classList.contains('locked-nudge')).toBe(true);
  expect(root.querySelector('.ghost.returning')).not.toBeNull();
  vi.advanceTimersByTime(1000);
  expect(start).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

it('moves aim between papers and clears it on a miss and cancellation', () => {
  const hit = hitStack(paper('priest'));
  pointer('pointerdown');
  pointer('pointermove');
  expect([...root.querySelectorAll('.aimed')]).toEqual([paper('priest')]);
  hit.mockReturnValue([paper('bishop')]);
  pointer('pointermove');
  expect([...root.querySelectorAll('.aimed')]).toEqual([paper('bishop')]);
  hit.mockReturnValue([]);
  pointer('pointermove');
  expect(root.querySelector('.aimed')).toBeNull();
  hit.mockReturnValue([paper('bishop')]);
  pointer('pointermove');
  pointer('pointercancel');
  expect(root.querySelector('.aimed')).toBeNull();
  expect(root.querySelector('.ghost.returning')).not.toBeNull();
  expect(paper('bishop').classList.contains('locked-nudge')).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(start).not.toHaveBeenCalled();
});
