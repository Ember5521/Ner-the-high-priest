// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { specialPreviews } from '../src/editor/specials';

it('offers every special with no selected card and can replay the chosen entry', async () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
  );
  await import('../src/editor/main');
  expect(document.querySelector('.ed-item')).toBeNull();
  const menu = document.getElementById('preview-special') as HTMLSelectElement;
  const frame = document.getElementById('preview') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  expect(menu.disabled).toBe(false);
  for (const [id, label] of Object.entries(specialPreviews)) {
    expect(menu.querySelector(`option[value="${id}"]`)?.textContent).toBe(
      label,
    );
    expect(label).not.toContain('?');
    menu.value = id;
    menu.dispatchEvent(new Event('change'));
    expect(post).toHaveBeenLastCalledWith(
      { type: 'special', special: id },
      location.origin,
    );
  }
  post.mockClear();
  document.getElementById('preview-replay')!.click();
  expect(post).toHaveBeenCalledWith(
    { type: 'special', special: 'sleep' },
    location.origin,
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
