// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as loop from '../src/core/loop';
import cards from '../data/cards/m1.json';
import { initialState, type Card } from '../src/core/state';
import {
  gaugesMarkup,
  previewFor,
  understudyDamped,
  updateGaugePreview,
} from '../src/ui/gauges';

describe('resource preview', () => {
  it('reports direction and all three magnitudes in gauge order', () => {
    const card: Card = {
      ...(cards[0] as Card),
      approve: {
        label: '승인',
        effects: { sugar: -20, people: 10, faith: -5, erpin: 5 },
      },
    };
    expect(previewFor(card, 'approve')).toEqual([
      { gauge: 'sugar', dir: 'down', size: 20 },
      { gauge: 'people', dir: 'up', size: 10 },
      { gauge: 'faith', dir: 'down', size: 5 },
      { gauge: 'erpin', dir: 'up', size: 5 },
    ]);
  });

  it('uses the selected choice, excludes unaffected gauges, and leaves data unchanged', () => {
    const card: Card = {
      ...(cards.find((c) => c.id === 'daily_diana_berries') as Card),
      reject: { label: 'x', effects: { sugar: 5, people: -10 } },
    };
    const before = structuredClone(card);
    expect(previewFor(card, 'reject')).toEqual([
      { gauge: 'sugar', dir: 'up', size: 5 },
      { gauge: 'people', dir: 'down', size: 10 },
    ]);
    expect(card).toEqual(before);
  });

  it('returns nothing for cancel or zero changes', () => {
    expect(previewFor(cards[0] as Card, null)).toEqual([]);
    expect(
      previewFor(
        {
          ...(cards[0] as Card),
          reject: { label: 'x', effects: { sugar: 0 } },
        },
        'reject',
      ),
    ).toEqual([]);
  });
});

