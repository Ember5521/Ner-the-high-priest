// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import system from '../data/system.json';
import {
  copyFormMarkup,
  copySections,
  initializeCopyEditor,
} from '../src/editor/copy';
import { renderCopyPreview } from '../src/editor/preview';
const baseline = structuredClone(system);
afterEach(() => {
  document
    .querySelectorAll('.preferences-overlay')
    .forEach((el) => el.dispatchEvent(new Event('dispose')));
  Object.assign(system, structuredClone(baseline));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const click = (selector: string) =>
  (document.querySelector(selector) as HTMLButtonElement).click();
const edit = (path: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(
    `[data-copy-path="${path}"]`,
  )!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
it('exposes only copy strings and the dedicated tutorial focus select', () => {
  const paths = copySections(system).flatMap((s) => s.paths);
  document.body.innerHTML = copyFormMarkup(system, paths);
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('[data-copy-path]'),
  ];
  expect(inputs.length).toBeGreaterThan(100);
  for (const input of inputs) {
    const path = input.dataset.copyPath!;
    expect(path).not.toMatch(/\.(art|key|color|portrait|focus)$/);
    expect(path.startsWith('speakers.') ? path.endsWith('.name') : true).toBe(
      true,
    );
    expect(
      typeof path.split('.').reduce((value: any, key) => value[key], system),
    ).toBe('string');
    expect(input.closest('label')!.textContent).toContain(path);
  }
  expect(document.querySelectorAll('[data-copy-focus]')).toHaveLength(
    system.tutorial.steps.length,
  );
  expect(
    document.querySelector('[data-copy-path="trueEnding.text"]')!.tagName,
  ).toBe('TEXTAREA');
  for (const id of ['purist', 'reformed']) {
    expect(
      document.querySelector(
        `[data-copy-path="extraEndings.items.${id}.text"]`,
      )!.tagName,
    ).toBe('TEXTAREA');
  }
});
it('edits lists, warns inline, blocks invalid saves, posts unsaved copy and keeps edits across modes', async () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => structuredClone(baseline),
  });
  vi.stubGlobal('fetch', fetcher);
  const frame = document.getElementById('preview') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const save = document.getElementById('save') as HTMLButtonElement;
  const controller = initializeCopyEditor({
    frame,
    save,
    status: (type, message) => {
      document.getElementById('status')!.className = type;
      document.getElementById('status')!.textContent = message;
    },
    switched: vi.fn(),
  });
  click('[data-editor-mode="copy"]');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-copy-path="tutorial.title"]'),
    ).not.toBeNull(),
  );
  edit('tutorial.steps.0.text', '저장 전 튜토리얼');
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'copy',
      system: expect.objectContaining({
        tutorial: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ text: '저장 전 튜토리얼' }),
          ]),
        }),
      }),
    }),
    location.origin,
  );
  click('[data-copy-action="add"][data-path="tutorial.steps"]');
  expect(document.querySelectorAll('[data-copy-focus]')).toHaveLength(
    baseline.tutorial.steps.length + 1,
  );
  expect(save.disabled).toBe(true);
  const index = baseline.tutorial.steps.length;
  edit(`tutorial.steps.${index}.title`, '새 단계');
  edit(`tutorial.steps.${index}.text`, '새 본문');
  expect(save.disabled).toBe(false);
  click(`[data-copy-action="up"][data-index="${index}"]`);
  expect(
    (
      document.querySelector(
        `[data-copy-path="tutorial.steps.${index - 1}.title"]`,
      ) as HTMLInputElement
    ).value,
  ).toBe('새 단계');
  click(`[data-copy-action="down"][data-index="${index - 1}"]`);
  click(`[data-copy-action="remove"][data-index="${index}"]`);
  expect(document.querySelectorAll('[data-copy-focus]')).toHaveLength(
    baseline.tutorial.steps.length,
  );
  click('[data-copy-section="scenes.stitch"]');
  click('[data-copy-action="add"][data-path="scenes.stitch.lines"]');
  edit('scenes.stitch.lines.2.name', '네르');
  edit('scenes.stitch.lines.2.text', '새 대사');
  expect(save.disabled).toBe(false);
  click(
    '[data-copy-action="remove"][data-path="scenes.stitch.lines"][data-index="2"]',
  );
  click('[data-copy-section="modes"]');
  edit('modes.bestYear', '{year}년');
  expect(
    document.querySelector('[data-warning="modes.bestYear"]')!.textContent,
  ).toContain('{mode}');
  expect(save.disabled).toBe(true);
  const calls = fetcher.mock.calls.length;
  await controller.save();
  expect(fetcher).toHaveBeenCalledTimes(calls);
  edit('modes.bestYear', baseline.modes.bestYear);
  click('[data-editor-mode="cards"]');
  expect(controller.dirty).toBe(true);
  click('[data-editor-mode="copy"]');
  click('[data-copy-section="tutorial"]');
  expect(
    (
      document.querySelector(
        '[data-copy-path="tutorial.steps.0.text"]',
      ) as HTMLTextAreaElement
    ).value,
  ).toBe('저장 전 튜토리얼');
  await controller.save();
  expect(controller.dirty).toBe(false);
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__editor/system',
    expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('저장 전 튜토리얼'),
    }),
  );
});
it('renders real tutorial, scene, rewind and ending screens using unsaved values from messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const copy = structuredClone(baseline);
  copy.tutorial.steps[2]!.title = '편집한 단계';
  copy.scenes.stitch.lines[0]!.text = '편집한 대사';
  copy.rewindPrompt.title = '편집한 역행';
  copy.gameOvers.sugar_low.title = '편집한 엔딩';
  copy.trueEnding.text = '편집한 진엔딩';
  const post = (section: string, step = 0) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'copy', system: copy, section, step },
        origin: location.origin,
        source: window.parent,
      }),
    );
  post('tutorial', 2);
  expect(root.querySelector('#tutorial-title')!.textContent).toBe(
    '편집한 단계',
  );
  expect(
    root.querySelector<HTMLElement>('.preferences-overlay')!.dataset.focus,
  ).toBe('gauges');
  post('scenes.stitch');
  expect(root.querySelector('.scene')!.textContent).toContain('편집한 대사');
  post('rewindPrompt');
  expect(root.querySelector('.scene')!.textContent).toContain('편집한 역행');
  post('ending.sugar_low');
  expect(root.querySelector('.ending-screen h1')!.textContent).toBe(
    '편집한 엔딩',
  );
  post('ending.true');
  expect(root.textContent).toContain('편집한 진엔딩');
  for (const id of ['purist', 'reformed'] as const) {
    copy.extraEndings.items[id].text = `unsaved ${id}`;
    post(`ending.${id}`);
    expect(root.textContent).toContain(`unsaved ${id}`);
    expect(root.querySelector('.end-stamp.approve')).not.toBeNull();
  }
  renderCopyPreview(root, copy, 'other');
  expect(root.children).toHaveLength(0);
});
