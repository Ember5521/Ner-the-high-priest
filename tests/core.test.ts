import { describe, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import system from '../data/system.json';
import {
  APPRENTICE_PHASES,
  AXE_DECAY_BY_STACK,
  PHASES,
  SLEEP_TURNS,
  SPECIAL_CHANCE,
} from '../src/core/config';
import {
  initialState,
  boundary,
  type Card,
  type State,
} from '../src/core/state';
import { nextDocument } from '../src/core/deck';
import {
  canRewind,
  choiceEffects,
  dismissScene,
  processDocument,
} from '../src/core/loop';
import { validateCards } from '../tools/validate-cards';

const cards = raw as Card[];
const story = cards.find((card) => card.kind === 'story')!;
const fixed = cards.find((card) => card.kind === 'fixed')!;
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily' && c.axe === true)!,
  id: 'test',
  kind: 'daily',
  conditions: undefined,
  years: 2,
  reject: {
    label: '거절',
    effects: { sugar: -10 },
    setFlags: ['done'],
    relations: { fairy: 1 },
  },
  approve: { label: '승인', effects: { sugar: 10 } },
};
const run = (state: State, action: 'reject' | 'approve' | 'axe') =>
  processDocument(state, action, cards, () => 0);
describe('document processing', () => {
  it.each([0, 1])(
    'keeps the fatal document year and bestYear while sleep=%s',
    (sleep) => {
      const fatal = {
        ...daily,
        years: 3,
        approve: { label: 'x', effects: { sugar: -100 } },
      };
      const after = processDocument(
        {
          ...initialState(),
          current: fatal,
          year: 197,
          bestYear: 197,
          sleep,
          erpinSaved: true,
        },
        'approve',
        [fatal],
        () => 0.5,
      );
      expect(after.ending?.id).toBe(sleep ? 'sleep' : 'sugar_low');
      expect(after.year).toBe(197);
      expect(after.bestYear).toBe(197);
    },
  );

  it.each(['reject', 'approve'] as const)(
    'keeps story %s gauges unchanged and applies choice flags',
    (action) => {
      const card = story;
      const after = run({ ...initialState(), current: card }, action);
      expect(after.gauges).toEqual(initialState().gauges);
      expect(after.flags).toEqual(card[action].setFlags ?? []);
    },
  );
  it('applies effects, years, flags and accumulated relations without mutating input', () => {
    const before = {
      ...initialState(),
      current: daily,
      relations: { fairy: 2 },
    };
    const after = run(before, 'reject');
    expect(after.gauges.sugar).toBe(40);
    expect(after.year).toBe(1);
    expect(after.flags).toEqual(['done']);
    expect(after.relations.fairy).toBe(3);
    expect(before.gauges.sugar).toBe(50);
    expect(before.flags).toEqual([]);
  });
  it.each(['sugar', 'people', 'faith', 'erpin'] as const)(
    'detects both exact boundaries for %s',
    (key) => {
      expect(boundary({ ...initialState().gauges, [key]: 0 })).toBe(
        `${key}_low`,
      );
      expect(boundary({ ...initialState().gauges, [key]: 100 })).toBe(
        `${key}_high`,
      );
      expect(boundary({ ...initialState().gauges, [key]: 1 })).toBeUndefined();
    },
  );
  it('clamps overshoots and selects gauge ending', () => {
    const s = {
      ...initialState(),
      current: daily,
      gauges: { ...initialState().gauges, sugar: 5 },
    };
    expect(run(s, 'reject').ending).toEqual({
      id: 'sugar_low',
      cause: 'sugar_low',
    });
    expect(run(s, 'reject').gauges.sugar).toBe(0);
  });
  it('starts the boss at 200, with gauge failure taking priority', () => {
    expect(
      processDocument(
        { ...initialState(), current: daily, year: 198 },
        'approve',
        cards,
        () => 0,
      ).current?.id,
    ).toBe('story_avalanche');
    expect(
      run(
        {
          ...initialState(),
          current: daily,
          year: 198,
          gauges: { ...initialState().gauges, sugar: 95 },
        },
        'approve',
      ).ending?.id,
    ).toBe('sugar_high');
  });
});
describe('deck', () => {
  it('sorts story/fixed by trigger year/order, and draws each only once', () => {
    const mandatory: Card[] = [
      {
        ...daily,
        id: 'late-story',
        kind: 'story',
        trigger: { year: 5, order: 1 },
      },
      { ...daily, id: 'fixed', kind: 'fixed', trigger: { year: 0, order: 2 } },
      { ...daily, id: 'story', kind: 'story', trigger: { year: 0, order: 1 } },
      {
        ...daily,
        id: 'late-fixed',
        kind: 'fixed',
        trigger: { year: 5, order: 2 },
      },
    ];
    const special: Card = { ...daily, id: 'special', kind: 'special' };
    const pool = [...mandatory, special];
    let s = { ...initialState(), year: 5 };
    for (const id of ['story', 'fixed', 'late-story', 'late-fixed']) {
      s = nextDocument({ ...s, current: null }, pool, () => 0);
      expect(s.current?.id).toBe(id);
    }
    expect(s.seen).toEqual(['story', 'fixed', 'late-story', 'late-fixed']);
    expect(
      nextDocument({ ...s, current: null }, pool, () => 0).current?.kind,
    ).toBe('special');
    expect(
      nextDocument(
        { ...initialState(), seen: ['story', 'fixed'] },
        pool,
        () => 0,
      ).current?.kind,
    ).toBe('special');
  });
  const sequence = (...values: number[]) => vi.fn(() => values.shift() ?? 0);
  const tierPool: Card[] = ([1, 2, 3] as const).map((tier) => ({
    ...daily,
    id: `tier${tier}`,
    tier,
  }));
  it.each(
    PHASES.flatMap((phase, index) => {
      const total = phase.weights[1] + phase.weights[2] + phase.weights[3];
      const years = [index === 0 ? 0 : PHASES[index - 1]!.until];
      if (Number.isFinite(phase.until)) years.push(phase.until - 1);
      return years.flatMap((year) =>
        ([1, 2, 3] as const).flatMap((tier) => {
          const start = ([1, 2, 3] as const)
            .filter((t) => t < tier)
            .reduce((sum, t) => sum + phase.weights[t], 0);
          return [0.001, 0.5, 0.999].map((fraction) => [
            year,
            (start + phase.weights[tier] * fraction) / total,
            tier,
          ]);
        }),
      );
    }),
  )('uses phase weights at year %s with roll %s', (year, roll, tier) => {
    expect(
      nextDocument(
        { ...initialState(), year },
        tierPool,
        sequence(0.99, roll, 0),
      ).current?.tier,
    ).toBe(tier);
  });
  it.each(APPRENTICE_PHASES.map((phase, index) => [index === 0 ? 0 : APPRENTICE_PHASES[index - 1]!.until, phase.weights[1]]))(
    'uses apprentice phase weights at year %s', (year, firstWeight) => {
      const draw = (roll: number) => nextDocument(
        { ...initialState('apprentice'), year }, tierPool, sequence(0.99, roll, 0),
      ).current?.tier;
      expect(draw((firstWeight - 0.01) / 100)).toBe(1);
      expect(draw((firstWeight + 0.01) / 100)).toBe(2);
    },
  );
  it('renormalises missing, condition-blocked and recently excluded tiers', () => {
    const pool = [tierPool[0]!, tierPool[2]!];
    const draw = (roll: number, cards: Card[] = pool, state = initialState()) =>
      nextDocument(state, cards, sequence(0.99, roll, 0)).current?.tier;
    const weights = PHASES[0]!.weights;
    const boundary = weights[1] / (weights[1] + weights[3]);
    expect(draw(boundary / 2)).toBe(1);
    expect(draw((1 + boundary) / 2)).toBe(3);
    expect(
      draw(0, [
        { ...tierPool[0]!, conditions: { flagsAll: ['locked'] } },
        tierPool[2]!,
      ]),
    ).toBe(3);
    expect(draw(0, pool, { ...initialState(), recent: ['tier1'] })).toBe(3);
  });
  it('uses the chance boundary, special weights, once-only seen tracking and daily fallback', () => {
    const special: Card = {
      ...daily,
      id: 'special',
      weight: undefined,
      kind: 'special',
      tier: undefined,
    };
    const pool = [daily, special, { ...special, id: 'heavy', weight: 9 }];
    expect(
      nextDocument(initialState(), pool, sequence(SPECIAL_CHANCE, 0, 0)).current
        ?.id,
    ).toBe(daily.id);
    expect(
      nextDocument(initialState(), pool, sequence(SPECIAL_CHANCE / 2, 0.05))
        .current?.id,
    ).toBe('special');
    const first = nextDocument(initialState(), pool, sequence(0, 0.2));
    expect(first.current?.id).toBe('heavy');
    expect(first.seen).toEqual(['heavy']);
    const second = nextDocument(
      { ...first, current: null },
      pool,
      sequence(0, 0),
    );
    expect(second.current?.id).toBe('special');
    expect(
      nextDocument({ ...second, current: null }, pool, sequence(0, 0, 0))
        .current?.id,
    ).toBe(daily.id);
    expect(first.seen).toEqual(['heavy']);
  });
  it('allows repeatable specials and filters special conditions', () => {
    const special: Card = {
      ...daily,
      kind: 'special',
      id: 'repeat',
      repeatable: true,
    };
    let state = initialState();
    for (let i = 0; i < 3; i++) {
      state = nextDocument(
        { ...state, current: null },
        [daily, special],
        sequence(0, 0),
      );
      expect(state.current?.id).toBe('repeat');
      expect(state.seen).toEqual([]);
    }
    expect(
      nextDocument(
        initialState(),
        [daily, { ...special, conditions: { flagsNone: ['blocked'] } }],
        sequence(0, 0),
      ).current?.id,
    ).toBe('repeat');
    expect(
      nextDocument(
        { ...initialState(), flags: ['blocked'] },
        [daily, { ...special, conditions: { flagsNone: ['blocked'] } }],
        sequence(0, 0, 0),
      ).current?.id,
    ).toBe(daily.id);
  });
  it('shares one mandatory queue across kinds and waits for conditions', () => {
    const story: Card = {
      ...daily,
      kind: 'story',
      id: 'later',
      trigger: { year: 1, order: 2 },
    };
    const fixed: Card = {
      ...daily,
      kind: 'fixed',
      id: 'first',
      trigger: { year: 1, order: 1 },
      conditions: { flagsAll: ['ready'], flagsNone: ['blocked'] },
    };
    const rng = vi.fn(() => 0);
    const pool = [story, fixed, daily];
    expect(
      nextDocument({ ...initialState(), year: 1, flags: ['ready'] }, pool, rng)
        .current?.id,
    ).toBe('first');
    const state = nextDocument({ ...initialState(), year: 1 }, pool, rng);
    expect(state.current?.id).toBe('later');
    expect(
      nextDocument({ ...state, current: null, flags: ['ready'] }, pool, rng)
        .current?.id,
    ).toBe('first');
    expect(rng).not.toHaveBeenCalled();
    expect(
      nextDocument(
        { ...initialState(), year: 1, flags: ['ready', 'blocked'] },
        pool,
        rng,
      ).current?.id,
    ).toBe('later');
    expect(nextDocument(initialState(), pool, rng).current?.kind).toBe('daily');
  });
  it('uses weights and excludes the recent pool size minus one', () => {
    const pool = [
      { ...daily, id: 'a', weight: 1 },
      { ...daily, id: 'b', weight: 9 },
    ];
    expect(
      (nextDocument(initialState(), pool, () => 0.05).current as Card).id,
    ).toBe('a');
    expect(
      (nextDocument(initialState(), pool, () => 0.2).current as Card).id,
    ).toBe('b');
    expect(
      (
        nextDocument({ ...initialState(), recent: ['b'] }, pool, () => 0.9)
          .current as Card
      ).id,
    ).toBe('a');
    expect(
      (
        nextDocument({ ...initialState(), recent: ['a'] }, [pool[0]!], () => 0)
          .current as Card
      ).id,
    ).toBe('a');
  });
  it('caps recent exclusion at 10', () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({
      ...daily,
      id: String(i),
    }));
    const s = nextDocument(
      { ...initialState(), recent: pool.slice(0, 11).map((c) => c.id) },
      pool,
      () => 0,
    );
    expect((s.current as Card).id).toBe('0');
  });
  it('filters flagsAll and flagsNone', () => {
    const gated = {
      ...daily,
      conditions: { flagsAll: ['yes'], flagsNone: ['no'] },
    };
    const other = { ...daily, id: 'other' };
    const draw = (flags: string[]) =>
      (
        nextDocument({ ...initialState(), flags }, [gated, other], () => 0)
          .current as Card
      ).id;
    expect(draw([])).toBe('other');
    expect(draw(['yes'])).toBe('test');
    expect(draw(['yes', 'no'])).toBe('other');
  });
});
describe('axe and sleep', () => {
  const originalFake = cards.find((c) => c.axe === 'free')!;
  const fake: Card = {
    ...originalFake,
    reject: {
      ...originalFake.reject,
      effects: { sugar: -100, people: 100, faith: -100, erpin: 100 },
      adjust: 10,
      setFlags: ['fake-reject'],
    },
    approve: {
      ...originalFake.approve,
      effects: { sugar: 100, people: -100, faith: 100, erpin: -100 },
      adjust: 10,
      setFlags: ['fake-approve'],
    },
  };
  it.each(['reject', 'approve'] as const)(
    'previews forged %s effects but only raises drowsiness on resolution',
    (action) => {
      for (const stack of [0, 1, 2] as const) {
        const before: State = {
          ...initialState(),
          current: fake,
          seen: [fake.id],
          flags: ['existing'],
          flagYears: { existing: 0 },
          boons: { rewind: true },
          drowse: { stack, left: stack ? 1 : 0 },
        };
        const after = run(before, action);
        expect(after.drowse).toEqual(
          stack === 2
            ? { stack: 0, left: 0 }
            : {
                stack: stack + 1,
                left: AXE_DECAY_BY_STACK[stack === 0 ? 1 : 2],
              },
        );
        expect(after.sleep).toBe(stack === 2 ? SLEEP_TURNS : 0);
        expect(after.scene).toBe('speakiFooled');
        expect(after.year).toBe(1);
        expect(choiceEffects(fake[action], before.gauges)).toEqual(
          fake[action].effects,
        );
        expect(after.gauges).toEqual(before.gauges);
        expect(after.flags).toEqual(before.flags);
        expect(after.flagYears).toEqual(before.flagYears);
        expect(after.seen).toContain(fake.id);
        expect(after.ending).toBeNull();
        expect(canRewind(after)).toBe(false);
        expect(run(after, 'approve')).toBe(after);
      }
    },
  );
  it('raises drowsiness even when a forged card has no missed scene', () => {
    const after = run(
      { ...initialState(), current: { ...fake, missed: undefined } },
      'reject',
    );
    expect(after.drowse).toEqual({ stack: 1, left: AXE_DECAY_BY_STACK[1] });
    expect(after.scene).toBeNull();
  });
  it.each([0, 0.99])(
    'never treats sleeping random stamps as fooled (rng %s)',
    (roll) => {
      let state: State = { ...initialState(), sleep: SLEEP_TURNS };
      for (let left = SLEEP_TURNS - 1; left >= 0; left--) {
        state = processDocument(
          { ...state, current: fake },
          'approve',
          cards,
          () => roll,
        );
        expect(state.sleep).toBe(left);
        expect(state.drowse).toEqual({ stack: 0, left: 0 });
        expect(state.scene).toBeNull();
        expect(state.gauges).toEqual(initialState().gauges);
        expect(state.flags).toEqual([]);
        expect(state.flagYears).toEqual({});
        expect(state.ending).toBeNull();
      }
    },
  );
  it.each([0, 1] as const)(
    'raises stack %i and resets decay on a same-year counted axe',
    (stack) => {
      const s = run(
        {
          ...initialState(),
          current: { ...daily, years: 0 },
          drowse: { stack, left: stack ? 1 : 0 },
        },
        'axe',
      );
      expect(s.year).toBe(0);
      expect(s.drowse).toEqual({
        stack: stack + 1,
        left: AXE_DECAY_BY_STACK[stack === 0 ? 1 : 2],
      });
    },
  );
  it.each(['reject', 'approve', 'axe'] as const)(
    'does not tick same-year documents handled with %s, even at the decay boundary',
    (action) => {
      let s: State = {
        ...initialState(),
        year: 10,
        drowse: { stack: 2, left: 1 },
      };
      for (const kind of ['story', 'daily'] as const) {
        s = run(
          {
            ...s,
            current: {
              ...daily,
              kind,
              years: 0,
              axe: action === 'axe' ? 'free' : false,
            },
          },
          action,
        );
        expect(s.year).toBe(10);
        expect(s.drowse).toEqual({ stack: 2, left: 1 });
      }
    },
  );
  it.each(['reject', 'approve', 'axe'] as const)(
    'ticks only once for a multi-year jump handled with %s',
    (action) => {
      const s = run(
        {
          ...initialState(),
          year: 10,
          current: {
            ...daily,
            years: 10,
            axe: action === 'axe' ? 'free' : false,
          },
          drowse: { stack: 2, left: AXE_DECAY_BY_STACK[2] },
        },
        action,
      );
      expect(s.year).toBe(20);
      expect(s.drowse).toEqual({ stack: 2, left: AXE_DECAY_BY_STACK[2] - 1 });
    },
  );
  it('recovers on a free axe at the decay boundary, and forbidden axes do not process a turn', () => {
    const free = cards.find((c) => c.axe === 'free')!;
    const before: State = {
      ...initialState(),
      current: story,
      drowse: { stack: 1, left: 1 },
    };
    expect(run(before, 'axe')).toBe(before);
    const after = run({ ...before, current: free }, 'axe');
    expect(after.drowse).toEqual({ stack: 0, left: 0 });
    expect(
      run({ ...after, scene: null, current: daily }, 'reject').drowse,
    ).toEqual({
      stack: 0,
      left: 0,
    });
  });
  it('forbids blocked axes and applies free axe results without increasing the stack', () => {
    const blocked = { ...initialState(), current: story };
    expect(run(blocked, 'axe')).toBe(blocked);
    const free = cards.find((c) => c.axe === 'free')!;
    const after = run(
      { ...initialState(), current: free, drowse: { stack: 1, left: 3 } },
      'axe',
    );
    expect(after.drowse).toEqual({ stack: 1, left: 2 });
    expect(after.scene).toBe(free.axeResult!.scene);
    expect(after.current).not.toBeNull();
    expect(after.current?.id).not.toBe(free.id);
    expect(run(after, 'approve')).toBe(after);
    expect(run({ ...after, scene: null }, 'approve').scene).toBeNull();
    expect(after.flags).toEqual(free.axeResult!.setFlags ?? []);
    expect(after.gauges).toEqual(initialState().gauges);
  });
  it('increases and resets decay on counted uses, sleeps on the third and wakes after SLEEP_TURNS stamps', () => {
    let s = initialState();
    for (let i = 0; i < 3; i++) {
      s = run({ ...s, current: daily }, 'axe');
      expect(s.drowse).toEqual({
        stack: i === 2 ? 0 : i + 1,
        left: i === 2 ? 0 : AXE_DECAY_BY_STACK[i === 0 ? 1 : 2],
      });
      expect(s.sleep).toBe(i === 2 ? SLEEP_TURNS : 0);
      if (i < 2) s = run({ ...s, current: daily }, 'reject');
    }
    const before = s;
    expect(run(s, 'axe')).toBe(before);
    expect(s.scene).toBe('asleep');
    s = dismissScene(s);
    for (let i = 0; i < SLEEP_TURNS; i++) {
      // fresh gauges so Erpin's random stamps can't end the run mid-test
      s = run(
        { ...s, current: daily, gauges: initialState().gauges },
        'approve',
      );
      expect(s.sleep).toBe(SLEEP_TURNS - i - 1);
      expect(s.drowse).toEqual({ stack: 0, left: 0 });
    }
  });
  it('decays each stack after its configured number of year-advancing documents', () => {
    let s: State = {
      ...initialState(),
      drowse: { stack: 2, left: AXE_DECAY_BY_STACK[2] },
    };
    const quiet = { ...daily, years: 1, reject: { label: 'x', effects: {} } };
    for (const stack of [2, 1] as const) {
      for (let i = 1; i <= AXE_DECAY_BY_STACK[stack]; i++) {
        const before = s.drowse;
        s = run({ ...s, current: { ...quiet, years: 0 } }, 'reject');
        expect(s.drowse).toEqual(before);
        s = processDocument(
          { ...s, current: quiet },
          'reject',
          cards,
          () => 0.99,
        );
        expect(s.drowse).toEqual(
          i === AXE_DECAY_BY_STACK[stack]
            ? {
                stack: stack - 1,
                left: stack === 2 ? AXE_DECAY_BY_STACK[1] : 0,
              }
            : { stack, left: AXE_DECAY_BY_STACK[stack] - i },
        );
      }
    }
  });
  it('advances drowsiness alongside a counted axe scene', () => {
    const s = processDocument(
      {
        ...initialState(),
        current: { ...daily, axeResult: { scene: 'speakiCaught' } },
      },
      'axe',
      cards,
      () => 0.99,
    );
    expect(s.drowse).toEqual({ stack: 1, left: AXE_DECAY_BY_STACK[1] });
    expect(s.scene).toBe('speakiCaught');
  });
  it('auto chooses from injected RNG and records sleep game over with cause, including final sleep turn', () => {
    const s = {
      ...initialState(),
      erpinSaved: true,
      current: daily,
      sleep: 1,
      gauges: { ...initialState().gauges, sugar: 10 },
    };
    expect(run(s, 'approve').ending).toEqual({
      id: 'sleep',
      cause: 'sugar_low',
    });
    const high = processDocument(
      { ...s, gauges: { ...s.gauges, sugar: 90 } },
      'reject',
      cards,
      () => 0.99,
    );
    expect(high.ending).toEqual({ id: 'sleep', cause: 'sugar_high' });
  });
});
describe('card validator', () => {
  const free = cards.find((c) => c.axe === 'free')!;
  it.each(Object.keys(system.scenes))(
    'accepts missed scene %s on a free axe card',
    (scene) => {
      expect(validateCards([{ ...free, missed: { scene } }])).toEqual([]);
    },
  );
  it('allows free axe cards without missed', () => {
    expect(validateCards([{ ...free, missed: undefined }])).toEqual([]);
  });
  it.each([
    null,
    false,
    'speakiFooled',
    [],
    {},
    { scene: null },
    { scene: 1 },
    { scene: '' },
    { scene: 'missing' },
    { scene: 'toString' },
  ])('rejects malformed missed metadata %j', (missed) => {
    expect(validateCards([{ ...free, missed }])).toEqual([
      '[0] missed must specify a valid system scene on free axe cards only',
    ]);
  });
  it.each([true, false])('rejects missed metadata with axe %s', (axe) => {
    expect(
      validateCards([{ ...daily, axe, missed: { scene: 'speakiFooled' } }]),
    ).toEqual([
      '[0] missed must specify a valid system scene on free axe cards only',
    ]);
  });
  it.each(['legacy', '', undefined])(
    'rejects a stray nerLine field (%s)',
    (nerLine) => {
      expect(validateCards([{ ...daily, nerLine }])).toEqual([
        '[0] nerLine is no longer used',
      ]);
    },
  );
  it('accepts source data unchanged', () => {
    expect(validateCards(raw)).toEqual([]);
  });
  it.each([
    ['missing required field', { ...daily, title: undefined }],
    [
      'unknown gauge',
      { ...daily, approve: { label: 'x', effects: { sugars: 10 } } },
    ],
    [
      'invalid amount',
      { ...daily, reject: { label: 'x', effects: { sugar: 7 } } },
    ],
    ['unknown speaker', { ...daily, speaker: 'nobody' }],
    ['legacy special field', { ...story, special: true }],
    ['unknown kind', { ...daily, kind: 'unknown' }],
    ['old main kind', { ...story, kind: 'main' }],
    ['unknown kind', { ...daily, kind: 'unknown' }],
    ['story with counted axe', { ...story, axe: true }],
    ['story with free axe', { ...story, axe: 'free' }],
    ['fixed with free axe', { ...fixed, axe: 'free' }],
    ...['reject', 'approve'].map((side) => [
      `story ${side} effects`,
      {
        ...story,
        [side]: {
          ...story[side as 'reject' | 'approve'],
          effects: { sugar: 5 },
        },
      },
    ]),
    ...['story', 'fixed'].map((kind) => [
      'missing trigger',
      { ...story, kind, trigger: undefined },
    ]),
    ...['daily', 'special'].map((kind) => [
      'forbidden trigger',
      { ...daily, kind, trigger: { year: 0, order: 0 } },
    ]),
    ...[undefined, 0, 4, '1', 1.5].map((tier) => [
      'invalid tier',
      { ...daily, tier },
    ]),
    ...['story', 'fixed', 'special'].map((kind) => [
      'forbidden tier',
      { ...story, kind, tier: 1 },
    ]),
    ...['story', 'fixed', 'daily'].map((kind) => [
      'forbidden repeatable',
      { ...daily, kind, repeatable: false },
    ]),
    ['invalid repeatable', { ...cards.at(-1), repeatable: 'yes' }],
    ['invalid axe', { ...daily, axe: 'yes' }],
    ['unknown scene', { ...daily, axeResult: { scene: 'missing' } }],
    ['inherited scene key', { ...daily, axeResult: { scene: 'toString' } }],
    ['invalid scene', { ...daily, axeResult: { scene: 1 } }],
    [
      'legacy axe message',
      { ...daily, axeResult: { scene: 'speakiCaught', message: 'x' } },
    ],
    [
      'missing free axe result',
      { ...daily, axe: 'free', axeResult: undefined },
    ],
  ] as [string, unknown][])('rejects %s', (_, card) => {
    expect(validateCards([card]).length).toBeGreaterThan(0);
  });
  it('rejects duplicates and malformed root', () => {
    expect(validateCards([daily, daily]).join()).toContain('duplicate');
    expect(validateCards({})).not.toHaveLength(0);
  });
});
