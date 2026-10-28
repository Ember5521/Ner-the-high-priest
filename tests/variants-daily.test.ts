// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import system from '../data/system.json';
import { canRerollDaily, nextDocument, rerollDaily } from '../src/core/deck';
import { initialState, type Card, type State } from '../src/core/state';
import {
  fillForm,
  initializeForm,
  readForm,
  switchKind,
} from '../src/editor/form';
import { mulberry32 } from '../tools/simulate';
import { validateCards } from '../tools/validate-cards';

const speakers = Object.keys(system.speakers);
const daily = (pool: number, tier: 1 | 2 | 3 = 1, index = 0): Card => ({
  id: `daily-${pool}-${tier}-${index}`,
  kind: 'daily',
  variant: { group: 'spirits', pool },
  tier,
  speaker: speakers[pool - 1]!,
  faction: Object.keys(system.factions)[0]!,
  title: 'x',
  text: 'x',
  years: 1,
  axe: true,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
});
const cards = [1, 2].flatMap((pool) =>
  ([1, 2, 3] as const).flatMap((tier) =>
    Array.from({ length: 4 }, (_, i) => daily(pool, tier, i)),
  ),
);

describe('daily variants', () => {
  it('chooses both pools across seeds and draws only the chosen pool for each run', () => {
    const chosen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const rng = mulberry32(seed);
      let state = initialState();
      let pool: number | undefined;
      for (let year = 0; year < 200; year++) {
        state = nextDocument({ ...state, year, current: null }, cards, rng);
        pool ??= state.variantPools.spirits!;
        expect(state.variantPools.spirits).toBe(pool);
        expect(state.current?.kind).toBe('daily');
        expect(state.current?.variant?.pool).toBe(pool);
      }
      chosen.add(pool!);
    }
    expect([...chosen].sort()).toEqual([1, 2]);
  });

  it.each([1, 2])(
    'exhausts eligible cards in each tier cycle for pool %s',
    (pool) => {
      const rng = mulberry32(12345);
      let state: State = { ...initialState(), variantPools: { spirits: pool } };
      const shown = new Map<number, Set<string>>();
      const cycles = [0, 0, 0];
      for (let turn = 0; turn < 300; turn++) {
        state = nextDocument({ ...state, current: null }, cards, rng);
        const card = state.current!;
        expect(card.variant?.pool).toBe(pool);
        const tier = card.tier!;
        const cycle = shown.get(tier) ?? new Set<string>();
        expect(cycle.has(card.id)).toBe(false);
        cycle.add(card.id);
        if (cycle.size === 4) {
          cycles[tier - 1]!++;
          cycle.clear();
        }
        shown.set(tier, cycle);
      }
      expect(cycles.every((count) => count >= 2)).toBe(true);
    },
  );

  it('rerolls only within the chosen pool and requires an eligible alternative', () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = mulberry32(seed);
      const state: State = {
        ...nextDocument(initialState(), cards, rng),
        boons: { alice: true },
      };
      expect(canRerollDaily(state, cards)).toBe(true);
      const rerolled = rerollDaily(state, cards, rng);
      expect(rerolled.current?.id).not.toBe(state.current?.id);
      expect(rerolled.current?.variant?.pool).toBe(state.variantPools.spirits);
      expect(rerolled.variantPools).toEqual(state.variantPools);
      expect(rerolled.boons.alice).toBeUndefined();
      const noAlternative = cards.filter(
        (c) =>
          c.id === state.current!.id ||
          c.variant!.pool !== state.variantPools.spirits,
      );
      expect(canRerollDaily(state, noAlternative)).toBe(false);
      expect(rerollDaily(state, noAlternative, rng)).toBe(state);
    }
  });

  it('excludes speaki whose mimic daily belongs to an unchosen pool', () => {
    const target = daily(2);
    const mimic: Card = {
      ...daily(1),
      id: 'mimic',
      kind: 'speaki',
      variant: undefined,
      mimic: target.id,
      axe: 'free',
      axeResult: {},
    };
    const deck = [daily(1), target, mimic];
    for (const pool of [1, 2]) {
      const state = nextDocument(
        { ...initialState(), variantPools: { spirits: pool } },
        deck,
        () => 0,
      );
      expect(state.current?.id).toBe(pool === 1 ? daily(1).id : mimic.id);
    }
  });
});

describe('daily variant validation', () => {
  it('accepts equal tier counts with different speakers in each pool', () => {
    expect(validateCards(cards)).toEqual([]);
  });

  it('requires at least two pools', () => {
    expect(validateCards([daily(1)])).toContain(
      'variant group spirits: daily groups require at least 2 pools',
    );
  });

  it.each(['story', 'fixed'] as const)(
    'rejects mixed daily and %s groups',
    (kind) => {
      const mandatory = switchKind(daily(2), kind);
      expect(validateCards([daily(1), mandatory])).toContain(
        'variant group spirits: must not mix daily and story/fixed cards',
      );
    },
  );

  it('rejects unequal tier counts even when total pool sizes match', () => {
    expect(
      validateCards([daily(1, 1), daily(1, 2), daily(2, 1), daily(2, 3)]),
    ).toContain(
      'variant group spirits: daily pools must have the same number of cards per tier',
    );
  });

  it.each(['story', 'fixed'] as const)(
    'still compares speaker sets for %s groups',
    (kind) => {
      const group = [switchKind(daily(1), kind), switchKind(daily(2), kind)];
      expect(validateCards(group)).toContain(
        'variant group spirits: every pool must have the same set of speakers',
      );
      group[1]!.speaker = group[0]!.speaker;
      expect(validateCards(group)).toEqual([]);
    },
  );

  it.each([
    { group: '', pool: 1 },
    { group: ' ', pool: 1 },
    { group: 'spirits', pool: 0 },
    { group: 'spirits', pool: 1.5 },
  ])('rejects malformed daily variant %j', (variant) => {
    expect(validateCards([{ ...daily(1), variant }])).toContain(
      '[0] variant requires a nonempty group and positive integer pool on story/fixed/daily cards',
    );
  });
});

it('preserves, edits and clears daily variants in the editor and retains them when switching kinds', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.getElementById('form')!;
  initializeForm(root);
  const card = daily(1);
  fillForm(root, card);
  const group = root.querySelector<HTMLInputElement>('#f-variant-group')!;
  expect(group.closest<HTMLElement>('[data-kinds]')!.hidden).toBe(false);
  expect(readForm(root, card)).toEqual(card);
  group.value = 'other';
  root.querySelector<HTMLInputElement>('#f-variant-pool')!.value = '4';
  expect(readForm(root, card).variant).toEqual({ group: 'other', pool: 4 });
  group.value = '';
  expect(readForm(root, card)).not.toHaveProperty('variant');
  for (const kind of ['daily', 'story', 'fixed'] as const)
    expect(switchKind(card, kind).variant).toEqual(card.variant);
  for (const kind of ['special', 'speaki'] as const)
    expect(switchKind(card, kind)).not.toHaveProperty('variant');
  fillForm(root, switchKind(card, 'fixed'));
  root.querySelector<HTMLSelectElement>('#f-kind')!.value = 'daily';
  expect(readForm(root, switchKind(card, 'fixed')).variant).toEqual(
    card.variant,
  );
});
