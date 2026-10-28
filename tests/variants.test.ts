// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import { GROUP_GAP } from '../src/core/config';
import { eligible, nextDocument } from '../src/core/deck';
import { processDocument, rewind } from '../src/core/loop';
import { initialState, recordSnapshot, type Card } from '../src/core/state';
import { loadRun, saveRun } from '../src/save/storage';
import { mulberry32 } from '../tools/simulate';
import { validateCards } from '../tools/validate-cards';

const cards = raw as Card[];
const elves = cards.filter((c) => c.variant?.group === 'elves');
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  conditions: undefined,
  years: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
const pool = [daily, ...elves];
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('per-run variants', () => {
  it('chooses uniformly from distinct pools, deterministically and without mutation', () => {
    const before = initialState();
    for (const [roll, chosen] of [
      [0, 1],
      [0.333334, 2],
      [0.666667, 3],
      [0.999999, 3],
    ]) {
      const state = nextDocument(before, pool, () => roll!);
      expect(state.variantPools).toEqual({ elves: chosen });
    }
    const draw = () => nextDocument(before, pool, mulberry32(123));
    expect(draw()).toEqual(draw());
    expect(before.variantPools).toEqual({});
    expect(before.windowYears).toEqual({});
    const picked = draw();
    const again = nextDocument(
      { ...picked, current: null },
      pool,
      mulberry32(999),
    );
    expect(again.variantPools).toEqual(picked.variantPools);
    expect(again.windowYears).toEqual(picked.windowYears);
    expect(elves.every((card) => !eligible(card, before))).toBe(true);
    for (const card of elves)
      expect(eligible(card, picked)).toBe(
        card.variant!.pool === picked.variantPools.elves,
      );
  });

  it('uses distinct pool numbers independently for each group', () => {
    const variantCards = [2, 2, 9].map((pool, i) => ({
      ...elves[0]!,
      id: `v${i}`,
      variant: { group: 'other', pool },
    }));
    const state = nextDocument(
      initialState(),
      [...pool, ...variantCards],
      () => 0.75,
    );
    expect(state.variantPools).toEqual({ elves: 3, other: 9 });
  });

  it('shows only the chosen three elves, with assigned and actual years at least GROUP_GAP apart', () => {
    const chosen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const rng = mulberry32(seed);
      let state = nextDocument(initialState(), pool, rng);
      chosen.add(state.variantPools.elves!);
      const selected = elves.filter(
        (c) => c.variant!.pool === state.variantPools.elves,
      );
      const years = selected
        .map((c) => state.windowYears[c.id]!)
        .sort((a, b) => a - b);
      expect(Object.keys(state.windowYears)).toHaveLength(3);
      expect(years[0]).toBeGreaterThanOrEqual(90);
      expect(years[2]).toBeLessThanOrEqual(160);
      for (let i = 1; i < years.length; i++)
        expect(years[i]! - years[i - 1]!).toBeGreaterThanOrEqual(GROUP_GAP);
      const appeared: string[] = [];
      const appearedYears: number[] = [];
      for (
        let turn = 0;
        state.year <= 180 && !state.ending && turn < 220;
        turn++
      ) {
        if (state.current?.variant) {
          appeared.push(state.current.id);
          appearedYears.push(state.year);
        }
        state = processDocument(
          { ...state, gauges: initialState().gauges },
          'approve',
          pool,
          rng,
        );
      }
      expect(appeared.sort()).toEqual(selected.map((c) => c.id).sort());
      expect(appearedYears).toEqual(years);
    }
    expect([...chosen].sort()).toEqual([1, 2, 3]);
  });

  it('backtracks when an early roll blocks a narrower window', () => {
    const wide: Card = {
      ...elves[0]!,
      trigger: { from: 121, to: 137, order: 1 },
    };
    const narrow: Card = {
      ...elves[1]!,
      trigger: { from: 121, to: 121, order: 1 },
    };
    const state = nextDocument(initialState(), [daily, wide, narrow], () => 0);
    expect(state.windowYears).toEqual({ [wide.id]: 136, [narrow.id]: 121 });
  });

  it('keeps picks and years through save, load and snapshot rewind', () => {
    const state = recordSnapshot(
      nextDocument(
        {
          ...initialState(),
          year: 151,
          rewindYear: 151,
          boons: { rewind: true },
        },
        pool,
        mulberry32(4),
      ),
    );
    saveRun(state);
    const loaded = loadRun(pool)!;
    expect(loaded).toEqual(state);
    expect(loaded.past[0]!.variantPools).toEqual(state.variantPools);
    const restored = rewind(
      { ...loaded, year: 160, ending: { id: 'sugar_low' } },
      pool,
      () => {
        throw Error('unexpected draw');
      },
    );
    expect(restored.variantPools).toEqual(state.variantPools);
    expect(restored.windowYears).toEqual(state.windowYears);
    expect(restored.variantPools).not.toBe(state.variantPools);
  });

  it('defaults old saves and snapshots to empty pools and replaces old independent variant years', () => {
    const state = recordSnapshot({
      ...initialState(),
      current: daily,
      year: 151,
      boons: { rewind: true },
      windowYears: Object.fromEntries(elves.map((c) => [c.id, 140])),
    });
    saveRun(state);
    const old = JSON.parse(localStorage.getItem('ner-m1-run')!);
    delete old.state.variantPools;
    delete old.state.past[0].variantPools;
    localStorage.setItem('ner-m1-run', JSON.stringify(old));
    const loaded = loadRun(pool)!;
    expect(loaded.rewindYear).toBe(151);
    expect(loaded.past[0]!.rewindYear).toBe(151);
    expect(loaded.variantPools).toEqual({});
    expect(loaded.past[0]!.variantPools).toEqual({});
    const drawn = nextDocument({ ...loaded, current: null }, pool, () => 0);
    const years = Object.values(drawn.windowYears).sort((a, b) => a - b);
    expect(years).toEqual([90, 105, 120]);
  });

  it.each([null, [], { elves: 0 }, { elves: 1.5 }, { elves: '1' }])(
    'rejects invalid saved pools %j',
    (variantPools) => {
      saveRun(initialState());
      const value = JSON.parse(localStorage.getItem('ner-m1-run')!);
      value.state.variantPools = variantPools;
      localStorage.setItem('ner-m1-run', JSON.stringify(value));
      expect(loadRun(pool)).toBeNull();
    },
  );
});

