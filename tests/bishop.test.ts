import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import {
  advanceBishop,
  arrowCount, bishopTotals, bishopSources, bishopSpecials, bishopEra,
  answerCard,
  bishopConfig as config,
  bishopCurve,
  bishopDeck,
  bishopEffectMultiplier,
  bishopWeight,
  deckForMode,
} from '../src/core/bishop';
import { eligible, nextDocument } from '../src/core/deck';
import { directorWeight } from '../src/core/director';
import {
  canRewind,
  choiceEffects,
  dismissScene,
  processDocument,
  rewind,
} from '../src/core/loop';
import {
  earnedExtraEndings,
  initialState,
  type Card,
  type State,
} from '../src/core/state';
import { mulberry32, parseArgs, simulateBishop } from '../tools/simulate';

const cards = raw as Card[];
const deck = bishopDeck(cards);
const daily: Card = {
  id: 'test',
  kind: 'daily',
  tier: 1,
  speaker: 'church',
  faction: 'church',
  title: 'Test',
  text: 'Test',
  years: 1,
  axe: true,
  reject: { label: 'L', effects: {} },
  approve: { label: 'R', effects: {} },
};
const bishop = () => initialState('bishop', () => 0);
const rolls =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0.5;
const effects = (
  state: State,
  card: Card,
  side: 'reject' | 'approve' = 'reject',
) =>
  choiceEffects(
    card[side],
    state.gauges,
    card.kind,
    state.year,
    state.statuses,
    state,
    card,
  );

describe('bishop deck', () => {
  it('derives an immutable endless deck with every elf and spirit, follow-ups and recurring specials', () => {
    const before = structuredClone(cards);
    expect(deck.some((c) => c.kind === 'story')).toBe(false);
    expect(
      deck
        .filter((c) => c.kind === 'fixed')
        .every((c) => c.trigger?.scheduled || c.trigger?.onCondition),
    ).toBe(true);
    for (const c of cards.filter(
      (c) =>
        c.kind === 'fixed' && (c.trigger?.scheduled || c.trigger?.onCondition),
    ))
      expect(deck.some((d) => d.id === c.id)).toBe(true);
    expect(
      deck.every(
        (c) =>
          c.conditions?.minYear === undefined &&
          c.conditions?.maxYear === undefined,
      ),
    ).toBe(true);
    expect(
      deck.filter((c) => c.kind === 'daily').every((c) => !c.variant),
    ).toBe(true);
    for (const c of cards.filter(
      (c) => c.kind === 'daily' && (c.conditions?.minYear ?? 0) >= 186,
    ))
      expect(deck.some((d) => d.id === c.id)).toBe(false);
    for (const id of config.crisis.cards)
      expect(deck.find((c) => c.id === id)).toMatchObject({
        kind: 'special',
        weight: 3,
        repeatable: true,
        period: 75,
        axe: 'bullet',
      });
    for (const id of config.relics.cards)
      expect(deck.find((c) => c.id === id)).toMatchObject({
        kind: 'special',
        weight: 0.3,
        repeatable: false,
      });
    expect(
      deck
        .filter((c) =>
          [...config.crisis.cards, ...config.relics.cards].includes(c.id),
        )
        .every((c) => !c.variant && !c.trigger),
    ).toBe(true);
    expect(cards).toEqual(before);
    expect(bishop().flags).toEqual(config.startFlags);
  });
  it.each(['apprentice', 'priest', 'bishop'] as const)(
    'honors modes on every kind in %s',
    (mode) => {
      for (const kind of [
        'daily',
        'special',
        'speaki',
        'story',
        'fixed',
      ] as const) {
        const c = {
          ...daily,
          kind,
          modes: ['bishop'] as const,
        } as unknown as Card;
        expect(
          eligible(
            c,
            initialState(mode, () => 0),
          ),
        ).toBe(mode === 'bishop');
      }
      expect(
        deckForMode(cards, mode).some((c) => c.id === 'fixed_chloe_tailor'),
      ).toBe(mode !== 'bishop');
    },
  );
});

