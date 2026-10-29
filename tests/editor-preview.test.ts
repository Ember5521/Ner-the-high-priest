// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import '../src/editor/preview';
import { specialPreviews } from '../src/editor/specials';
import { initialState, type Card } from '../src/core/state';
import { renderPreview } from '../src/editor/preview';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';


it('switches pip direction through editor mode messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const card: Card = {
    ...(cards[0] as Card),
    kind: 'story',
    approve: { label: 'Test', effects: { sugar: -15 } },
  };
  for (const mode of ['apprentice', 'priest']) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'card', card, aim: 'approve', mode },
        origin: location.origin,
        source: window.parent,
      }),
    );
    const dot = document.querySelector<HTMLElement>(
      '[data-gauge="sugar"] .preview-dot',
    )!;
    expect(dot.dataset.pips).toBe('3');
    expect(dot.dataset.dir).toBeUndefined();
    expect(dot.getAttribute('aria-label')).toBe(
      '변화 크기 약 15, 방향 불명',
    );
  }
});

it.each(
  (['priest', 'apprentice'] as const).flatMap((mode) =>
    (['normal', 'dim', 'hyean'] as const).map((preview) => ({ mode, preview })),
  ),
)(
  'matches game gauge previews in the editor: $mode $preview',
  ({ mode, preview }) => {
    const card: Card = {
      ...(cards[0] as Card),
      kind: 'daily',
      approve: { label: 'Test', effects: { sugar: 15, people: -20 } },
    };
    const state = initialState(mode);
    state.year = 190;
    if (preview === 'dim') state.drowse = { stack: 2, left: 4 };
    if (preview === 'hyean') {
      state.boons.hyean = { left: 5 };
      state.drowse = { stack: 2, left: 4 };
    }
    const game = document.createElement('div');
    game.innerHTML = gaugesMarkup(state);
    updateGaugePreview(game, card, 'approve', state.drowse.stack === 2, state);
    const editor = document.createElement('div');
    renderPreview(editor, card, 'approve', undefined, false, state);
    expect(
      [...editor.querySelectorAll('.preview-dot')].map((dot) => dot.outerHTML),
    ).toEqual(
      [...game.querySelectorAll('.preview-dot')].map((dot) => dot.outerHTML),
    );
  },
);

it('previews direction stamps and their imprints through card messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const card = cards.find((c) => c.id === 'story_escape_1') as Card;
  for (const [side, name, art] of [
    ['reject', '왼쪽', 'stampLeft'],
    ['approve', '오른쪽', 'stampRight'],
  ] as const) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'card', card, aim: side },
        origin: location.origin,
        source: window.parent,
      }),
    );
    const tool = document.querySelector<HTMLButtonElement>(
      `[data-action="${side}"]`,
    )!;
    expect(tool.getAttribute('aria-label')).toBe(`${name} 도장`);
    expect(tool.querySelector(`[data-art-slot="ui.${art}"]`)).not.toBeNull();
    expect(document.querySelector('.choice-caption')!.textContent).toBe(
      card[side].label,
    );
    tool.click();
    expect(
      document.querySelector<HTMLElement>(`.ink.${side}`)!.style
        .backgroundImage,
    ).toContain(`stamp_${side === 'reject' ? 'left' : 'right'}.webp`);
  }
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'card', card: null },
      origin: location.origin,
      source: window.parent,
    }),
  );
});

it('previews light stamps and their imprints through card messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const card = cards.find((c) => c.id === 'story_finale_light') as Card;
  for (const [side, name, art] of [
    ['reject', '빛으로', 'stampLight'],
    ['approve', '빛으로', 'stampLight'],
  ] as const) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'card', card, aim: side },
        origin: location.origin,
        source: window.parent,
      }),
    );
    const tool = document.querySelector<HTMLButtonElement>(
      `[data-action="${side}"]`,
    )!;
    expect(tool.getAttribute('aria-label')).toBe(`${name} 가는 도장`);
    expect(tool.querySelector(`[data-art-slot="ui.${art}"]`)).not.toBeNull();
    expect(document.querySelector('.choice-caption')!.textContent).toBe(
      card[side].label,
    );
    tool.click();
    expect(
      document.querySelector<HTMLElement>(`.ink.${side}`)!.style
        .backgroundImage,
    ).toContain('stamp_light.webp');
  }
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'card', card: null },
      origin: location.origin,
      source: window.parent,
    }),
  );
});

