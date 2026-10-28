// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card } from '../src/core/state';
import { system } from '../src/i18n';
import { saveRun, loadRun, saveSettings } from '../src/save/storage';
import { mount } from '../src/ui/app';
import { deskMarkup } from '../src/ui/desk';
import { bishopBar } from '../src/ui/bishop';
import { bindTooltips } from '../src/ui/tooltip';

const cards = raw as Card[];
const daily = cards.find((card) => card.kind === 'daily')!;
let root: HTMLDivElement;
let dispose: (() => void) | undefined;
const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const pointer = (element: HTMLElement, type: string, pointerType = 'touch') => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  element.dispatchEvent(event);
  return event;
};
const key = (key: string, target: EventTarget = window) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => ({})),
  });
  localStorage.clear();
  saveSettings({
    sfx: 0,
    bgm: 0,
    lastSfx: 75,
    language: 'en',
    tutorialSeen: true, musicAsked: true,
  });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('renders only icons and numeric counts in the tray, with accessible copy', () => {
  root.innerHTML = deskMarkup({
    ...initialState(),
    current: daily,
    boons: { stitch: true, bullet: 2, hyean: { left: 3 } },
  });
  expect(
    root.querySelectorAll('.status-tray > button.status-icon'),
  ).toHaveLength(3);
  expect(find('.status-tray').getAttribute('role')).toBe('list');
  for (const id of ['stitch', 'bullet', 'hyean'] as const) {
    const button = find(`[data-boon="${id}"]`);
    expect(button.getAttribute('role')).toBe('listitem');
    expect(button.dataset.tipTitle).toBe(system.boons[id].name);
    expect(button.dataset.tipText).toBe(system.boons[id].desc);
    expect(button.getAttribute('aria-label')).toContain(system.boons[id].desc);
    expect(button.querySelector('.boon-icon')).not.toBeNull();
  }
  expect(find('[data-boon="stitch"]').textContent).toBe('');
  expect(find('[data-boon="bullet"]').textContent).toBe('2');
  expect(find('[data-boon="hyean"]').textContent).toBe('3');
  expect(find('[data-boon="hyean"]').getAttribute('aria-label')).toContain('3');
  expect(
    root.querySelector('.boons, .boon, .bishop-bar, .bishop-pill'),
  ).toBeNull();
  expect(find('.status-tray').parentElement).toBe(find('.topbar'));
});

it('shares one tooltip across mouse/pen hover, focus and touch toggles, restoring descriptions', () => {
  root.innerHTML = deskMarkup({
    ...initialState(),
    current: daily,
    boons: { stitch: true, bullet: 2 },
  });
  const tips = bindTooltips(root);
  dispose = tips.dispose;
  const stitch = find('[data-boon="stitch"]');
  stitch.setAttribute('aria-describedby', 'existing');
  for (const device of ['mouse', 'pen']) {
    pointer(stitch, 'pointerover', device);
    expect(find('.tip').hidden).toBe(false);
    expect(find('.tip b').textContent).toBe(system.boons.stitch.name);
    expect(find('.tip span').textContent).toBe(system.boons.stitch.desc);
    expect(stitch.getAttribute('aria-describedby')).toBe(
      `existing ${find('.tip').id}`,
    );
    pointer(stitch, 'pointerout', device);
    expect(find('.tip').hidden).toBe(true);
    expect(stitch.getAttribute('aria-describedby')).toBe('existing');
  }
  stitch.focus();
  expect(find('.tip').hidden).toBe(false);
  stitch.blur();
  expect(find('.tip').hidden).toBe(true);
  pointer(stitch, 'pointerover');
  expect(find('.tip').hidden).toBe(true);
  pointer(stitch, 'pointerdown');
  expect(find('.tip').hidden).toBe(false);
  pointer(stitch, 'pointerdown');
  expect(find('.tip').hidden).toBe(true);
  pointer(stitch, 'pointerdown');
  pointer(find('[data-boon="bullet"]'), 'pointerdown');
  expect(find('.tip b').textContent).toBe(system.boons.bullet.name);
  expect(stitch.getAttribute('aria-describedby')).toBe('existing');
  pointer(document.body, 'pointerdown');
  expect(find('.tip').hidden).toBe(true);
  pointer(stitch, 'pointerdown');
  key('Escape');
  expect(find('.tip').hidden).toBe(true);
  expect(root.querySelectorAll('.tip')).toHaveLength(1);
});

it('positions below or above and clamps both viewport edges with an eight pixel margin', () => {
  root.innerHTML =
    '<button data-tip data-tip-title="Name" data-tip-text="Description"></button><div class="tip" role="tooltip" hidden><b></b><span></span></div>';
  const tips = bindTooltips(root);
  dispose = tips.dispose;
  const button = find('button');
  vi.spyOn(find('.tip'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100),
  );
  const rect = vi
    .spyOn(button, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 10, 20, 20));
  pointer(button, 'pointerover', 'mouse');
  expect(find('.tip').dataset.side).toBe('below');
  expect(find('.tip').style.left).toBe('8px');
  expect(find('.tip').style.top).toBe('38px');
  rect.mockReturnValue(
    new DOMRect(window.innerWidth - 20, window.innerHeight - 20, 20, 20),
  );
  window.dispatchEvent(new Event('resize'));
  expect(find('.tip').dataset.side).toBe('above');
  expect(find('.tip').style.left).toBe(`${window.innerWidth - 208}px`);
  expect(find('.tip').style.top).toBe(`${window.innerHeight - 128}px`);
});