describe('bishop effects and weights', () => {
  it('uses stepped era and tension curves and leaves story scaling unchanged', () => {
    expect(bishopCurve(12.5, config.scale)).toBeCloseTo(1);
    expect(bishopCurve(10000, config.scale)).toBeCloseTo(1.75);
    expect(bishopCurve(12.5, config.tension)).toBeCloseTo(24);
    expect(bishopCurve(10000, config.tension)).toBe(60);
  });
  it('multiplies signs separately, caps products, rounds to five and preserves zero', () => {
    const state = bishop();
    state.bishop!.omens = Array.from({ length: 20 }, () => ({ id: 'ants' }));
    state.bishop!.blessings = ['sweet', 'bestie', 'calmfaith'];
    state.bishop!.flow = { id: 'harvest', until: 15 };
    expect(bishopEffectMultiplier(state, 'sugar', true)).toBeCloseTo(1.56);
    // the capped product, then the reign-long candy baseline outside the cap
    expect(bishopEffectMultiplier(state, 'sugar', false)).toBeCloseTo(
      1.6 * 0.7,
    );
    expect(bishopEffectMultiplier(state, 'erpin', true)).toBe(0.7);
    const c = {
      ...daily,
      reject: { label: 'x', effects: { sugar: 10, people: -5, erpin: 0 } },
    };
    expect(effects(state, c)).toEqual({ sugar: 15, people: -5, erpin: 0 });
    expect(effects(state, { ...c, kind: 'story' })).toEqual(c.reject.effects);
    expect(
      effects(state, { ...c, id: config.crisis.cards[0]!, kind: 'special' })
        .sugar,
    ).toBe(15);
    state.year = 1000;
    expect(effects(state, c).sugar).toBe(25);
    expect(
      effects(state, { ...c, id: config.crisis.cards[0]!, kind: 'special' })
        .sugar,
    ).toBe(15);
  });
  it('keeps the candy baseline outside the cap so thrift still counts', () => {
    const state = bishop();
    expect(bishopEffectMultiplier(state, 'sugar', false)).toBeCloseTo(0.7);
    expect(bishopEffectMultiplier(state, 'sugar', true)).toBe(1);
    state.bishop!.blessings = ['thrift'];
    expect(bishopEffectMultiplier(state, 'sugar', false)).toBeCloseTo(
      0.8 * 0.7,
    );
  });
  it('does not scale mend or status ticks', () => {
    const state = bishop();
    state.year = 1000;
    state.gauges.people = 30;
    state.gauges.faith = 25;
    state.bishop!.blessings = ['sweet'];
    const c: Card = {
      ...daily,
      kind: 'fixed',
      reject: {
        label: 'x',
        effects: { sugar: 10 },
        mend: { mode: 'worst', count: 1, amount: 15 },
      },
    };
    expect(effects(state, c)).toEqual({ sugar: 15, faith: 15 });
    state.statuses = [
      { id: 'test', source: daily.id, left: 2, tick: { sugar: 1 } },
    ];
    const next = processDocument(
      { ...state, current: daily },
      'reject',
      [daily],
      () => 0.5,
    );
    expect(next.gauges.sugar).toBe(51);
  });
  it('matches the applied result and director prediction without mutating state', () => {
    const state = bishop();
    state.bishop!.flow = { id: 'rebel', until: 30 };
    const c = {
      ...daily,
      reject: { label: 'x', effects: { erpin: 20 } },
      approve: { label: 'x', effects: { erpin: -10 } },
    };
    const expected = effects(state, c);
    const next = processDocument(
      { ...state, current: c },
      'reject',
      [daily],
      () => 0.5,
    );
    expect(next.gauges.erpin).toBe(50 + expected.erpin!);
    expect(state.gauges.erpin).toBe(50);
    expect(directorWeight(c, state)).not.toBe(
      directorWeight(c, initialState()),
    );
  });
  it('applies speaker weights to daily and special draws, tier weights and Speaki probability', () => {
    const state = bishop();
    state.bishop!.flow = { id: 'bread', until: 15 };
    expect(bishopWeight(state, 'speakers', 'ashur')).toBe(2);
    const a = { ...daily, id: 'a', speaker: 'ashur' };
    const b = { ...daily, id: 'b', speaker: 'church' };
    expect(nextDocument(state, [a, b], rolls(0.9, 0, 0.6)).current!.id).toBe(
      'a',
    );
    expect(
      nextDocument(
        state,
        [
          { ...a, kind: 'special' },
          { ...b, kind: 'special' },
        ],
        rolls(0, 0.6),
      ).current!.id,
    ).toBe('a');
    state.bishop!.flow = { id: 'quiet', until: 15 };
    state.bishop!.blessings = ['careful'];
    expect(bishopWeight(state, 'tiers', '1')).toBe(2.5);
    expect(bishopWeight(state, 'tiers', '3')).toBe(1.2);
    expect(
      nextDocument(
        state,
        [daily, { ...b, tier: 2 }, { ...a, tier: 3 }],
        rolls(0.9, 0.5, 0),
      ).current!.tier,
    ).toBe(1);
    state.bishop!.flow = { id: 'speaki', until: 15 };
    expect(bishopWeight(state, 'speakiChance')).toBe(3);
    expect(
      nextDocument(state, [daily, { ...a, kind: 'speaki' }], rolls(0.2, 0))
        .current!.kind,
    ).toBe('speaki');
    expect(
      nextDocument(
        initialState(),
        [daily, { ...a, kind: 'speaki' }],
        rolls(0.2, 0.9, 0, 0),
      ).current!.kind,
    ).toBe('daily');
  });
});

