import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { GROUP_GAP, NPC_GAP, PHASES } from '../src/core/config';
import { nextDocument } from '../src/core/deck';
import { initialState, type Card } from '../src/core/state';
import { mulberry32 } from '../tools/simulate';

const cards = raw as Card[];
describe('rebalance scheduling', () => {
  it('uses the requested tier weights at every boundary', () => {
    const weights = (year: number) => PHASES.find((p) => year < p.until)!.weights;
    expect([29,30,49,50,99,100,149,150].map(weights)).toEqual([
      {1:65,2:35,3:0}, {1:60,2:30,3:10}, {1:60,2:30,3:10},
      {1:25,2:47,3:28}, {1:25,2:47,3:28}, {1:18,2:47,3:35},
      {1:18,2:47,3:35}, {1:12,2:40,3:48},
    ]);
  });
  it('spaces selected elves and spirits and the practicum across seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = nextDocument(initialState(), cards, mulberry32(seed));
      for (const selected of [cards.filter((c) => c.variant?.group === 'elves' && c.variant.pool === state.variantPools.elves), cards.filter((c) => state.poolCards?.includes(c.id))]) {
        const years = selected.map((c) => state.windowYears[c.id]!).sort((a,b) => a-b);
        for (let i = 1; i < years.length; i++) expect(years[i]! - years[i-1]!).toBeGreaterThanOrEqual(GROUP_GAP);
      }
      const year = state.windowYears.special_fricle_pikora!;
      expect(year).toBeGreaterThanOrEqual(170); expect(year).toBeLessThanOrEqual(180);
      for (const card of cards.filter((c) => c.kind === 'fixed' && c.id !== 'special_fricle_pikora' && state.windowYears[c.id] !== undefined))
        expect(Math.abs(state.windowYears[card.id]! - year)).toBeGreaterThanOrEqual(NPC_GAP);
    }
  });
  it('never draws a Speaki with an axe lock', () => {
    const daily = cards.find((c) => c.kind === 'daily' && !c.conditions)!;
    const speaki = cards.find((c) => c.kind === 'speaki')!;
    const state = { ...initialState(), year: 50, statuses: [{ id:'lock', left:2, source:'test', axeLock:true as const }] };
    expect(nextDocument(state, [daily, { ...speaki, mimic: undefined, conditions: undefined }], () => 0).current?.kind).not.toBe('speaki');
  });
});

it('draws unrest from the phase assigned to the boss slot', () => {
  const relevant = cards.filter((c) => c.boss);
  const seen = cards.filter((c) => c.kind === 'story').map((c) => c.id);
  for (const done of [2, 3, 5, 6, 7, 8]) {
    const state = { ...initialState(), year: 200, boss: { done, drawn: [] }, seen };
    expect(nextDocument(state, relevant, () => 0).current?.bossPhase).toBe(done < 4 ? 'early' : 'late');
  }
});

it('requires enough unrest documents in each boss phase', async () => {
  const { validateCards } = await import('../tools/validate-cards');
  const short = cards.filter((c) => c.bossPhase !== 'late' || c.id === 'daily_guard_elf_spy');
  expect(validateCards(short)).toContain('boss phase late needs at least 4 cards');
});
