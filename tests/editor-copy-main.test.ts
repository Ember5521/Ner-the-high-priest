// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import system from '../data/system.json';
import cards from '../data/cards/m1.json';
it('routes the shared save button and Ctrl+S by mode and protects unsaved copy', async () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const fetcher = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      structuredClone(url === '/__editor/system' ? system : cards),
  }));
  vi.stubGlobal('fetch', fetcher);
  await import('../src/editor/main');
  await vi.waitFor(() =>
    expect(
      (document.getElementById('f-id') as HTMLInputElement).value,
    ).not.toBe(''),
  );
  (
    document.querySelector('[data-editor-mode="copy"]') as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-copy-section="other"]'),
    ).not.toBeNull(),
  );
  (
    document.querySelector('[data-copy-section="other"]') as HTMLButtonElement
  ).click();
  const input = document.querySelector<HTMLInputElement>(
    '[data-copy-path="axeLine"]',
  )!;
  input.value = '편집한 도끼 대사';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }),
  );
  await vi.waitFor(() =>
    expect(document.getElementById('status')!.textContent).toBe('저장됨'),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__editor/system',
    expect.objectContaining({ method: 'PUT' }),
  );
  const saved = JSON.parse(fetcher.mock.calls.at(-1)![1].body);
  expect(saved).toEqual({ ...system, axeLine: '편집한 도끼 대사' });
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  (
    document.querySelector('[data-editor-mode="cards"]') as HTMLButtonElement
  ).click();
  (document.getElementById('save') as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(fetcher).toHaveBeenLastCalledWith(
      '/__editor/cards',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
