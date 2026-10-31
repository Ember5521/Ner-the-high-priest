// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import rawCards from '../data/cards/m1.json';
import type { Card } from '../src/core/state';
import '../src/editor/preview';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('applies year defaults, remembers manual years per card and renders slider changes', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  const daily = structuredClone(
    rawCards.find((c) => c.kind === 'daily'),
  ) as Card;
  delete daily.conditions;
  const story: Card = {
    ...daily,
    id: 'preview-story',
    kind: 'story',
    trigger: { year: 193, order: 1 },
    conditions: { minYear: 190 },
  };
  const fixed: Card = {
    ...story,
    id: 'preview-fixed',
    kind: 'fixed',
    trigger: { year: 0, order: 1 },
  };
  const minimum: Card = {
    ...daily,
    id: 'preview-minimum',
    conditions: { minYear: 199 },
  };
  const conditional: Card = {
    ...story,
    id: 'preview-conditional',
    trigger: { onCondition: true, order: 1 },
    conditions: { minYear: 187 },
  };
  const other: Card = { ...daily, id: 'preview-other' };
  const cards = [daily, story, fixed, minimum, conditional, other];
  localStorage.clear();
  localStorage.setItem(
    'event-editor',
    JSON.stringify({ kind: 'all', id: daily.id }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => cards }),
  );
  const frame = document.getElementById('preview') as HTMLIFrameElement;
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((data) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: location.origin,
        source: window.parent,
      }),
    );
  });
  await import('../src/editor/main');
  await vi.advanceTimersByTimeAsync(150);
  const slider = document.getElementById('preview-year') as HTMLInputElement;
  const output = document.getElementById(
    'preview-year-value',
  ) as HTMLOutputElement;
  const desk = () => root.querySelector<HTMLElement>('.desk')!;
  const select = (card: Card) => {
    document
      .querySelector<HTMLButtonElement>(`[data-id="${card.id}"]`)!
      .click();
    vi.advanceTimersByTime(100);
  };
  const move = (year: number) => {
    slider.value = String(year);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(output.value).toBe(String(year));
    expect(root.querySelector('.year b')?.textContent).toBe(String(year));
  };
  for (const id of ['hyean', 'understudy', 'rewind', 'stitch', 'alice']) {
    const button = document.querySelector<HTMLButtonElement>(
      `.ed-preview-items [data-item="${id}"]`,
    )!;
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector(`[data-boon="${id}"]`)).not.toBeNull();
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector(`[data-boon="${id}"]`)).toBeNull();
  }
  const sist = document.querySelector<HTMLSelectElement>('#preview-sist')!;
  for (const value of ['blindfold', 'bandage', '']) {
    sist.value = value;
    sist.dispatchEvent(new Event('change', { bubbles: true }));
    expect(!!root.querySelector('.sist-slot .blindfold-slot')).toBe(value === 'blindfold');
    expect(!!root.querySelector('.sist-slot .bandage-slot')).toBe(value === 'bandage');
  }
  expect(slider.min).toBe('0');
  expect(slider.max).toBe('200');
  expect(slider.value).toBe('0');
  expect(desk().classList.contains('dread')).toBe(false);
  for (const [year, dread] of [
    [186, '0.00'],
    [193, '0.00'],
    [199, '0.00'],
    [200, '0.00'],
    [0, '0.00'],
  ] as const) {
    move(year);
    expect(desk().style.getPropertyValue('--dread')).toBe(dread);
    expect(desk().classList.contains('dread')).toBe(false);
  }
  select(story);
  expect(slider.value).toBe('193');
  select(fixed);
  expect(slider.value).toBe('0');
  select(minimum);
  expect(slider.value).toBe('199');
  select(conditional);
  expect(slider.value).toBe('187');
  select(other);
  expect(slider.value).toBe('187');
  select(story);
  expect(slider.value).toBe('193');
  move(198);
  const title = document.getElementById('f-title') as HTMLInputElement;
  title.value += '!';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  vi.advanceTimersByTime(100);
  expect(slider.value).toBe('198');
  select(fixed);
  select(story);
  expect(slider.value).toBe('198');
  root.querySelector<HTMLButtonElement>('[data-action="approve"]')!.click();
  vi.advanceTimersByTime(3000);
  expect(root.querySelector('.year b')?.textContent).toBe('198');
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'scene', scene: 'speakiCaught' },
      origin: location.origin,
      source: window.parent,
    }),
  );
  root.querySelector<HTMLButtonElement>('.scene-next')!.click();
  expect(desk().style.getPropertyValue('--dread')).toBe('0.00');
  select(daily);
  expect(slider.value).toBe('0');
});

it.each([
  ['bossDay1', 1, '0.10'],
  ['bossDay5', 13, '0.50'],
  ['bossDay10', 28, '1.00'],
])('renders a normal daily at %s', (special, year, dread) => {
  document.body.innerHTML = '<div id="app"></div>';
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'special', special },
      origin: location.origin,
      source: window.parent,
    }),
  );
  const desk = document.querySelector<HTMLElement>('.desk')!;
  expect(document.querySelector('.year')?.textContent).toContain(String(year));
  expect(desk.style.getPropertyValue('--dread')).toBe(dread);
  expect(desk.hasAttribute('data-finale')).toBe(false);
  expect(desk.classList.contains('doc-story')).toBe(false);
  const daily = rawCards.find((c) => c.id === 'daily_guard_empty_posts')!;
  expect(document.querySelector('.document h1')?.textContent).toBe(daily.title);
});

it.each([
  ['finaleKingdom', 'boss_sugar_rebellion', 0],
  ['finaleEscape', 'story_escape_3', 7],
  ['finaleLight', 'story_finale_light', 9],
  ['finaleStranger', 'story_finale_stranger', 10],
])('renders the actual finale card for %s', (special, id, order) => {
  document.body.innerHTML = '<div id="app"></div>';
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'special', special },
      origin: location.origin,
      source: window.parent,
    }),
  );
  const card = rawCards.find((c) => c.id === id)!;
  expect(document.querySelector('.year')?.textContent).toContain('200');
  expect(document.querySelector('.desk')?.getAttribute('data-finale')).toBe(
    order ? String(order) : null,
  );
  expect(document.querySelector('.document h1')?.textContent).toBe(card.title);
  expect(document.querySelector('.document')?.textContent).toContain(card.text);
});
