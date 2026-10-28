// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openOptions } from '../src/ui/preferences';
import system from '../data/system.json';
let root: HTMLDivElement;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  root
    .querySelector('.preferences-overlay')
    ?.dispatchEvent(new Event('dispose'));
  root.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('omits fullscreen when unsupported', () => {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: false,
  });
  openOptions(
    root,
    () => {},
    () => {},
  );
  expect(root.querySelector('.fullscreen-toggle')).toBeNull();
});
it('toggles fullscreen, follows changes, catches failures and removes the listener', async () => {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: null,
    writable: true,
  });
  const enter = vi.fn().mockResolvedValue(undefined);
  const exit = vi.fn().mockRejectedValue(Error('denied'));
  document.documentElement.requestFullscreen = enter;
  document.exitFullscreen = exit;
  const remove = vi.spyOn(document, 'removeEventListener');
  openOptions(
    root,
    () => {},
    () => {},
  );
  const button = root.querySelector('.fullscreen-toggle')!;
  expect(button.textContent).toBe(system.options.fullscreenEnter);
  expect(button.parentElement!.textContent).toContain(
    system.options.fullscreen,
  );
  expect(root.textContent).toContain(system.options.fullscreenNote);
  click('.fullscreen-toggle');
  expect(enter).toHaveBeenCalledWith({ navigationUI: 'hide' });
  Object.defineProperty(document, 'fullscreenElement', {
    value: document.documentElement,
  });
  document.dispatchEvent(new Event('fullscreenchange'));
  expect(button.textContent).toBe(system.options.fullscreenExit);
  click('.fullscreen-toggle');
  await Promise.resolve();
  expect(exit).toHaveBeenCalledOnce();
  click('[data-close]');
  expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
});
