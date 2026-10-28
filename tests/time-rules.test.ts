// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card, type State } from '../src/core/state';
import { processDocument, rewind } from '../src/core/loop';
import { loadRun, saveRun } from '../src/save/storage';

const cards = raw as Card[];
const rng = () => 0.5;
const resolve = (state: State) => processDocument(state, 'approve', cards, rng);
const roundTrip = (state: State) => {
  saveRun(state);
  const loaded = loadRun(cards);
  expect(loaded).not.toBeNull();
  return loaded!;
};
beforeEach(() => localStorage.clear());

it.each(['special_sist_deal', 'special_sist_deal_late'])(
  'treats the immediate shop after %s as no time, including after saving and rewinding',
  (id) => {
    const deal = cards.find((card) => card.id === id)!;
    const shop = cards.find((card) => card.id === 'special_sist_shop')!;
    // Give the shop a gauge effect to exercise both boon consumption rules.
    const all = cards.map((card) => card.id === shop.id
      ? { ...card, approve: { ...card.approve, effects: { faith: 10 } } }
      : card);
    const before: State = {
      ...initialState(), year: 50, current: deal,
      gauges: { sugar: 60, people: 50, faith: 50, erpin: 50 },
      statuses: [
        { id: 'sugar_cut', source: deal.id, left: 3, tick: { sugar: -1 } },
        { id: 'pikora_drift', source: deal.id, left: 3, tick: { people: -1 } },
      ],
      boons: { hyean: { left: 5 }, rewind: true },
      drowse: { stack: 1, left: 3 },
    };
    const afterDeal = processDocument(before, 'approve', all, rng);
    expect(afterDeal.current?.id).toBe(shop.id);
    expect(afterDeal.year).toBe(50);
    expect(afterDeal.statuses.map((status) => status.left)).toEqual([3, 2]);
    expect(afterDeal.gauges.people).toBe(49);
    expect(afterDeal.boons.hyean?.left).toBe(4);
    expect(afterDeal.drowse).toEqual(before.drowse);
    const loaded = roundTrip(afterDeal);
    expect(loaded.past.at(-1)?.currentImmediate).toBe(true);
    const rewound = rewind({ ...loaded, ending: { id: 'faith_low' } }, all, rng);
    expect(rewound.currentImmediate).toBe(true);
    for (const state of [loaded, rewound]) {
      const afterShop = processDocument(state, 'approve', all, rng);
      expect(afterShop.statuses).toEqual(state.statuses);
      expect(afterShop.gauges.people).toBe(state.gauges.people);
      expect(afterShop.gauges.sugar).toBe(state.gauges.sugar);
      expect(afterShop.boons.hyean?.left).toBe(4);
      expect(afterShop.drowse).toEqual(state.drowse);
      expect(afterShop.currentImmediate).toBeUndefined();
    }
  },
);

it('recovers drowse on boss documents but not boss stories, including after saving', () => {
  const boss = cards.find((card) => card.bossAt === 5)!;
  const story = cards.find((card) => card.bossAfter === 2)!;
  let state: State = {
    ...initialState(), year: 200, bestYear: 200,
    boss: { done: 4, drawn: [] }, current: boss,
    drowse: { stack: 1, left: 3 },
    statuses: [{ id: 'pikora_drift', source: story.id, left: 4, tick: { people: -1 } }],
    seen: cards.filter((card) => card.kind === 'story' && card.trigger?.year === 200).map((card) => card.id),
  };
  state = resolve(roundTrip(state));
  expect(state.drowse).toEqual({ stack: 1, left: 2 });
  expect(state.statuses[0]?.left).toBe(3);
  state = { ...state, current: story };
  state = resolve(roundTrip(state));
  expect(state.drowse).toEqual({ stack: 1, left: 2 });
  expect(state.statuses[0]?.left).toBe(3);
  const ordinary = cards.find((card) => card.boss === 'unrest' && card.bossAt === undefined)!;
  state = resolve(roundTrip({ ...state, current: ordinary }));
  expect(state.drowse).toEqual({ stack: 1, left: 1 });
  expect(state.statuses[0]?.left).toBe(2);
});

it('migrates held cloaks into scope charges and drops active cloaks', () => {
  const state = { ...initialState(), current: cards.find(card => card.kind === 'daily')! };
  saveRun(state);
  const saved = JSON.parse(localStorage.getItem('ner-m1-run')!);
  saved.state.boons = { cloak: { held: 1, left: 6 }, scope: 2 };
  localStorage.setItem('ner-m1-run', JSON.stringify(saved));
  expect(loadRun(cards)?.boons).toEqual({ scope: 6 });
  saved.state.boons = { cloak: { held: 0, left: 6 } };
  localStorage.setItem('ner-m1-run', JSON.stringify(saved));
  expect(loadRun(cards)?.boons).toEqual({});
});
