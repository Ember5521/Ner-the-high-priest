// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../src/ui/app';
import { initialState, type Card, type State } from '../src/core/state';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';

let root: HTMLDivElement;
let unmount: () => void;
let entries: unknown[];
let index: number;
let run: State;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
const menu = () => root.querySelector<HTMLElement>('.menu')!;
const start = () => {
  click('.mode-option[aria-checked="true"]');
  vi.advanceTimersByTime(620);
};
const confirm = (action: 'title' | 'restart') => {
  click('.menu-button');
  click(`[data-menu="${action}"]`);
  click('[data-menu="confirm"]');
};
const pop = () => window.dispatchEvent(new PopStateEvent('popstate'));
const key = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('ner-settings', JSON.stringify({ tutorialSeen: true, musicAsked: true }));
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app')!;
  run = {
    ...initialState(),
    current: (cards as Card[]).find((card) => card.kind === 'daily')!,
  };
  vi.spyOn(deck, 'nextDocument').mockImplementation(() => run);
  entries = [null];
  index = 0;
  vi.spyOn(history, 'state', 'get').mockImplementation(() => entries[index]);
  vi.spyOn(history, 'pushState').mockImplementation((state) => {
    entries.splice(++index, entries.length, state);
  });
  // Traversal completes asynchronously, as it does in the browser.
  vi.spyOn(history, 'back').mockImplementation(() => {
    setTimeout(() => {
      if (index === 0) return;
      index--;
      pop();
    }, 0);
  });
  unmount = mount(root);
  root
    .querySelector<HTMLButtonElement>('.preferences-overlay [data-close]')
    ?.click();
});

afterEach(() => {
  unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('run history guard', () => {
  it('pushes one guard on run start and none on the title', () => {
    pop();
    expect(history.pushState).not.toHaveBeenCalled();
    start();
    expect(history.pushState).toHaveBeenCalledExactlyOnceWith(
      { nerGuard: true },
      '',
    );
    expect(index).toBe(1);
  });

  it('consumes the guard on back and opens the pause menu without re-pushing', () => {
    start();
    history.back();
    vi.advanceTimersByTime(0);
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
    expect(menu().hidden).toBe(false);
    expect(root.querySelector('.menu-main .menu-back-note')!.textContent).toBe(
      system.menu.backNote,
    );
    expect(root.querySelector('.menu-main .menu-title')!.textContent).toBe(
      '잠시 마카롱 타임',
    );
  });

  it('keeps an open menu and its confirmation page unchanged on back', () => {
    start();
    click('.menu-button');
    click('[data-menu="restart"]');
    const dialog = menu();
    history.back();
    vi.advanceTimersByTime(0);
    expect(menu()).toBe(dialog);
    expect(menu().hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.menu-confirm')!.hidden).toBe(
      false,
    );
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
  });

  it('pops the guard on return to title, ignores that pop once, and allows later pops', () => {
    start();
    confirm('title');
    expect(history.back).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    expect(root.querySelector('.title-screen')).not.toBeNull();
    expect(root.querySelector('.menu')).toBeNull();
    expect(index).toBe(0);
    pop();
    expect(history.pushState).toHaveBeenCalledTimes(1);
    start();
    history.back();
    vi.advanceTimersByTime(0);
    expect(menu().hidden).toBe(false);
    expect(index).toBe(0);
  });

  it('removes the old guard before pushing one for each restarted run', () => {
    start();
    for (let i = 0; i < 4; i++) {
      confirm('restart');
      expect(history.pushState).toHaveBeenCalledTimes(i + 1);
      vi.advanceTimersByTime(0);
      expect(history.pushState).toHaveBeenCalledTimes(i + 2);
      expect(index).toBe(1);
      expect(entries).toEqual([null, { nerGuard: true }]);
      expect(menu().hidden).toBe(true);
    }
    history.back();
    vi.advanceTimersByTime(0);
    expect(menu().hidden).toBe(false);
  });

  it('consumes the guard without dismissing a scene', () => {
    run.scene = 'asleep';
    start();
    const scene = root.querySelector('.scene');
    expect(scene).not.toBeNull();
    history.back();
    vi.advanceTimersByTime(0);
    expect(root.querySelector('.scene')).toBe(scene);
    expect(menu().hidden).toBe(true);
    expect(index).toBe(0);
  });

  it('leaves a rewind prompt intact on back and allows later pops on ending', () => {
    start();
    const { past: _past, ...snapshot } = run;
    vi.spyOn(loop, 'processDocument').mockReturnValue({
      ...run,
      boons: { rewind: true },
      past: [snapshot],
      year: 186,
      ending: { id: 'sugar_low' },
    });
    key('ArrowRight');
    key('ArrowRight');
    key(' ');
    const prompt = root.querySelector('.rewind');
    expect(prompt).not.toBeNull();
    history.back();
    vi.advanceTimersByTime(0);
    expect(root.querySelector('.rewind')).toBe(prompt);
    expect(index).toBe(0);
    click('[data-rewind="no"]');
    vi.advanceTimersByTime(0);
    expect(root.querySelector('.ending-screen')).not.toBeNull();
    expect(index).toBe(0);
    pop();
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.menu')).toBeNull();
  });

  it.each(['resume', 'Escape'])(
    're-arms when closing pause with %s',
    (action) => {
      start();
      history.back();
      vi.advanceTimersByTime(0);
      if (action === 'resume') click('[data-menu="resume"]');
      else key('Escape');
      expect(index).toBe(1);
      expect(history.pushState).toHaveBeenCalledTimes(2);
      click('.menu-button');
      click('[data-menu="resume"]');
      expect(history.pushState).toHaveBeenCalledTimes(2);
    },
  );

  it('re-arms on a stamp after back during a scene', () => {
    run.scene = 'asleep';
    start();
    history.back();
    vi.advanceTimersByTime(0);
    click('.scene-next');
    key('ArrowRight');
    key('ArrowRight');
    expect(index).toBe(1);
    expect(history.pushState).toHaveBeenCalledTimes(2);
  });

  it('does not re-arm for automatic sleep stamps, but re-arms for player sleep actions', () => {
    run.scene = 'asleep';
    run.sleep = 2;
    vi.spyOn(loop, 'processDocument').mockReturnValue({ ...run, scene: null });
    start();
    history.back();
    vi.advanceTimersByTime(0);
    click('.scene-next');
    vi.advanceTimersByTime(1300);
    expect(index).toBe(0);
    key(' ');
    // The first key settles the automatic stamp; the next player action re-arms.
    key('a');
    expect(index).toBe(1);
  });

  it('pops a guard when an ending is recorded', () => {
    start();
    vi.spyOn(loop, 'processDocument').mockReturnValue({
      ...run,
      ending: { id: 'sugar_low' },
    });
    key('ArrowRight');
    key('ArrowRight');
    key(' ');
    vi.advanceTimersByTime(0);
    expect(root.querySelector('.ending-screen')).not.toBeNull();
    expect(index).toBe(0);
    expect(history.back).toHaveBeenCalledTimes(1);
  });

  it('removes the popstate listener when unmounted', () => {
    start();
    unmount();
    pop();
    expect(history.pushState).toHaveBeenCalledTimes(1);
  });
});