describe('bishop reign', () => {
  it('adds scheduled omens and careful uses across segments', () => {
    const state = bishop();
    state.bishop!.blessings = ['careful'];
    const next = advanceBishop({ ...state, year: 76 }, 24, () => 0);
    expect(next.bishop!.omens.map((o) => o.id)).toEqual(['ants', 'rumors']);
    expect(next.bishop!.notices.filter((n) => n.kind === 'omen')).toHaveLength(2);
    expect(next.bishop!.pendingAnswers).toBe(1);
    expect(next.boons.hyean?.left).toBe(9);
    expect(state.bishop!.omens).toHaveLength(0);
  });
  it('starts and ends flows at their boundaries with inclusive random gaps and no consecutive repeat', () => {
    const state = bishop();
    expect(state.bishop!.nextFlowAt).toBe(5);
    expect(initialState('bishop', () => 0.999).bishop!.nextFlowAt).toBe(15);
    expect(
      advanceBishop({ ...state, year: 4 }, 0, () => 0).bishop!.flow,
    ).toBeNull();
    const start = advanceBishop({ ...state, year: 5 }, 4, () => 0);
    expect(start.bishop!.flow).toEqual({ id: 'harvest', until: 20 });
    const end = advanceBishop({ ...start, year: 20 }, 5, () => 0.999);
    expect(end.bishop!.flow).toBeNull();
    expect(end.bishop!.nextFlowAt).toBe(35);
    expect(start.bishop!.flowNew).toBe(true);
    expect(end.bishop!.flowNew).toBe(false);
    expect(end.bishop!.notices.every((n) => n.kind === 'omen')).toBe(true);
    const again = advanceBishop({ ...end, year: 35 }, 20, () => 0);
    expect(again.bishop!.flow?.id).not.toBe('harvest');
  });
  it('offers two distinct unheld blessings every 50 years, grants either stamp without time or effects', () => {
    let state = advanceBishop({ ...bishop(), year: 100 }, 0, () => 0);
    expect(state.bishop!.pendingAnswers).toBe(2);
    state = nextDocument(state, [daily], () => 0);
    const ids = state.current!.blessings!;
    expect(new Set(ids).size).toBe(2);
    const left = processDocument(state, 'reject', [daily], () => 0);
    const right = processDocument(state, 'approve', [daily], () => 0);
    expect(left.bishop!.blessings).toEqual([ids[0]]);
    expect(right.bishop!.blessings).toEqual([ids[1]]);
    expect(left.year).toBe(100);
    expect(left.gauges).toEqual(state.gauges);
    expect(left.current!.blessings).not.toContain(ids[0]);
    expect(processDocument(state, 'axe', [daily], () => 0)).toBe(state);
    const last = bishop();
    last.bishop!.blessings = config.blessings.slice(1).map((b) => b.id);
    last.bishop!.pendingAnswers = 1;
    const offered = nextDocument(last, [daily], () => 0);
    expect(offered.current!.blessings).toEqual(['sweet']);
    const granted = processDocument(offered, 'approve', [daily], () => 0);
    expect(granted.bishop!.blessings).toHaveLength(config.blessings.length);
    expect(granted.current!.blessings).toBeUndefined();
  });
  it.each(['low', 'high'] as const)(
    'saves a %s collapse once before rewind is offered',
    (dir) => {
      const state = bishop();
      state.bishop!.embrace = 'held';
      state.boons.rewind = true;
      const fatal = {
        ...daily,
        reject: { label: 'x', effects: { sugar: dir === 'low' ? -100 : 100 } },
      };
      const saved = processDocument(
        { ...state, current: fatal },
        'reject',
        [fatal],
        () => 0.5,
      );
      expect(saved.ending).toBeNull();
      expect(saved.bishop!.embrace).toBe('used');
      expect(saved.gauges.sugar).toBe(dir === 'low' ? 20 : 80);
      expect(saved.bishop!.notices).toContainEqual({ kind: 'embrace' });
      expect(canRewind(saved)).toBe(false);
      const dead = processDocument(saved, 'reject', [fatal], () => 0.5);
      expect(dead.ending?.cause).toBe(`sugar_${dir}`);
      expect(canRewind(dead)).toBe(true);
    },
  );
  it('enforces crisis safe bands and periods, and relic gaps and once per run', () => {
    const crisis = deck.find((c) => c.id === config.crisis.cards[0])!;
    const state = bishop();
    for (const value of [0, 19, 20, 80, 81, 100])
      expect(
        eligible(crisis, {
          ...state,
          gauges: { ...state.gauges, faith: value },
        }),
      ).toBe(value >= 20 && value <= 80);
    expect(
      eligible(crisis, {
        ...state,
        year: 74,
        appearanceYears: { [crisis.id]: [0] },
      }),
    ).toBe(false);
    expect(
      eligible(crisis, {
        ...state,
        year: 75,
        appearanceYears: { [crisis.id]: [0] },
      }),
    ).toBe(true);
    const relic = deck.find((c) => c.id === config.relics.cards[0])!;
    let selected = nextDocument(state, [daily, relic], () => 0);
    expect(selected.current!.id).toBe(relic.id);
    expect(selected.bishop!.lastRelicYear).toBe(0);
    expect(eligible(relic, { ...selected, year: 59 })).toBe(false);
    expect(eligible(relic, { ...selected, year: 60 })).toBe(true);
    selected = nextDocument(
      { ...selected, year: 100, current: null },
      [daily, relic],
      () => 0,
    );
    expect(selected.current!.id).toBe(daily.id);
  });
  it('continues beyond 200, keeps sleep scenes, has no extra endings and rewinds down to zero', () => {
    const state = { ...bishop(), year: 199, current: daily };
    const next = processDocument(state, 'reject', [daily], () => 0.5);
    expect(next.year).toBe(200);
    expect(next.ending).toBeNull();
    expect(
      nextDocument({ ...next, year: 1001, current: null }, [daily], () => 0.5)
        .ending,
    ).toBeNull();
    expect(dismissScene({ ...next, asleepPending: true, sleep: 3 }).scene).toBe(
      'asleep',
    );
    expect(
      earnedExtraEndings({ ...next, ending: { id: 'sugar_low' } }),
    ).toEqual([]);
    for (const year of [3, 400]) {
      const dead = {
        ...bishop(),
        year,
        boons: { rewind: true as const },
        ending: { id: 'sugar_low' },
      };
      expect(canRewind(dead)).toBe(true);
      expect(rewind(dead, [daily], () => 0.5).year).toBe(Math.max(0, year - 5));
    }
  });
  it('runs the endless simulator deterministically with all requested metrics', () => {
    const first = simulateBishop('careful', 3, 2026);
    expect(simulateBishop('careful', 3, 2026)).toEqual(first);
    expect(first.years.max).toBeLessThanOrEqual(1000);
    expect(Object.keys(first.years)).toEqual([
      'p10',
      'p25',
      'median',
      'p75',
      'p90',
      'max',
    ]);
    expect(
      Object.values(first.endingPct).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(100);
    expect(
      parseArgs(['--mode', 'bishop', '--seed', '2026', '--n', '3']),
    ).toMatchObject({ mode: 'bishop', seed: 2026, n: 3 });
    expect(first.relicsPerRun).toBeGreaterThanOrEqual(0);
    expect(first.blessingsPerRun).toBeGreaterThanOrEqual(0);
    expect(first.embraceSavesPerRun).toBeGreaterThanOrEqual(0);
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  }, 30000);
});
it('does not restore an already used embrace when rewinding before its rescue', () => {
  const state = bishop();
  state.boons.rewind = true;
  state.bishop!.embrace = 'held';
  state.current = daily;
  const { past: _, ...snapshot } = structuredClone(state);
  const dead = {
    ...state,
    year: 8,
    past: [snapshot],
    ending: { id: 'sugar_low' },
    bishop: { ...state.bishop!, embrace: 'used' as const },
  };
  expect(rewind(dead, [daily], () => 0.5).bishop!.embrace).toBe('used');
});

it('uses step boundaries and chevron boundaries', () => {
  for (const [year, value] of [[0,1], [49,1], [50,1.1], [249,1.6], [250,1.75], [999,1.75]]) expect(bishopEra(year!)).toBe(value);
  for (const [year, value] of [[0,24], [49,24], [50,30], [249,55], [250,60], [999,60]]) expect(bishopCurve(year!, config.tension)).toBe(value);
  for (const [value, count] of [[1.05,1], [1.15,2], [1.35,3], [0.95,1], [0.85,2], [0.75,3]]) expect(arrowCount(value!)).toBe(count);
});
it('alternates events, clears the gift window, and cycles omens without repeats', () => {
  let state = bishop();
  const kinds: string[] = [], years: number[] = [];
  while (state.bishop!.omens.length < 8) {
    const event = state.bishop!.nextEvent;
    kinds.push(event.kind); years.push(event.at);
    state = advanceBishop({ ...state, year: event.at }, state.year, () => 0);
  }
  expect(kinds.every((kind, i) => kind === (i % 2 ? 'blessing' : 'omen'))).toBe(true);
  expect(years.every((year) => year < 95 || year > 105)).toBe(true);
  expect(years.slice(1).every((year, i) => year - years[i]! >= 20 && year - years[i]! <= 30)).toBe(true);
  const ids = state.bishop!.omens.map((o) => o.id);
  expect(new Set(ids.slice(0,4)).size).toBe(4);
  expect(ids.slice(1).every((id, i) => id !== ids[i])).toBe(true);
  expect(state.bishop!.notices.filter((n) => n.kind === 'embraceGift')).toHaveLength(1);
});
it('totals cap modifiers, include status factors and transform every omen after rescue', () => {
  const state = bishop();
  state.bishop!.omens = Array.from({ length: 8 }, () => ({ id: 'ants' }));
  state.statuses = [{ id: 'sugar_cut', left: 2, source: 'test', scale: { gauge: 'sugar', factor: 0.5 } }];
  expect(bishopTotals(state).sugar.gain).toBe(0.5);
  expect(bishopTotals(state).sugar.loss).toBeCloseTo(0.8);
  state.bishop!.omens = [{ id: 'ants' }];
  state.bishop!.embrace = 'used';
  expect(bishopTotals(state).sugar.loss).toBeCloseTo(0.6);
  expect(bishopSources(state)[0]!.factors.sugar?.loss).toBe(1.2);
  expect(bishopSpecials(state)).toContainEqual({ id: 'omenUp' });
});
it('never selects an early tier-three daily across seeds', () => {
  for (let seed = 0; seed < 200; seed++) {
    const state = nextDocument(bishop(), deck, mulberry32(seed));
    if (state.current?.kind === 'daily') expect(state.current.tier).not.toBe(3);
  }
});
