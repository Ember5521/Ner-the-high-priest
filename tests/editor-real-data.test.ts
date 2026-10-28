// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import rawCards from '../data/cards/m1.json';
import type { Card } from '../src/core/state';
import * as features from '../src/editor/features';

it('selects every real card with its badges, trigger meta and preview, and recovers from rendering errors', async () => {
  const cards = rawCards as Card[];
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  localStorage.clear();
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const uncaught = vi.fn();
  window.addEventListener('error', uncaught);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => structuredClone(cards),
    }),
  );
  try {
    await import('../src/editor/main');
    await vi.waitFor(() =>
      expect(document.querySelectorAll('.ed-item')).toHaveLength(cards.length),
    );
    const frame = document.getElementById('preview') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    for (const card of cards) {
      const item = document.querySelector<HTMLButtonElement>(
        `[data-id="${card.id}"]`,
      )!;
      expect(() => item.click(), card.id).not.toThrow();
      expect(
        (document.getElementById('f-id') as HTMLInputElement).value,
        card.id,
      ).toBe(card.id);
      expect(
        document.getElementById('card-list')!.textContent,
        card.id,
      ).not.toContain('undefined');
      const meta = document.querySelector(
        `[data-id="${card.id}"] small`,
      )!.textContent;
      if (card.trigger?.scheduled) expect(meta).toBe('예약 전용');
      else if (card.trigger?.from !== undefined)
        expect(meta).toBe(`${card.trigger.from}~${card.trigger.to}년`);
      else if (card.trigger?.year !== undefined)
        expect(meta).toBe(`${card.trigger.year}년`);
      const target = card.mimic
        ? cards.find((c) => c.id === card.mimic)!
        : card;
      const sources = [target, card];
      const expected = new Set<string>();
      for (const source of sources) {
        for (const choice of [source.reject, source.approve]) {
          if (choice?.grant) expected.add('grant');
          if (choice?.schedule) expected.add('schedule');
          if (choice?.adjust !== undefined) expected.add('adjust');
        }
        if (source.axeResult?.scene || source.missed?.scene)
          expected.add('scene');
        if (source.trigger?.scheduled) expected.add('scheduled');
        if (source.trigger?.from !== undefined) expected.add('window');
        if (source.period !== undefined) expected.add('period');
        if (source.axe === 'bullet') expected.add('bullet');
      }
      if (card.mimic) expected.add('mimic');
      for (const kind of expected) {
        expect(
          document.querySelector(`#features [data-badge="${kind}"]`),
          `${card.id}: ${kind}`,
        ).not.toBeNull();
        expect(
          document.querySelector(
            `[data-id="${card.id}"] [data-badge="${kind}"]`,
          ),
          `${card.id}: list ${kind}`,
        ).not.toBeNull();
      }
      // A frame load requests the current selection without waiting for the debounce.
      frame.dispatchEvent(new Event('load'));
      expect(post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'card',
          card: expect.objectContaining({ id: card.id }),
        }),
        location.origin,
      );
    }
    expect(logged).not.toHaveBeenCalled();
    expect(uncaught).not.toHaveBeenCalled();

    const failure = new Error('render failed');
    vi.spyOn(features, 'cardFeatures').mockImplementationOnce(() => {
      throw failure;
    });
    document
      .querySelector<HTMLButtonElement>('[data-id="fixed_xion_request"]')!
      .click();
    expect(logged).toHaveBeenCalledWith(failure);
    expect(document.getElementById('status')!.textContent).not.toContain(
      '저장 실패',
    );
    await vi.waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'card',
          card: expect.objectContaining({ id: 'fixed_xion_request' }),
        }),
        location.origin,
      ),
    );
    document
      .querySelector<HTMLButtonElement>('[data-id="fixed_xion_request"]')!
      .click();
    expect(
      document.querySelector('#features [data-badge="grant"]'),
    ).not.toBeNull();
    expect(uncaught).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('error', uncaught);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
}, 90000);