describe('variant validation', () => {
  it.each([
    null,
    [],
    {},
    { group: '', pool: 1 },
    { group: '  ', pool: 1 },
    { group: 1, pool: 1 },
    { group: 'elves', pool: 0 },
    { group: 'elves', pool: -1 },
    { group: 'elves', pool: 1.5 },
    { group: 'elves', pool: '1' },
  ])('rejects malformed variant %j', (variant) => {
    expect(validateCards([{ ...elves[0], variant }])).toContain(
      '[0] variant requires a nonempty group and positive integer pool on story/fixed/daily cards',
    );
  });
  it.each(['special', 'speaki'])('forbids variants on %s', (kind) => {
    expect(validateCards([{ ...elves[0], kind }])).toContain(
      '[0] variant requires a nonempty group and positive integer pool on story/fixed/daily cards',
    );
  });
  it('compares speaker sets regardless of card order or duplicates', () => {
    expect(validateCards(elves)).toEqual([]);
    expect(validateCards([...elves].reverse())).toEqual([]);
    expect(validateCards(elves.slice(1))).toContain(
      'variant group elves: every pool must have the same set of speakers',
    );
    expect(
      validateCards([...elves, { ...elves[0]!, id: 'duplicate-speaker' }]),
    ).toEqual([]);
  });
});

it('selects one apprentice elf and spirit across seeds and preserves old saves', () => {
  const spirits = cards.filter((c) => c.pool?.group === 'spirits');
  const deck = [daily, ...elves, ...spirits];
  const selectedElves = new Set<string>();
  const selectedSpirits = new Set<string>();
  for (let seed = 0; seed < 80; seed++) {
    const state = nextDocument(initialState('apprentice'), deck, mulberry32(seed));
    expect(state.elfCards).toHaveLength(1);
    expect(state.poolCards).toHaveLength(1);
    selectedElves.add(state.elfCards![0]!);
    selectedSpirits.add(state.poolCards![0]!);
    expect(elves.filter((c) => eligible(c, state)).map((c) => c.id)).toEqual(state.elfCards);
    expect(state.windowYears[state.elfCards![0]!]).toBeDefined();
    expect(state.windowYears[state.poolCards![0]!]).toBeDefined();
    const again = nextDocument({ ...state, current: null }, deck, mulberry32(seed + 100));
    expect(again.elfCards).toEqual(state.elfCards);
    expect(again.poolCards).toEqual(state.poolCards);
  }
  expect(selectedElves.size).toBeGreaterThan(3);
  expect(selectedSpirits.size).toBeGreaterThan(1);
  const old = nextDocument(initialState('priest'), deck, mulberry32(15));
  old.mode = 'apprentice';
  saveRun(old);
  const loaded = loadRun(deck)!;
  expect(loaded.poolCards).toHaveLength(2);
  expect(loaded.elfCards).toBeUndefined();
  const resumed = nextDocument({ ...loaded, current: null }, deck, mulberry32(99));
  expect(resumed.poolCards).toEqual(old.poolCards);
  expect(elves.filter((c) => eligible(c, resumed))).toHaveLength(3);
});