it('previews meet stamps and their imprints through card messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const card = cards.find((c) => c.id === 'story_finale_stranger') as Card;
  for (const [side, name, art] of [
    ['reject', '손을 내민다', 'stampMeet'],
    ['approve', '손을 내민다', 'stampMeet'],
  ] as const) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'card', card, aim: side },
        origin: location.origin,
        source: window.parent,
      }),
    );
    const tool = document.querySelector<HTMLButtonElement>(
      `[data-action="${side}"]`,
    )!;
    expect(tool.getAttribute('aria-label')).toBe('손을 내미는 도장');
    expect(
      tool.querySelector('.tool-name')!.textContent!.replace(/[←→]/g, ''),
    ).toBe(name);
    expect(tool.querySelector(`[data-art-slot="ui.${art}"]`)).not.toBeNull();
    expect(document.querySelector('.choice-caption')!.textContent).toBe(
      card[side].label,
    );
    tool.click();
    expect(
      document.querySelector<HTMLElement>(`.ink.${side}`)!.style
        .backgroundImage,
    ).toContain('stamp_meet.webp');
  }
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'card', card: null },
      origin: location.origin,
      source: window.parent,
    }),
  );
});

it('renders real scene and boon previews, clears on card messages and rejects foreign messages', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const send = (
    data: unknown,
    origin = location.origin,
    source = window.parent,
  ) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  send({ type: 'scene', scene: 'speakiCaught' });
  expect(root.childElementCount).toBe(0);
  const card = { type: 'card', card: cards[0], aim: 'none' };
  send(card);
  expect(root.querySelector('.document')).not.toBeNull();
  send({ type: 'scene', scene: 'speakiCaught' });
  expect(
    root.querySelector('.scene [data-art-slot="ui.speakiCaught"]'),
  ).not.toBeNull();
  expect(root.querySelector('#scene-title')?.textContent).toBe(
    system.scenes.speakiCaught.title,
  );
  expect(root.querySelectorAll('.scene-line')).toHaveLength(
    system.scenes.speakiCaught.lines.length,
  );
  expect(root.querySelector('.document')).not.toBeNull();
  root.querySelector<HTMLButtonElement>('.scene-next')!.click();
  expect(root.querySelector('.scene')).toBeNull();
  for (const boon of Object.keys(system.boons)) {
    send({ type: 'boon', boon });
    expect(root.querySelectorAll('.status-icon, .blindfold-slot, .bandage-slot')).toHaveLength(
      1,
    );
    expect(
      root.querySelector(
        boon === 'bandage'
          ? '.sist-slot .bandage-slot'
          : boon === 'blindfold'
          ? '.sist-slot .blindfold-slot'
          : `.status-icon[data-boon="${boon}"]`,
      ),
    ).not.toBeNull();
    expect(root.querySelector('.scene')).toBeNull();
  }
  send(card);
  expect(root.querySelector('.status-icon')).toBeNull();
  send({ type: 'scene', scene: 'speakiFooled' });
  send(card);
  expect(root.querySelector('.scene')).toBeNull();
  send({ type: 'boon', boon: 'alice' }, 'https://example.com');
  send(
    { type: 'boon', boon: 'alice' },
    location.origin,
    null as unknown as Window,
  );
  send({ type: 'boon', boon: 'unknown' });
  send({ type: 'scene', scene: 'unknown' });
  expect(root.querySelector('.status-icon, .scene')).toBeNull();
  send({ type: 'card', card: null });
  expect(root.childElementCount).toBe(0);
});

const sendSpecial = (
  special: string,
  origin = location.origin,
  source: Window | null = window.parent,
) =>
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'special', special },
      origin,
      source,
    }),
  );
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  document.querySelector<HTMLElement>('.rewind-fx')?.click();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it.each(Object.keys(specialPreviews))(
  'renders special %s without a selected card',
  (id) => {
    const root = document.getElementById('app')!;
    expect(() => sendSpecial(id)).not.toThrow();
    expect(root.querySelector('.desk .document')).not.toBeNull();
    expect(root.querySelector('.preview-replay')).not.toBeNull();
    if (Object.hasOwn(system.scenes, id)) {
      const scene = system.scenes[id as keyof typeof system.scenes];
      expect(
        root
          .querySelector('.scene [data-art-slot]')
          ?.getAttribute('data-art-slot'),
      ).toBe(`ui.${scene.art}`);
      expect(root.querySelector('#scene-title')?.textContent).toBe(scene.title);
      root.querySelector<HTMLButtonElement>('.scene-next')!.click();
      expect(root.querySelector('.scene')).toBeNull();
      expect(root.querySelector('.preview-replay')).not.toBeNull();
    }
    if (id === 'sleep' || id === 'erpinSave')
      expect(root.querySelector('.desk.sleeping')).not.toBeNull();
    if (id === 'hyean') {
      expect(root.querySelectorAll('.gauge-value')).toHaveLength(4);
      expect(
        root.querySelector('.preview-dot.exact:not([hidden])')?.textContent,
      ).toMatch(/[+−]\d+/);
    }
    if (id === 'bullet' || id === 'axe' || id === 'alice') {
      expect(root.querySelector(`.processed-${id}`)).not.toBeNull();
      const title = root.querySelector('h1')!.textContent;
      if (id === 'alice')
        expect(root.querySelector('[data-boon="alice"]')).not.toBeNull();
      vi.advanceTimersByTime(3000);
      expect(root.querySelector('.document')).not.toBeNull();
      expect(root.querySelector(`.processed-${id}`)).toBeNull();
      if (id === 'alice') {
        expect(root.querySelector('h1')!.textContent).not.toBe(title);
        expect(root.querySelector('[data-boon="alice"]')).toBeNull();
      }
    }
  },
);

