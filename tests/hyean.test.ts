import { expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, itemsLocked, type Card, type Result } from '../src/core/state';
import { eligible, nextDocument } from '../src/core/deck';
import { dismissScene, processDocument } from '../src/core/loop';
import { mulberry32 } from '../tools/simulate';
import { validateCards } from '../tools/validate-cards';
import { cardFeatures } from '../src/editor/features';

const cards = raw as Card[];
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  id: 'neutral',
  conditions: undefined,
  years: 1,
  reject: { label: 'reject', effects: {} },
  approve: { label: 'approve', effects: {} },
};
const visits = ['fixed_beast_kids_bread', 'fixed_beast_kids_bread_again'].map(
  (id) => cards.find((c) => c.id === id)!,
);

it.each(['daily', 'fixed', 'special', 'speaki', 'story'] as const)(
  'only spends hyean on revealing %s cards, including discards',
  (kind) => {
    const results: Result[] = [
      { label: 'x', effects: {} },
      { label: 'x', effects: { sugar: -5 } },
      {
        label: 'x',
        effects: {},
        mend: { mode: 'worst', count: 2, amount: 30 },
      },
      {
        label: 'x',
        effects: {},
        mend: { mode: 'center', count: 1, exclude: ['sugar'] },
      },
      { label: 'x', effects: {}, adjust: 5 },
    ];
    for (const [index, result] of results.entries()) {
      for (const side of ['approve', 'reject'] as const) {
        const current = { ...daily, kind, axe: true as const, [side]: result };
        for (const action of ['approve', 'reject', 'axe', 'bullet'] as const) {
          // a special document that hands out an item refuses the bullet outright
          if (action === 'bullet' && itemsLocked(current)) continue;
          for (const sleep of [0, 1]) {
            const before = {
              ...initialState(),
              current,
              sleep,
              boons: { hyean: { left: 5 }, bullet: 3 },
            };
            const after = processDocument(before, action, [daily], () => 0.5);
            expect(after.boons.hyean?.left).toBe(
              !sleep && kind !== 'story' && index > 0 ? 4 : 5,
            );
            expect(before.boons.hyean.left).toBe(5);
          }
        }
      }
    }
  },
);

it('draws each bread visit once in its window and delivers both replies three years after approval', () => {
  expect(cards.some((c) => c.id === 'special_beast_kids_bread')).toBe(false);
  expect(visits.map((c) => c.trigger)).toEqual([
    { from: 30, to: 80, order: 1 },
    { from: 100, to: 170, order: 1 },
  ]);
  const replies = visits.map((c) =>
    cards.find((t) => t.id === c.approve.schedule!.card)!,
  );
  const pool = [daily, ...visits, ...replies];
  expect(validateCards(pool)).toEqual([]);
  for (const seed of [2026, 17, 98]) {
    const rng = mulberry32(seed);
    let state = nextDocument(initialState(), pool, rng);
    const appearances: Record<string, number[]> = {};
    const due: Record<string, number> = {};
    for (
      let turn = 0;
      state.year < 200 && !state.ending && turn < 300;
      turn++
    ) {
      if (state.scene) {
        state = dismissScene(state);
        continue;
      }
      const card = state.current!;
      (appearances[card.id] ??= []).push(state.year);
      if (visits.includes(card)) {
        expect(state.year).toBe(state.windowYears[card.id]);
        expect(state.year).toBeGreaterThanOrEqual(card.trigger!.from!);
        expect(state.year).toBeLessThanOrEqual(card.trigger!.to!);
      }
      if (replies.includes(card)) expect(state.year).toBe(due[card.id]);
      const side =
        replies.includes(card) && card.reject.grant?.boon === 'hyean'
          ? 'reject'
          : 'approve';
      state = processDocument(
        state,
        side,
        [...pool, ...cards.filter((c) => c.boss)],
        rng,
      );
      if (visits.includes(card)) {
        const target = card.approve.schedule!.card;
        due[target] = state.year + 3;
        expect(state.scheduled[target]).toBe(due[target]);
      }
      if (replies.includes(card))
        expect(state.boons.hyean).toEqual({ left: 5 });
    }
    expect(state.ending).toBeNull();
    expect(state.boss?.done).toBe(0);
    expect(state.current?.boss).toBe('cleanup');
    for (const card of [...visits, ...replies])
      expect(appearances[card.id]).toHaveLength(1);
    // Overdue ordinary fixed windows must never interrupt the finale.
    expect(
      nextDocument(
        { ...initialState(), year: 200 },
        [...pool, ...cards.filter((c) => c.boss)],
        rng,
      ).current?.boss,
    ).toBe('cleanup');
  }
});

it('shows window and schedule editor features for both fixed bread visits', () => {
  for (const card of visits) {
    const features = cardFeatures(card, cards);
    expect(features.some((f) => f.kind === 'window')).toBe(true);
    expect(features.some((f) => f.kind === 'schedule')).toBe(true);
    expect(features.some((f) => f.kind === 'period')).toBe(false);
  }
});

it('uses intuition only after hyean expires and leaves it untouched for empty documents', () => {
  const revealing: Card = { ...daily, approve: { label: 'x', effects: { sugar: 5 } } };
  const both = { ...initialState(), current: revealing, boons: { hyean: { left: 1 }, intuition: { left: 2 } } };
  const first = processDocument(both, 'approve', [daily], () => 0.5);
  expect(first.boons.hyean).toBeUndefined();
  expect(first.boons.intuition).toEqual({ left: 2 });
  const next = processDocument({ ...first, current: revealing }, 'approve', [daily], () => 0.5);
  expect(next.boons.intuition).toEqual({ left: 1 });
  const empty = processDocument({ ...next, current: daily }, 'approve', [daily], () => 0.5);
  expect(empty.boons.intuition).toEqual({ left: 1 });
});


it('blocks intuition and hyean offers only while intuition is held', () => {
  const offers = [
    'special_strange_card',
    'fixed_sist_credit_due',
    'story_diana_thanks',
    'story_diana_thanks_again',
  ].map((id) => cards.find((c) => c.id === id)!);
  const state = initialState();
  for (const card of offers) {
    expect(eligible(card, state)).toBe(true);
    expect(eligible(card, { ...state, boons: { intuition: { left: 2 } } })).toBe(false);
  }
  expect(eligible(offers[0]!, { ...state, boons: { hyean: { left: 2 } } })).toBe(true);
});

it('delays a scheduled intuition offer until intuition expires', () => {
  const due = cards.find((c) => c.id === 'fixed_sist_credit_due')!;
  const state = {
    ...initialState(),
    year: 10,
    boons: { intuition: { left: 2 } },
    scheduled: { [due.id]: 10 },
  };
  const waiting = nextDocument(state, [daily, due], () => 0.5);
  expect(waiting.current?.id).toBe(daily.id);
  expect(waiting.scheduled[due.id]).toBe(10);
  expect(waiting.seen).not.toContain(due.id);
  const released = nextDocument({ ...waiting, current: null, boons: {} }, [daily, due], () => 0.5);
  expect(released.current?.id).toBe(due.id);
  expect(released.scheduled[due.id]).toBeUndefined();
});
