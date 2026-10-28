import { describe, expect, it } from 'vitest';
import { initialState, type Card, type State } from '../src/core/state';
import { processDocument, rewind } from '../src/core/loop';
import { rerollDaily } from '../src/core/deck';

const card: Card = {
  id: 'daily',
  kind: 'daily',
  speaker: 'x',
  faction: 'x',
  title: 'x',
  text: 'x',
  years: 1,
  axe: true,
  tier: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
const cards = [card, { ...card, id: 'other' }];
const step = (state: State) =>
  processDocument(state, 'approve', cards, () => 0.5);
const die = (state: State, year: number): State => ({
  ...state,
  year,
  ending: { id: 'sugar_low' },
  current: null,
  gauges: { ...state.gauges, sugar: 0 },
  boons: { rewind: true },
  stitched: true,
  scene: 'stitch',
});

describe('rewind snapshots', () => {
  it.each(['apprentice', 'priest'] as const)(
    'rewinds five years in %s and keeps its run record',
    (mode) => {
      let state: State = {
        ...initialState(mode),
        current: card,
        year: 179,
        boons: { rewind: true },
      };
      while (state.year < 186) state = step(state);
      const target = state.past.find((snapshot) => snapshot.year === 181)!;
      expect(state.past.some((snapshot) => snapshot.year === 182)).toBe(true);
      const death = step({
        ...state,
        current: {
          ...card,
          years: 3,
          approve: { label: 'x', effects: { sugar: -100 } },
        },
      });
      expect(death.ending?.id).toBe('sugar_low');
      expect(death.year).toBe(186);
      expect(death.bestYear).toBe(186);
      const restored = rewind(death, cards, () => 0.5);
      expect(restored.year).toBe(181);
      expect(restored.current).toEqual(target.current);
      expect(restored.bestYear).toBe(186);
      expect(restored.mode).toBe(mode);
    },
  );

  it('restores the entire presented state at least five years earlier and spent boons', () => {
    let state: State = {
      ...initialState(),
      current: card,
      year: 150,
      gauges: { sugar: 35, people: 65, faith: 45, erpin: 55 },
      poolCards: ['spirit'],
      rewindYear: 145,
      flags: ['old'],
      flagYears: { old: 140 },
      relations: { npc: 2 },
      scheduled: { later: 160 },
      seen: ['old'],
      npcYears: { npc: 140 },
      appearanceYears: { special: [145] },
      windowYears: { window: 170 },
      boons: { rewind: true, stitch: true, alice: true, hyean: { left: 4 }, intuition: { left: 2 } },
      drowse: { stack: 1, left: 8 },
      sleep: 2,
      erpinSaved: true,
    };
    state = step(state);
    const target = state.past[0]!;
    expect(target.year).toBe(151);
    expect(target).not.toHaveProperty('past');
    const death = die({ ...state, flags: ['new'], bestYear: 180 }, 157);
    const restored = rewind(death, [], () => {
      throw Error('must not draw');
    });
    expect(restored).toEqual({
      ...target,
      record: { ...death.record, helped: true },
      boons: { ...target.boons, rewind: undefined },
      bestYear: 180,
      past: [],
      ending: null,
      scene: null,
      stitched: false,
    });
    expect(restored.boons).not.toHaveProperty('rewind');
    expect(restored.boons.stitch).toBe(true);
    expect(restored.boons.intuition).toEqual({ left: 2 });
    expect(restored.current).toEqual(target.current);
    expect(restored.gauges).toEqual(target.gauges);
  });

  it('restores stitch after it was spent between the snapshot and death', () => {
    const first = step({
      ...initialState(),
      current: card,
      year: 150,
      boons: { rewind: true, stitch: true },
    });
    const fatal = {
      ...card,
      approve: { label: 'x', effects: { sugar: -100 } },
    };
    const stitched = step({ ...first, current: fatal });
    expect(stitched.stitched).toBe(true);
    expect(stitched.boons.stitch).toBeUndefined();
    const dead = step({ ...stitched, scene: null, current: fatal });
    expect(dead.ending).not.toBeNull();
    expect(rewind(dead, cards, () => 0.5).boons.stitch).toBe(true);
  });

  it('uses the earliest snapshot when the boon was acquired less than five years ago', () => {
    const grant = {
      ...card,
      approve: { ...card.approve, grant: { boon: 'rewind' as const } },
    };
    const first = processDocument(
      { ...initialState(), current: grant, year: 150 },
      'approve',
      cards,
      () => 0.5,
    );
    const later = step(first);
    expect(rewind(die(later, 153), cards, () => 0.5).year).toBe(151);
  });

  it('keeps only the latest anchor and recent snapshots, and clears history without the boon', () => {
    let state: State = {
      ...initialState(),
      current: card,
      year: 150,
      boons: { rewind: true },
    };
    for (let i = 0; i < 35; i++) {
      state = step(state);
      expect(state.past.length).toBeLessThanOrEqual(6);
    }
    expect(state.past.map((entry) => entry.year)).toEqual([
      180, 181, 182, 183, 184, 185,
    ]);
    expect(rewind(die(state, 186), cards, () => 0.5).year).toBe(181);
    expect(step({ ...state, boons: {} }).past).toEqual([]);
  });

  it('records Alice replacement documents even when called directly, with transients cleared', () => {
    const state: State = {
      ...initialState(),
      current: card,
      year: 151,
      boons: { rewind: true, alice: true },
      stitched: true,
    };
    const after = rerollDaily(state, cards, () => 0.5);
    expect(after.past).toHaveLength(1);
    expect(after.past[0]).toMatchObject({
      current: cards[1],
      scene: null,
      stitched: false,
    });
    expect(after.past[0]!.boons.alice).toBeUndefined();
    expect(initialState().past).toEqual([]);
  });
});