describe('pip previews', () => {
  const card: Card = {
    ...(cards[0] as Card),
    kind: 'story',
    approve: { label: 'Test', effects: { sugar: 15, people: -20 } },
  };
  const root = () => {
    const panel = document.createElement('div');
    panel.innerHTML = gaugesMarkup(initialState());
    return panel;
  };
  const dot = (panel: HTMLElement) =>
    panel.querySelector<HTMLElement>('[data-gauge="sugar"] .preview-dot')!;

  it.each([
    [5, 1],
    [10, 2],
    [15, 3],
    [20, 4],
  ])('renders %s points as %s pips without direction', (delta, pips) => {
    const panel = root();
    for (const sign of [1, -1]) {
      updateGaugePreview(
        panel,
        {
          ...card,
          approve: { label: 'Test', effects: { sugar: sign * delta } },
        },
        'approve',
        false,
        initialState(),
      );
      const preview = dot(panel);
      expect(preview.hidden).toBe(false);
      expect(preview.dataset.pips).toBe(String(pips));
      expect(preview.hasAttribute('data-dir')).toBe(false);
      expect(preview.hasAttribute('data-size')).toBe(false);
      expect(preview.getAttribute('aria-label')).toBe(
        `변화 크기 약 ${delta}, 방향 불명`,
      );
      expect(preview.innerHTML).toBe(
        `<span class="pips" aria-hidden="true">${'<i></i>'.repeat(pips)}</span>`,
      );
      expect(preview.hasAttribute('data-rings')).toBe(false);
      expect(preview.style.getPropertyValue('--preview-size')).toBe('');
    }
  });

  it.each(['daily', 'special', 'speaki'] as const)(
    'keeps base pip counts for %s at early and late years in both modes',
    (kind) => {
      for (const mode of ['priest', 'apprentice'] as const) {
        for (const year of [0, 190]) {
          for (const [base, pips] of [
            [1, 1],
            [5, 1],
            [6, 2],
            [10, 2],
            [15, 3],
            [20, 4],
            [25, 4],
          ] as const) {
            const state = { ...initialState(mode), year };
            const panel = root();
            updateGaugePreview(
              panel,
              {
                ...card,
                kind,
                approve: { label: 'Test', effects: { sugar: -base } },
              },
              'approve',
              false,
              state,
            );
            const preview = dot(panel);
            const scale = loop.effectiveEraScale(year, mode);
            const tier =
              scale < 1.1 ? 1 : scale < 1.3 ? 2 : scale < 1.45 ? 3 : 4;
            expect(preview.dataset.pips).toBe(String(pips));
            expect(preview.dataset.tier).toBe(String(tier));
            expect(preview.querySelectorAll('.pips > i')).toHaveLength(pips);
            expect(
              preview.querySelector('.pips')?.getAttribute('aria-hidden'),
            ).toBe('true');
            expect(preview.hasAttribute('data-rings')).toBe(false);
            expect(preview.style.getPropertyValue('--preview-size')).toBe('');
            const midpoint = [1, 1.4, 1.75, 2.1][tier - 1]!;
            const approx = Math.round((base * scale) / 5) * 5;
            expect(preview.getAttribute('aria-label')).toBe(
`변화 크기 약 ${approx}, 방향 불명`,
            );
          }
        }
      }
    },
  );

  it.each([
    [1, 1, 1],
    [6, 1, 2],
    [20, 1, 4],
    [21, 2, 3],
    [28, 2, 4],
    [29, 3, 4],
    [35, 3, 4],
    [36, 4, 4],
    [42, 4, 4],
    [100, 4, 4],
  ])(
    'fits non-scaled magnitude %s into tier %s with %s pips',
    (delta, tier, pips) => {
      for (const kind of ['story', 'fixed'] as const) {
        const panel = root();
        updateGaugePreview(
          panel,
          {
            ...card,
            kind,
            approve: { label: 'Test', effects: { sugar: -delta } },
          },
          'approve',
          false,
          { ...initialState(), year: 190 },
        );
        expect(dot(panel).dataset).toMatchObject({
          tier: String(tier),
          pips: String(pips),
        });
        expect(dot(panel).querySelectorAll('.pips > i')).toHaveLength(pips);
        expect(dot(panel).getAttribute('aria-label')).toBe(
          `변화 크기 약 ${delta}, 방향 불명`,
        );
      }
    },
  );

  it.each([
    [1, 1],
    [1.0999, 1],
    [1.1, 2],
    [1.2999, 2],
    [1.3, 3],
    [1.4499, 3],
    [1.45, 4],
  ])(
    'uses era multiplier %s including exact thresholds',
    (multiplier, tier) => {
      const scale = vi.spyOn(loop, 'effectiveEraScale').mockReturnValue(multiplier);
      const panel = root();
      try {
        updateGaugePreview(
          panel,
          { ...card, kind: 'daily' },
          'approve',
          false,
          initialState(),
        );
      } finally {
        scale.mockRestore();
      }
      expect(dot(panel).dataset.tier).toBe(String(tier));
      expect(dot(panel).dataset.pips).toBe('3');
      expect(dot(panel).querySelectorAll('.pips > i')).toHaveLength(3);
      expect(dot(panel).hasAttribute('data-rings')).toBe(false);
      expect(dot(panel).style.getPropertyValue('--preview-size')).toBe('');
    },
  );

  it('uses actual resolved adjustment deltas', () => {
    const state = { ...initialState(), year: 190 };
    state.gauges.people = 10;
    state.gauges.sugar = 10;
    for (const result of [{ effects: {}, adjust: 20 }]) {
      const panel = root();
      const current = {
        ...card,
        kind: 'daily' as const,
        approve: { label: 'Test', ...result },
      };
      updateGaugePreview(panel, current, 'approve', false, state);
      const change = previewFor(
        current,
        'approve',
        state.gauges,
        state.year,
      )[0]!;
      const preview = panel.querySelector<HTMLElement>(
        `[data-gauge="${change.gauge}"] .preview-dot`,
      )!;
      const tier =
        change.size <= 20
          ? 1
          : change.size <= 28
            ? 2
            : change.size <= 35
              ? 3
              : 4;
      const midpoint = [1, 1.4, 1.75, 2.1][tier - 1]!;
      expect(preview.dataset).toMatchObject({
        tier: String(tier),
        pips: String(Math.min(4, Math.ceil(change.size / (5 * midpoint)))),
      });
      expect(preview.getAttribute('aria-label')).toBe(
        `변화 크기 약 ${change.size}, 방향 불명`,
      );
    }
  });

  it('keeps apprentice dim pips neutral with their late-era tier', () => {
    const panel = root();
    const state = { ...initialState('apprentice'), year: 190 };
    updateGaugePreview(
      panel,
      { ...card, kind: 'daily' },
      'approve',
      true,
      state,
    );
    const scale = loop.effectiveEraScale(state.year, state.mode);
    const tier = scale < 1.1 ? 1 : scale < 1.3 ? 2 : scale < 1.45 ? 3 : 4;
    const midpoint = [1, 1.4, 1.75, 2.1][tier - 1]!;
    expect(dot(panel).dataset).toMatchObject({ tier: String(tier), pips: '0' });
    expect(dot(panel).hasAttribute('data-dir')).toBe(false);
    expect(dot(panel).querySelector('.pips.unknown')).not.toBeNull();
    updateGaugePreview(panel, { ...card, kind: 'daily' }, 'approve', true, {
      ...state,
      mode: 'priest',
    });
    expect(dot(panel).dataset.pips).toBe('0');
    expect(dot(panel).style.getPropertyValue('--preview-size')).toBe('');
    expect(dot(panel).innerHTML).toBe(
      '<span class="pips unknown" aria-hidden="true">?</span>',
    );
  });

  it('anchors non-exact pips above icons and styles unknown, neutral and directional pips', () => {
    const css = readFileSync('src/ui/style.css', 'utf8');
    expect(css).toMatch(
      /\.preview-dot:not\(\.exact\)\s*\{[^}]*top: auto;[^}]*bottom: calc\(100% \+ 6px\);[^}]*transform: translateX\(-50%\)/,
    );
    expect(css).toMatch(/\.topbar\s*\{[^}]*row-gap: 16px;/);
    expect(css).toMatch(/\.pips\s*\{[^}]*display: flex;[^}]*gap: 3px;/);
    expect(css).toMatch(
      /\.pips i\s*\{[^}]*width: 8px;[^}]*height: 8px;[^}]*border-radius: 50%;[^}]*background: currentColor;/,
    );
    // two Z: a '?' instead of a hollow pip
    expect(css).toMatch(/\.pips\.unknown\s*\{[^}]*font-family: var\(--display\);/);
    expect(css).not.toContain('.bark');
    for (const [tier, color] of [
      [2, '#f3dcb4'],
      [3, '#f6c08a'],
      [4, '#ffb36b'],
    ]) {
      expect(css).toContain(
        `.preview-dot:not([data-dir])[data-tier='${tier}'] {\n  color: ${color};`,
      );
    }
    for (const tier of [2, 3, 4]) {
      expect(css).toContain(
        `.preview-dot[data-tier='${tier}'] .pips:not(.unknown) i`,
      );
    }
    for (const [dir, color] of [
      ['up', '--up'],
      ['down', '--down'],
    ]) {
      expect(css).toContain(
        `.preview-dot:not(.exact)[data-tier][data-dir='${dir}'] {\n  color: var(${color});`,
      );
    }
  });

  it('keeps signed hyean chips through dimming and clears direction when hyean expires', () => {
    const panel = root();
    const state = initialState();
    state.boons.hyean = { left: 5 };
    updateGaugePreview(panel, card, 'approve', true, state);
    for (const [gauge, text, dir, label] of [
      ['sugar', '+15', 'up', '증가 15'],
      ['people', '−20', 'down', '감소 20'],
    ]) {
      const preview = panel.querySelector<HTMLElement>(
        `[data-gauge="${gauge}"] .preview-dot`,
      )!;
      expect(preview.classList.contains('exact')).toBe(true);
      expect(preview.textContent).toBe(text);
      expect(preview.dataset.dir).toBe(dir);
      expect(preview.getAttribute('aria-label')).toBe(label);
      expect(preview.querySelector('.pips, svg')).toBeNull();
    }
    updateGaugePreview(panel, card, 'approve', false, initialState());
    expect(dot(panel).classList.contains('exact')).toBe(false);
    expect(dot(panel).hasAttribute('data-dir')).toBe(false);
    expect(dot(panel).dataset.pips).toBe('3');
  });

  it('dims every affected gauge to the same plain dot and clears cancelled previews', () => {
    const panel = root();
    updateGaugePreview(panel, card, 'approve', true);
    const previews = [
      ...panel.querySelectorAll<HTMLElement>('.preview-dot:not([hidden])'),
    ];
    expect(previews).toHaveLength(2);
    for (const preview of previews) {
      expect(preview.dataset.pips).toBe('0');
      expect(preview.style.getPropertyValue('--preview-size')).toBe('');
      expect(preview.innerHTML).toBe(
        '<span class="pips unknown" aria-hidden="true">?</span>',
      );
      expect(preview.getAttribute('aria-label')).toBe(
        '변화 있음, 크기·방향 불명',
      );
    }
    expect(previews[0]!.innerHTML).toBe(previews[1]!.innerHTML);
    updateGaugePreview(panel, card, null);
    for (const preview of previews) {
      expect(preview.hidden).toBe(true);
      expect(preview.innerHTML).toBe('');
      expect(preview.hasAttribute('data-rings')).toBe(false);
      expect(preview.hasAttribute('aria-label')).toBe(false);
    }
  });