it('gives gauge status badges focusable tooltip data', () => {
  root.innerHTML = deskMarkup({
    ...initialState(),
    current: daily,
    statuses: [{ id: 'ember', left: 2, source: daily.id, tick: { sugar: -2 } }],
  });
  const badge = find('.status-badge');
  expect(badge.hasAttribute('data-tip')).toBe(true);
  expect(badge.tabIndex).toBe(0);
  expect(badge.dataset.tipTitle).toBe(system.statuses.ember.name);
  expect(badge.dataset.tipText).toBe(system.statuses.ember.desc);
});

const continueRun = (bishop = false, sleep = 0) => {
  const state = {
    ...initialState(bishop ? 'bishop' : 'priest', () => 0),
    current: daily,
    sleep,
    boons: { stitch: true as const },
  };
  if (state.bishop) state.bishop.notices = [];
  saveRun(state);
  dispose = mount(root);
  find('.title-continue').click();
  return state;
};

it('tooltip taps and focused keys cannot stamp, aim, clear aim or advance a sleeping document', () => {
  const state = continueRun(false, 2);
  const button = find('[data-tip]');
  pointer(button, 'pointerdown');
  pointer(button, 'pointerup');
  button.click();
  button.focus();
  for (const value of ['ArrowRight', 'ArrowDown', 'Enter', ' '])
    key(value, button);
  expect(loadRun(cards)?.current?.id).toBe(state.current.id);
  expect(root.querySelector('.document.target')).toBeNull();
  expect(root.querySelector('.stamped, .lifted, .aimed')).toBeNull();
  key('Escape', button);
  expect(find('.tip').hidden).toBe(true);
  expect(find('.menu').hidden).toBe(true);
});

it('keeps an existing aim when a tooltip is tapped and leaves game keys working after blur', () => {
  continueRun();
  key('ArrowRight');
  const tool = find('[data-action="approve"]');
  expect(tool.classList.contains('aimed')).toBe(true);
  const button = find('[data-tip]');
  pointer(button, 'pointerdown');
  pointer(button, 'pointerup');
  expect(tool.classList.contains('aimed')).toBe(true);
  button.focus();
  key('ArrowRight', button);
  expect(tool.classList.contains('aimed')).toBe(true);
  button.blur();
  key('ArrowLeft');
  expect(tool.classList.contains('aimed')).toBe(false);
});

it.each(['button', 'backdrop', 'Escape'] as const)(
  'opens the bishop sheet, blocks input, traps focus and closes via %s',
  (close) => {
    const state = continueRun(true);
    const pill = find('.bishop-pill');
    pointer(pill, 'pointerdown');
    pill.click();
    expect(find('.bishop-sheet').hidden).toBe(false);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(find('.bishop-sheet-close'));
    expect(find('.topbar').hasAttribute('inert')).toBe(true);
    for (const value of [
      'ArrowRight',
      'ArrowRight',
      'ArrowDown',
      'ArrowDown',
      'r',
      ' ',
      'Enter',
    ])
      key(value);
    const tool = find('[data-action="approve"]');
    pointer(tool, 'pointerdown');
    pointer(tool, 'pointerup');
    tool.click();
    expect(loadRun(cards)?.current?.id).toBe(state.current.id);
    expect(root.querySelector('.aimed, .lifted')).toBeNull();
    key('Tab');
    expect(document.activeElement).toBe(find('.bishop-sheet-close'));
    if (close === 'button') find('.bishop-sheet-close').click();
    else if (close === 'backdrop') find('.bishop-sheet').click();
    else key('Escape');
    expect(find('.bishop-sheet').hidden).toBe(true);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(pill);
    expect(root.querySelector('.desk > [inert]')).toBeNull();
    key('ArrowRight', pill);
    expect(root.querySelector('[data-action="approve"].aimed')).not.toBeNull();
  },
);

it('pauses automatic sleep stamps while the sheet is open and resumes on close', () => {
  const state = continueRun(true, 2);
  find('.bishop-pill').click();
  vi.advanceTimersByTime(3000);
  expect(loadRun(cards)?.current?.id).toBe(state.current.id);
  expect(loadRun(cards)?.sleep).toBe(2);
  find('.bishop-sheet-close').click();
  vi.advanceTimersByTime(3000);
  expect(loadRun(cards)?.sleep).toBeLessThan(2);
});

it('hides zero bishop counts and renders no pill in story modes', () => {
  root.innerHTML = bishopBar(initialState('bishop', () => 0));
  expect(root.querySelector('.bishop-pill-count[data-none]')).not.toBeNull();
  for (const mode of ['priest', 'apprentice'] as const) {
    root.innerHTML = deskMarkup({ ...initialState(mode), current: daily });
    expect(
      root.querySelector('.bishop-pill, .bishop-sheet, .bishop-bar, .boons'),
    ).toBeNull();
  }
});
