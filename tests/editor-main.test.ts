// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import rawCards from '../data/cards/m1.json';
import type { Card } from '../src/core/state';
const cards = rawCards as Card[];

it('loads selection, validates edits, saves with keyboard, restores aim and protects dirty changes', async () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const selected = cards.find((c) => c.kind === 'daily')!;
  localStorage.setItem(
    'event-editor',
    JSON.stringify({ kind: 'daily', id: selected.id }),
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => structuredClone(cards) });
  vi.stubGlobal('fetch', fetcher);
  await import('../src/editor/main');
  await vi.waitFor(() =>
    expect((document.getElementById('f-id') as HTMLInputElement).value).toBe(
      selected.id,
    ),
  );
  const save = document.getElementById('save') as HTMLButtonElement;
  expect(
    document
      .querySelector('.ed-kinds [data-kind="daily"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  const title = document.getElementById('f-title') as HTMLInputElement;
  title.value = '';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  expect(save.disabled).toBe(true);
  expect(document.getElementById('errors')?.hidden).toBe(false);
  expect(title.closest('.ed-field')?.classList.contains('invalid')).toBe(true);
  expect(document.querySelector('.ed-bad')).not.toBeNull();
  title.value = selected.title;
  title.dispatchEvent(new Event('input', { bubbles: true }));
  expect(save.disabled).toBe(false);
  expect(document.getElementById('status')?.textContent).toBe(
    '저장 안 된 변경 있음',
  );
  expect(document.getElementById('status')?.classList.contains('dirty')).toBe(
    true,
  );
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fetcher.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ errors: ['test error'] }),
  });
  save.click();
  await vi.waitFor(() =>
    expect(document.getElementById('status')?.classList.contains('error')).toBe(
      true,
    ),
  );
  fetcher.mockResolvedValueOnce({ ok: true });
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }),
  );
  await vi.waitFor(() =>
    expect(document.getElementById('status')?.classList.contains('saved')).toBe(
      true,
    ),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__editor/cards',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toEqual(cards);
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
  const frame = document.getElementById('preview') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  (document.querySelector('[data-aim="approve"]') as HTMLButtonElement).click();
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'card',
      aim: 'approve',
      card: expect.objectContaining({ id: selected.id }),
    }),
    location.origin,
  );
  expect(
    document
      .querySelector('[data-aim="approve"]')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  frame.dispatchEvent(new Event('load'));
  expect(post).toHaveBeenCalledTimes(2);
  const mode = document.getElementById('preview-mode') as HTMLSelectElement;
  expect(mode.value).toBe('priest');
  for (const value of ['apprentice', 'priest']) {
    mode.value = value;
    mode.dispatchEvent(new Event('change'));
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'card', mode: value, aim: 'approve' }),
      location.origin,
    );
  }
  const bullet = document.getElementById('preview-bullet') as HTMLButtonElement;
  bullet.click();
  expect(bullet.getAttribute('aria-pressed')).toBe('true');
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'card', armed: true, aim: 'approve' }),
    location.origin,
  );
  bullet.click();
  expect(bullet.getAttribute('aria-pressed')).toBe('false');
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ armed: false, aim: 'approve' }),
    location.origin,
  );
  // the bandage is a select like the blindfold: none / held / used on a gauge
  expect(document.querySelector('[data-item="bandage"]')).toBeNull();
  const bandage = document.querySelector<HTMLSelectElement>('#preview-bandage')!;
  expect([...bandage.options].map((o) => o.value)).toEqual([
    '',
    'held',
    'sugar',
    'people',
    'faith',
    'erpin',
  ]);
  bandage.value = 'sugar';
  bandage.dispatchEvent(new Event('change'));
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ bandage: 'sugar' }),
    location.origin,
  );
  bandage.value = '';
  bandage.dispatchEvent(new Event('change'));
  expect(JSON.parse(localStorage.getItem('event-editor')!).id).toBe(
    selected.id,
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
