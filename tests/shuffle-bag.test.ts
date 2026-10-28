import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextDocument, rerollDaily } from '../src/core/deck';
import { rewind } from '../src/core/loop';
import { initialState, recordSnapshot, type Card } from '../src/core/state';
import { loadRun, saveRun } from '../src/save/storage';
import { mulberry32 } from '../tools/simulate';

const daily = (id: string, tier: 1 | 2 | 3 = 1): Card => ({
  id,
  tier,
  kind: 'daily',
  years: 1,
  axe: true,
  speaker: 'x',
  faction: 'x',
  title: 'x',
  text: 'x',
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
});

afterEach(() => vi.unstubAllGlobals());

describe('daily shuffle bag', () => {
  it('draws every eligible card before repeating within a tier', () => {
    const cards = Array.from({ length: 16 }, (_, i) => daily(`daily-${i}`));
    const rng = mulberry32(12345);
    let state = initialState();
    for (let cycle = 0; cycle < 3; cycle++) {
      const shown = new Set<string>();
      for (let i = 0; i < cards.length; i++) {
        state = nextDocument({ ...state, current: null }, cards, rng);
        expect(shown.has(state.current!.id)).toBe(false);
        shown.add(state.current!.id);
      }
      expect(shown.size).toBe(cards.length);
      expect(new Set(state.drawn).size).toBe(state.drawn.length);
    }
  });

  it('keeps phase tier selection independent of undrawn availability and refills only that tier', () => {
    const cards = [
      daily('one'),
      daily('two', 2),
      daily('three', 3),
      daily('locked', 3),
    ];
    cards[3]!.conditions = { minYear: 100 };
    const before = { ...initialState(), year: 30, drawn: cards.map((c) => c.id) };
    const after = nextDocument(before, cards, () => 0.99);
    expect(after.current?.id).toBe('three');
    expect(after.drawn).toEqual(['one', 'two', 'three']);
    expect(before.drawn).toEqual(['one', 'two', 'three', 'locked']);
  });

  it('still excludes recent cards when refilling', () => {
    const cards = [daily('a'), daily('b'), daily('c')];
    const after = nextDocument(
      {
        ...initialState(),
        drawn: ['a', 'b', 'c'],
        recent: ['c'],
      },
      cards,
      () => 0.99,
    );
    expect(after.current?.id).not.toBe('c');
    expect(after.drawn).toEqual([after.current!.id]);
  });

  it.each(['speaki', 'special', 'story', 'fixed'] as const)(
    '%s does not change the bag',
    (kind) => {
      const other: Card = {
        ...daily('other'),
        kind,
        ...(kind === 'speaki' ? { mimic: 'target' } : {}),
        ...(['story', 'fixed'].includes(kind)
          ? { trigger: { year: 0, order: 0 } }
          : {}),
      };
      const drawn = ['target'];
      const state = nextDocument(
        { ...initialState(), drawn },
        [daily('target'), other],
        () => 0,
      );
      expect(state.current?.kind).toBe(kind);
      expect(state.drawn).toEqual(drawn);
    },
  );

  it('keeps the Alice original and adds its replacement, even when refilling', () => {
    const cards = [daily('a'), daily('b')];
    const original = nextDocument(initialState(), cards, () => 0.5);
    const replacement = rerollDaily(
      {
        ...original,
        drawn: ['a', 'b'],
        boons: { alice: true },
      },
      cards,
      () => 0.5,
    );
    expect(replacement.current?.id).not.toBe(original.current?.id);
    expect(replacement.drawn).toEqual(expect.arrayContaining(['a', 'b']));
    expect(replacement.drawn).toHaveLength(2);
  });

  it.each([undefined, ['a', 'removed-card']])(
    'normalizes legacy and stale bag ids in saves and snapshots: %s',
    (drawn) => {
      let saved = '';
      vi.stubGlobal('localStorage', {
        getItem: () => saved,
        setItem: (_key: string, value: string) => {
          saved = value;
        },
        removeItem: vi.fn(),
      });
      const state = recordSnapshot({
        ...initialState(),
        current: daily('a'),
        boons: { rewind: true },
      });
      saveRun(state);
      const value = JSON.parse(saved);
      for (const entry of [value.state, ...value.state.past]) {
        if (drawn === undefined) delete entry.drawn;
        else entry.drawn = drawn;
      }
      saved = JSON.stringify(value);
      const loaded = loadRun([daily('a')]);
      expect(loaded).not.toBeNull();
      expect(loaded!.drawn).toEqual(drawn ? ['a'] : []);
      expect(loaded!.past[0]!.drawn).toEqual(drawn ? ['a'] : []);
    },
  );

  it('rewinds the bag to the recorded presentation', () => {
    const snapshot = recordSnapshot({
      ...initialState(),
      year: 150,
      current: daily('a'),
      drawn: ['a'],
      boons: { rewind: true },
    });
    const restored = rewind(
      {
        ...snapshot,
        year: 156,
        drawn: ['a', 'b'],
        ending: { id: 'sugar_low' },
      },
      [],
      () => {
        throw Error('must restore without drawing');
      },
    );
    expect(restored.drawn).toEqual(['a']);
    expect(snapshot.past[0]!.drawn).toEqual(['a']);
    restored.drawn.push('c');
    expect(snapshot.past[0]!.drawn).toEqual(['a']);
  });
});
