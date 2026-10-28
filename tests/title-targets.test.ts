// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState } from '../src/core/state';
import { emptyCollection } from '../src/save/storage';
import { titleScreen } from '../src/ui/screens';
import { bindTitle } from '../src/ui/title';
import * as sound from '../src/ui/sound';

let root: HTMLDivElement;
let dispose: () => void;
const select = vi.fn();
const start = vi.fn();
const resume = vi.fn();
const tutorial = vi.fn();
const elementsFromPoint = Object.getOwnPropertyDescriptor(
  document,
  'elementsFromPoint',
);
const button = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!;
const pointer = (type: string) => {
  const event = new MouseEvent(type, {
    button: 0,
    clientX: 50,
    clientY: 50,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  button('.title-stamp').dispatchEvent(event);
};
const hitStack = (...elements: Element[]) => {
  const hit = vi.fn(() => elements);
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: hit,
  });
  return hit;
};
const drop = (selector: string) => {
  hitStack(button(selector).firstElementChild!);
  pointer('pointerdown');
  pointer('pointerup');
};
const render = (saved = true) => {
  root.innerHTML = titleScreen(
    emptyCollection(),
    'priest',
    saved ? initialState('apprentice') : null,
  );
  dispose = bindTitle(root, 'priest', select, start, {
    resume: saved ? resume : undefined,
    tutorial,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(sound, 'playSound').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.append(root);
  render();
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

it('stamps continue and resumes once without selecting a mode', () => {
  drop('.title-continue');
  expect(
    button('.title-continue').querySelector('.title-imprint'),
  ).not.toBeNull();
  expect(button('.title-continue').classList.contains('stamped')).toBe(true);
  expect(button('.title-stamp').classList.contains('used')).toBe(true);
  expect(root.querySelector('.title-screen')!.hasAttribute('inert')).toBe(true);
  expect(root.querySelector('.ghost.striking')).not.toBeNull();
  drop('[data-mode="apprentice"]');
  expect(root.querySelector('[aria-checked="true"]')).toBe(
    button('[data-mode="priest"]'),
  );
  expect(select).not.toHaveBeenCalled();
  expect(sound.playSound).toHaveBeenCalledExactlyOnceWith('stamp');
  vi.advanceTimersByTime(619);
  expect(resume).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(resume).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(resume).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
});

it('lightly stamps tutorial, ignores pending drops, and allows a later mode drop', () => {
  drop('.title-tutorial');
  expect(
    button('.title-tutorial').querySelector('.title-imprint'),
  ).not.toBeNull();
  expect(button('.title-tutorial').classList.contains('stamped')).toBe(true);
  expect(button('.title-stamp').classList.contains('used')).toBe(false);
  expect(button('.title-stamp').classList.contains('lifted')).toBe(true);
  expect(root.querySelector('.title-screen')!.hasAttribute('inert')).toBe(
    false,
  );
  expect(root.querySelector('.ghost.striking')).not.toBeNull();
  drop('.title-tutorial');
  expect(
    button('.title-tutorial').querySelectorAll('.title-imprint'),
  ).toHaveLength(1);
  expect(sound.playSound).toHaveBeenCalledExactlyOnceWith('stamp');
  vi.advanceTimersByTime(319);
  expect(tutorial).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(tutorial).toHaveBeenCalledTimes(1);
  drop('[data-mode="apprentice"]');
  expect(select).toHaveBeenCalledExactlyOnceWith('apprentice');
  expect(
    button('[data-mode="apprentice"]').querySelector('.title-imprint'),
  ).not.toBeNull();
  vi.advanceTimersByTime(579);
  expect(
    button('.title-tutorial').querySelector('.title-imprint'),
  ).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(button('.title-tutorial').querySelector('.title-imprint')).toBeNull();
  expect(button('.title-tutorial').classList.contains('stamped')).toBe(false);
  vi.advanceTimersByTime(40);
  expect(start).toHaveBeenCalledTimes(1);
  expect(tutorial).toHaveBeenCalledTimes(1);
  expect(resume).not.toHaveBeenCalled();
});

it('replays tutorial stamps and gives the new imprint its full lifetime', () => {
  drop('.title-tutorial');
  const firstInk = button('.title-tutorial').querySelector('.title-imprint')!;
  vi.advanceTimersByTime(400);
  drop('.title-tutorial');
  expect(firstInk.isConnected).toBe(false);
  expect(
    button('.title-tutorial').querySelectorAll('.title-imprint'),
  ).toHaveLength(1);
  vi.advanceTimersByTime(899);
  expect(tutorial).toHaveBeenCalledTimes(2);
  expect(button('.title-tutorial').classList.contains('stamped')).toBe(true);
  vi.advanceTimersByTime(1);
  expect(button('.title-tutorial').querySelector('.title-imprint')).toBeNull();
  expect(button('.title-tutorial').classList.contains('stamped')).toBe(false);
});

it.each(['stack', 'rect'])(
  'aims at both extra targets using %s hit-testing',
  (method) => {
    const hit = hitStack(button('.title-continue').firstElementChild!);
    let target = button('.title-continue');
    if (method === 'rect') {
      Object.defineProperty(document, 'elementsFromPoint', {
        value: undefined,
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
          return new DOMRect(this === target ? 0 : 200, 0, 100, 100);
        },
      );
    }
    pointer('pointerdown');
    pointer('pointermove');
    expect([...root.querySelectorAll('.aimed')]).toEqual([target]);
    target = button('.title-tutorial');
    hit.mockReturnValue([target.firstElementChild!]);
    pointer('pointermove');
    expect([...root.querySelectorAll('.aimed')]).toEqual([target]);
    pointer('pointerup');
    expect(root.querySelector('.aimed')).toBeNull();
    expect(target.querySelector('.title-imprint')).not.toBeNull();
  },
);

it('works without a saved run or continue target', () => {
  dispose();
  render(false);
  expect(root.querySelector('.title-continue')).toBeNull();
  drop('.title-tutorial');
  vi.advanceTimersByTime(320);
  expect(tutorial).toHaveBeenCalledTimes(1);
  drop('[data-mode="priest"]');
  vi.advanceTimersByTime(620);
  expect(start).toHaveBeenCalledTimes(1);
  expect(resume).not.toHaveBeenCalled();
});

it.each([0, 320])(
  'clears tutorial timers, ink, and aim on disposal after %sms',
  (elapsed) => {
    drop('.title-tutorial');
    vi.advanceTimersByTime(elapsed);
    if (elapsed) {
      hitStack(button('.title-continue'));
      pointer('pointerdown');
      pointer('pointermove');
      expect(button('.title-continue').classList.contains('aimed')).toBe(true);
    }
    dispose();
    expect(root.querySelector('.aimed')).toBeNull();
    expect(root.querySelector('.ghost')).toBeNull();
    expect(
      button('.title-tutorial').querySelector('.title-imprint'),
    ).toBeNull();
    expect(button('.title-tutorial').classList.contains('stamped')).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(tutorial).toHaveBeenCalledTimes(elapsed ? 1 : 0);
  },
);

it('cancels a pending resume on disposal', () => {
  drop('.title-continue');
  dispose();
  vi.advanceTimersByTime(1000);
  expect(resume).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
