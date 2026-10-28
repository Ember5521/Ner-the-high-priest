// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import rawCards from '../data/cards/m1.json';
import {
  DIRECTOR_CLAMP,
  DIRECTOR_K,
  ERA_SCALE,
  GAUGE_KEYS,
} from '../src/core/config';
import { directorWeight, targetTension } from '../src/core/director';
import { choiceEffects, effectiveEraScale, eraScale, processDocument } from '../src/core/loop';
import { initialState, type Card } from '../src/core/state';
import { deskMarkup } from '../src/ui/desk';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import { playerAction } from '../tools/simulate';

const card: Card = {
  id: 'era-test',
  kind: 'daily',
  tier: 1,
  speaker: 'test',
  faction: 'test',
  title: 'Test',
  text: 'Test',
  years: 1,
  axe: true,
  reject: {
    label: 'Reject',
    effects: { sugar: 15, people: -20, faith: 5, erpin: 0 },
  },
  approve: {
    label: 'Approve',
    effects: { sugar: 15, people: -20, faith: 5, erpin: 0 },
  },
};

const scaledDelta = (delta: number, year: number) =>
  Math.sign(delta) *
  Math.max(5, Math.round((Math.abs(delta) * eraScale(year)) / 5) * 5);

describe('era scaling', () => {
  it.each([
    [ERA_SCALE[0]![0] - 10, ERA_SCALE[0]![1]],
    ...ERA_SCALE,
    ...ERA_SCALE.slice(1).flatMap(([year, value], index) =>
      [0.25, 0.5, 0.75].map((fraction) => [
        ERA_SCALE[index]![0] + (year - ERA_SCALE[index]![0]) * fraction,
        ERA_SCALE[index]![1] * (1 - fraction) + value * fraction,
      ]),
    ),
    [ERA_SCALE.at(-1)![0] + 50, ERA_SCALE.at(-1)![1]],
  ])('interpolates and holds endpoints at year %s', (year, expected) => {
    expect(eraScale(year)).toBeCloseTo(expected, 12);
  });

  it.each(['daily', 'special', 'story', 'fixed'] as const)(
    'scales only eligible kinds: %s',
    (kind) => {
      const current = { ...card, kind };
      const scaled = kind === 'daily' || kind === 'special';
      const state = { ...initialState(), current, year: 150 };
      const expected = Object.fromEntries(
        GAUGE_KEYS.map((key) => [
          key,
          scaled
            ? scaledDelta(current.approve.effects[key]!, state.year)
            : current.approve.effects[key]!,
        ]),
      );
      expect(
        choiceEffects(current.approve, state.gauges, kind, state.year),
      ).toEqual(expected);
      expect(
        processDocument(state, 'approve', [card], () => 0.5).gauges,
      ).toEqual(
        Object.fromEntries(
          GAUGE_KEYS.map((key) => [
            key,
            Math.max(0, Math.min(100, state.gauges[key] + expected[key]!)),
          ]),
        ),
      );
    },
  );

  it('rounds magnitudes symmetrically, preserves zero, enforces minimum five and has no delta cap', () => {
    const result = {
      label: 'Test',
      effects: { sugar: 1, people: -1, faith: -15, erpin: 200 },
    };
    expect(choiceEffects(result, initialState().gauges, 'daily', 150)).toEqual({
      sugar: scaledDelta(1, 150),
      people: scaledDelta(-1, 150),
      faith: scaledDelta(-15, 150),
      erpin: scaledDelta(200, 150),
    });
    expect(choiceEffects(result, initialState().gauges, 'daily', 0).sugar).toBe(
      scaledDelta(1, 0),
    );
    expect(result.effects.sugar).toBe(1);
  });

  it.each(ERA_SCALE)(
    'rounds scaled magnitudes at year %s with multiplier %s',
    (year, scale) => {
      for (const [magnitude, expected] of [
        [1, 5],
        [7.49, 5],
        [7.51, 10],
        [200, 200],
      ] as const) {
        expect(
          choiceEffects(
            {
              label: 'Test',
              effects: {
                sugar: magnitude / scale,
                people: -magnitude / scale,
                faith: 0,
              },
            },
            initialState().gauges,
            'daily',
            year,
          ),
        ).toEqual({
          sugar: expected,
          people: -expected,
          faith: 0,
        });
      }
    },
  );

  it('rounds exact half steps away from zero at unit scale', () => {
    const year = ERA_SCALE.find(([, scale]) => scale === 1)![0];
    expect(
      choiceEffects(
        { label: 'Test', effects: { sugar: 7.5, people: -7.5 } },
        initialState().gauges,
        'daily',
        year,
      ),
    ).toEqual({ sugar: 10, people: -10 });
  });

  it('scales Sist adjustments and leaves centered gauges unchanged', () => {
    const result = { label: 'Test', effects: {}, adjust: 20 };
    expect(
      choiceEffects(
        result,
        { sugar: 50, people: 80, faith: 50, erpin: 50 },
        'special',
        150,
      ),
    ).toEqual({ people: scaledDelta(-20, 150) });
    expect(
      choiceEffects(
        result,
        { sugar: 50, people: 50, faith: 50, erpin: 47 },
        'special',
        150,
      ),
    ).toEqual({ erpin: scaledDelta(3, 150) });
    expect(
      choiceEffects(result, initialState().gauges, 'special', 150),
    ).toEqual({ people: 0 });
  });

  it.each(['reject', 'approve'] as const)(
    'still applies no forged stamp effects on %s',
    (action) => {
      const state = {
        ...initialState(),
        year: 150,
        current: { ...card, kind: 'special' as const, axe: 'free' as const },
      };
      expect(processDocument(state, action, [card], () => 0.5).gauges).toEqual(
        state.gauges,
      );
    },
  );

  it('renders pips from base effects with era weight at year 150', () => {
    const state = { ...initialState(), year: 150 };
    const root = document.createElement('div');
    root.innerHTML = gaugesMarkup(state);
    updateGaugePreview(root, card, 'approve', false, state);
    const scale = eraScale(state.year);
    const tier = scale < 1.1 ? 1 : scale < 1.3 ? 2 : scale < 1.45 ? 3 : 4;
    const midpoint = [1, 1.4, 1.75, 2.1][tier - 1]!;
    for (const key of ['sugar', 'people', 'faith'] as const) {
      const base = Math.abs(card.approve.effects[key]!);
      const pips = Math.ceil(base / 5);
      const dot = root.querySelector<HTMLElement>(
        `[data-gauge="${key}"] .preview-dot`,
      )!;
      expect(dot.dataset.pips).toBe(String(pips));
      expect(dot.querySelectorAll('.pips > i')).toHaveLength(pips);
      expect(dot.getAttribute('aria-label')).toBe(
        `변화 크기 약 ${Math.round((base * scale) / 5) * 5}, 방향 불명`,
      );
    }
  });

  it('shows full signed hyean values at year 150', () => {
    const state = {
      ...initialState(),
      year: 150,
      boons: { hyean: { left: 5 } },
    };
    const root = document.createElement('div');
    root.innerHTML = gaugesMarkup(state);
    updateGaugePreview(root, card, 'approve', false, state);
    for (const key of ['sugar', 'people', 'faith'] as const) {
      const delta = scaledDelta(card.approve.effects[key]!, state.year);
      const magnitude = Math.abs(delta);
      const dot = root.querySelector<HTMLElement>(
        `[data-gauge="${key}"] .preview-dot`,
      )!;
      expect(dot.dataset.size).toBe(
        String(magnitude <= 5 ? 5 : magnitude <= 10 ? 10 : 20),
      );
      expect(dot.textContent).toBe(`${delta > 0 ? '+' : '−'}${magnitude}`);
    }
    expect(
      root.querySelector<HTMLElement>('[data-gauge="erpin"] .preview-dot')!
        .hidden,
    ).toBe(true);
    updateGaugePreview(
      root,
      {
        ...card,
        approve: {
          label: 'Test',
          effects: { sugar: 1 / eraScale(state.year) },
        },
      },
      'approve',
      false,
      state,
    );
    expect(
      root.querySelector<HTMLElement>('[data-gauge="sugar"] .preview-dot')!
        .dataset.size,
    ).toBe('5');
  });

  it('uses scaled outcomes in the director', () => {
    const state = { ...initialState(), year: 150 };
    const desired = Math.min(DIRECTOR_CLAMP, targetTension(state.year));
    const outcome = Math.max(
      ...GAUGE_KEYS.map((key) =>
        Math.abs(
          Math.max(
            0,
            Math.min(
              100,
              state.gauges[key] +
                scaledDelta(card.approve.effects[key]!, state.year),
            ),
          ) - 50,
        ),
      ),
    );
    expect(directorWeight(card, state)).toBeCloseTo(
      Math.exp(-DIRECTOR_K * (outcome - desired) ** 2),
    );
  });

  it.each(ERA_SCALE.map(([year]) => year))(
    'uses scaled lethal previews in the simulator at year %s',
    (year) => {
      const lethal = {
        ...card,
        reject: { label: 'Reject', effects: { sugar: 35 } },
        approve: { label: 'Approve', effects: { sugar: -35 } },
      };
      expect(
        playerAction(
          { ...initialState(), year, current: lethal },
          'careful',
          () => 0,
        ),
      ).toBe(scaledDelta(35, year) >= 50 ? 'axe' : 'reject');
      const lethalDelta = 50 / eraScale(year);
      expect(
        playerAction(
          {
            ...initialState(),
            year,
            current: {
              ...lethal,
              reject: { label: 'Reject', effects: { sugar: lethalDelta } },
              approve: { label: 'Approve', effects: { sugar: -lethalDelta } },
            },
          },
          'careful',
          () => 0,
        ),
      ).toBe('axe');
    },
  );
});

it('uses the apprentice era factor for effects', () => {
  const state = { ...initialState('apprentice'), year: 150, current: card };
  expect(effectiveEraScale(150, state.mode)).toBeCloseTo(1.3);
  expect(effectiveEraScale(150, 'priest')).toBe(1.5);
  const display = { ...state, current: rawCards.find((c) => c.kind === 'daily') as Card };
  expect(deskMarkup(display)).toContain('--era:0.60');
  expect(deskMarkup({ ...display, mode: 'priest' })).toContain('--era:1.00');
  expect(choiceEffects(card.approve, state.gauges, card.kind, state.year, [], state).people).toBe(-25);
});