it.each(['apprentice', 'priest'] as const)('shows only direction with intuition and gives hyean priority in %s', (mode) => {
  const panel = root();
  const state = initialState(mode);
  state.boons.intuition = { left: 2 };
  updateGaugePreview(panel, card, 'approve', false, state);
  const preview = dot(panel);
  expect(preview.dataset.dir).toBe('up');
  expect(preview.textContent).toBe('');
  expect(preview.hasAttribute('data-tier')).toBe(false);
  expect(preview.hasAttribute('data-pips')).toBe(false);
  expect(preview.getAttribute('aria-label')).toBe('증가');
  state.boons.hyean = { left: 1 };
  updateGaugePreview(panel, card, 'approve', false, state);
  expect(preview.textContent).toBe('+15');
});

it('keeps the understudy off the preview until Diana shows numbers', () => {
  const panel = root();
  const risky: Card = {
    ...card,
    kind: 'fixed',
    approve: { label: 'Test', effects: { sugar: -15 } },
  };
  const safe: Card = {
    ...risky,
    approve: { label: 'Test', effects: { sugar: 15 } },
  };
  const state = {
    ...initialState('priest'),
    gauges: { sugar: 30, people: 50, faith: 50, erpin: 50 },
  };
  state.boons.understudy = true;
  expect(previewFor(risky, 'approve', state.gauges, 0, [], state)).toEqual([
    { gauge: 'sugar', dir: 'down', size: 15 },
  ]);
  updateGaugePreview(panel, risky, 'approve', false, state);
  const toward = dot(panel).outerHTML;
  expect(dot(panel).hasAttribute('data-understudy')).toBe(false);
  updateGaugePreview(panel, safe, 'approve', false, state);
  expect(dot(panel).outerHTML).toBe(toward);
  // the stamp itself is still softened, and the helper says so
  expect(
    loop.choiceEffects(risky.approve, state.gauges, 'fixed', 0, [], state).sugar,
  ).toBe(-10);
  expect(understudyDamped(risky.approve, state.gauges, risky, 0, [], state)).toBe(true);
  expect(understudyDamped(safe.approve, state.gauges, safe, 0, [], state)).toBe(false);
  const shown = { ...state, boons: { understudy: true as const, hyean: { left: 2 } } };
  updateGaugePreview(panel, risky, 'approve', false, shown);
  expect(dot(panel).hasAttribute('data-understudy')).toBe(true);
  expect(dot(panel).textContent).toBe('−10');
});
it('lays several effects on one gauge side by side', () => {
  const state = initialState('priest');
  state.statuses = [
    { id: 'pikora_drift', source: 'x', left: 4, tick: { sugar: 5 } },
    { id: 'drowsy_fairies', source: 'y', left: 3, tick: { sugar: -3 } },
  ];
  const panel = document.createElement('div');
  panel.innerHTML = gaugesMarkup(state);
  expect(
    panel.querySelectorAll('[data-gauge="sugar"] .status-badges > .status-badge'),
  ).toHaveLength(2);
  expect(panel.querySelectorAll('.status-badges')).toHaveLength(1);
});
});