it('shows the rewind dialog over the fatal desk, plays the real FX and restores year 181', async () => {
  const root = document.getElementById('app')!;
  sendSpecial('rewind');
  expect(root.querySelector('.desk .scene.rewind')).not.toBeNull();
  expect(root.querySelector('.processed-approve')).not.toBeNull();
  expect(
    root
      .querySelector('[data-gauge="sugar"] [role="meter"]')
      ?.getAttribute('aria-valuenow'),
  ).toBe('0');
  expect(
    root.querySelector(`[data-art-slot="ui.${system.rewindPrompt.art}"]`),
  ).not.toBeNull();
  expect(root.querySelector('#scene-title')?.textContent).toBe(
    system.rewindPrompt.title,
  );
  root.querySelector<HTMLButtonElement>('[data-rewind="yes"]')!.click();
  expect(document.querySelector('.rewind-fx')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(4000);
  expect(document.querySelector('.rewind-fx')).toBeNull();
  expect(root.querySelector('.year b')?.textContent).toBe('181');
  expect(root.querySelector('.scene')).toBeNull();
  expect(root.hasAttribute('inert')).toBe(false);
  root.querySelector<HTMLButtonElement>('.preview-replay')!.click();
  root.querySelector<HTMLButtonElement>('[data-rewind="no"]')!.click();
  expect(root.querySelector('.ending-screen')).not.toBeNull();
});

it('rejects invalid/foreign specials and prevents an old effect from replacing a newer preview', () => {
  const root = document.getElementById('app')!;
  sendSpecial('unknown');
  sendSpecial('rewind', 'https://example.com');
  sendSpecial('rewind', location.origin, null);
  expect(root.childElementCount).toBe(0);
  sendSpecial('alice');
  sendSpecial('hyean');
  vi.advanceTimersByTime(4000);
  expect(root.querySelector('.boon-hyean')).not.toBeNull();
  sendSpecial('rewind');
  root.querySelector<HTMLButtonElement>('[data-rewind="yes"]')!.click();
  sendSpecial('sleep');
  vi.advanceTimersByTime(4000);
  expect(root.querySelector('.sleeping')).not.toBeNull();
  expect(document.querySelector('.rewind-fx')).toBeNull();
});

it('equips preview item messages and resets them on the next card message', () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const card: Card = {
    ...(cards[0] as Card),
    kind: 'fixed',
    approve: { label: 'x', effects: { sugar: 20 } },
  };
  const send = (items: string[] = [], blindfold = '') =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: window.parent,
        data: { type: 'card', card, aim: 'approve', items, blindfold },
      }),
    );
  for (const item of [
    'hyean',
    'scope',
    'understudy',
    'rewind',
    'stitch',
    'alice',
  ]) {
    send([item]);
    expect(root.querySelector(`[data-boon="${item}"]`)).not.toBeNull();
    if (item === 'hyean')
      expect(root.querySelectorAll('.gauge-value')).toHaveLength(4);
    if (item === 'scope') {
      expect(root.querySelector('[data-boon="scope"] b')?.textContent).toBe(
        '4',
      );
      // without Diana's numbers the preview ignores the worn cloak's damping
      expect(
        root
          .querySelector('[data-gauge="sugar"] .preview-dot')
          ?.getAttribute('data-pips'),
      ).toBe('4');
    }
  }
  send([], 'held');
  expect(root.querySelector('.sist-slot .blindfold-slot')).not.toBeNull();
  expect(root.querySelector('.blindfold-slot b')).toBeNull();
  expect(root.querySelector('[data-blindfold]')).toBeNull();
  for (const gauge of ['sugar', 'people', 'faith', 'erpin']) {
    send([], gauge);
    expect(
      root.querySelector(
        `[data-gauge="${gauge}"][data-blindfold] .blindfold-mark`,
      ),
    ).not.toBeNull();
    if (gauge === 'sugar')
      expect(
        root.querySelector<HTMLElement>('[data-gauge="sugar"] .preview-dot')
          ?.hidden,
      ).toBe(true);
  }
  send(['invalid'], 'invalid');
  expect(
    root.querySelector(
      '.status-icon, .blindfold-slot, [data-blindfold], .gauge-value',
    ),
  ).toBeNull();
});
