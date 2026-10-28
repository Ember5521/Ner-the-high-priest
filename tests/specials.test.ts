import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card, type State } from '../src/core/state';
import {
  BULLET_CHARGES,
  ERA_SCALE,
  NPC_GAP,
  NPC_SAME_GAP,
  SLEEP_TURNS,
  REWIND_YEARS,
  decayFor,
} from '../src/core/config';
import {
  canRerollDaily,
  eligible,
  nextDocument,
  rerollDaily,
} from '../src/core/deck';
import {
  canRewind,
  choiceEffects,
  hasHyean,
  processDocument,
  rewind,
} from '../src/core/loop';
import { previewFor } from '../src/ui/gauges';
import { validateCards } from '../tools/validate-cards';
const daily: Card = {
  ...(raw as Card[]).find((c) => c.kind === 'daily')!,
  id: 'daily',
  conditions: undefined,
  years: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
const other = { ...daily, id: 'other' };
const resolve = (card: Card, state = initialState()) =>
  processDocument(
    { ...state, current: card },
    'approve',
    [daily, other],
    () => 0.5,
  );
describe('special NPC systems', () => {
  it('grants bullet charges and caps repeated grants', () => {
    const card = (raw as Card[]).find((c) => c.id === 'fixed_xion_request')!;
    for (const bullet of [undefined, 1, BULLET_CHARGES]) {
      const state = { ...initialState(), boons: { bullet } };
      const side = card.reject.grant?.boon === 'bullet' ? 'reject' : 'approve';
      expect(
        processDocument(
          { ...state, current: card },
          side,
          [daily, other],
          () => 0.5,
        ).boons.bullet,
      ).toBe(BULLET_CHARGES);
      expect(state.boons.bullet).toBe(bullet);
    }
  });
  it.each([0, 1, 2] as const)(
    'bullet shots preserve drowse at stack %s, then axes raise it',
    (stack) => {
      let state: State = {
        ...initialState(),
        boons: { bullet: BULLET_CHARGES },
        drowse: { stack, left: stack ? 4 : 0 },
      };
      for (let remaining = BULLET_CHARGES - 1; remaining >= 0; remaining--) {
        const before = state;
        state = processDocument(
          { ...state, current: daily },
          'bullet',
          [daily, other],
          () => 0.5,
        );
        expect(state.boons.bullet).toBe(remaining || undefined);
        expect(Object.hasOwn(state.boons, 'bullet')).toBe(remaining > 0);
        expect(state.drowse).toEqual({
          stack,
          left: stack ? before.drowse.left - 1 : 0,
        });
        expect(state.sleep).toBe(0);
        expect(before.boons.bullet).toBe(remaining + 1);
      }
      const after = processDocument(
        { ...state, current: daily },
        'axe',
        [daily, other],
        () => 0.5,
      );
      const nextStack = stack === 2 ? 0 : stack === 0 ? 1 : 2;
      expect(after.drowse).toEqual({
        stack: nextStack,
        left: decayFor(nextStack),
      });
      expect(after.sleep).toBe(stack === 2 ? SLEEP_TURNS : 0);
    },
  );
  it('does not spend bullets on stamps, free axes, forbidden axes or sleeping actions', () => {
    const state = { ...initialState(), boons: { bullet: BULLET_CHARGES } };
    for (const [card, action, sleep] of [
      [daily, 'approve', 0],
      [daily, 'axe', 0],
      [{ ...daily, axe: 'free' }, 'axe', 0],
      [{ ...daily, axe: false }, 'axe', 0],
      [daily, 'axe', 1],
      [daily, 'approve', 1],
    ] as const) {
      expect(
        processDocument(
          { ...state, current: card, sleep },
          action,
          [daily],
          () => 0.5,
        ).boons.bullet,
      ).toBe(BULLET_CHARGES);
    }
  });
  it.each(['reject', 'approve'] as const)(
    'does not cover Speaki fooled raises on %s',
    (action) => {
      const fake = { ...daily, kind: 'speaki' as const, axe: 'free' as const };
      const after = processDocument(
        {
          ...initialState(),
          current: fake,
          boons: { bullet: BULLET_CHARGES },
          drowse: { stack: 2, left: 4 },
        },
        action,
        [daily],
        () => 0.5,
      );
      expect(after.boons.bullet).toBe(BULLET_CHARGES);
      expect(after.drowse).toEqual({ stack: 0, left: 0 });
      expect(after.sleep).toBe(SLEEP_TURNS);
    },
  );
  it('applies fixed adjustments without era scaling and forbids story adjustments', () => {
    const year = ERA_SCALE.find(([, scale]) => scale > 1)![0];
    for (const adjust of [10, 15]) {
      const card: Card = {
        ...daily,
        kind: 'fixed',
        tier: undefined,
        trigger: { year: 50, order: 1 },
        approve: { label: 'x', effects: { sugar: -15 }, adjust },
      };
      delete card.tier;
      const gauges = { sugar: 50, people: 20, faith: 70, erpin: 50 };
      const expected = {
        ...card.approve.effects,
        people:
          (card.approve.effects.people ?? 0) +
          Math.min(card.approve.adjust!, 30),
      };
      expect(choiceEffects(card.approve, gauges, 'fixed', year)).toEqual(
        expected,
      );
      const after = resolve(card, { ...initialState(), year, gauges });
      for (const key of Object.keys(expected) as (keyof typeof gauges)[])
        expect(after.gauges[key]).toBe(gauges[key] + expected[key]!);
      expect(validateCards([card])).toEqual([]);
      expect(
        validateCards([
          {
            ...card,
            kind: 'story',
            reject: { ...card.reject, effects: {} },
            approve: { ...card.approve, effects: {} },
          },
        ]),
      ).toContain('[0] story adjust is not allowed');
      expect(
        validateCards([
          {
            ...card,
            approve: { ...card.approve, grant: { boon: 'bullet', years: 1 } },
          },
        ]),
      ).toContain('[0] grant uses must be a positive integer for hyean, intuition or scope');
    }
  });
  it('records the first flag year, including axe flags, and queues follow-ups by due year/order', () => {
    let state = resolve({
      ...daily,
      approve: { ...daily.approve, setFlags: ['met'] },
    });
    expect(state.flagYears.met).toBe(1);
    state = resolve(
      { ...daily, approve: { ...daily.approve, setFlags: ['met'] } },
      state,
    );
    expect(state.flagYears.met).toBe(1);
    const follow: Card = {
      ...daily,
      id: 'follow',
      kind: 'story',
      trigger: { after: 'met', years: 3, order: 1 },
    };
    const fixed: Card = {
      ...follow,
      id: 'fixed',
      trigger: { year: 4, order: 2 },
    };
    expect(
      nextDocument(
        { ...state, year: 3, current: null },
        [follow, daily],
        () => 0.5,
      ).current?.id,
    ).toBe('daily');
    expect(
      nextDocument(
        { ...state, year: 4, current: null },
        [fixed, follow],
        () => 0.5,
      ).current?.id,
    ).toBe('follow');
    expect(
      nextDocument({ ...initialState(), year: 99 }, [follow, daily], () => 0.5)
        .current?.id,
    ).toBe('daily');
    const axed = processDocument(
      {
        ...initialState(),
        current: { ...daily, axeResult: { setFlags: ['axed'] } },
      },
      'axe',
      [daily],
      () => 0.5,
    );
    expect(axed.flagYears.axed).toBe(1);
  });
  it('grants five choices after resolution and refreshes without shortening the remainder', () => {
    const card: Card = {
      ...daily,
      kind: 'story',
      years: 0,
      approve: { ...daily.approve, grant: { boon: 'hyean', uses: 5 } },
    };
    const s = resolve(card);
    expect(s.boons.hyean).toEqual({ left: 5 });
    expect(resolve(card, s).boons.hyean).toEqual({ left: 5 });
    expect(
      resolve(
        {
          ...card,
          approve: { ...card.approve, grant: { boon: 'hyean', uses: 1 } },
        },
        s,
      ).boons.hyean,
    ).toEqual({ left: 5 });
    expect(hasHyean({ ...s, year: 150 })).toBe(true);
    expect(hasHyean({ ...s, boons: { hyean: { left: 0 } } })).toBe(false);
    let after = s;
    for (let left = 4; left >= 0; left--) {
      after = resolve(
        { ...daily, approve: { label: 'x', effects: { sugar: -5 } } },
        after,
      );
      expect(after.boons.hyean).toEqual(left ? { left } : undefined);
      expect(hasHyean(after)).toBe(left > 0);
    }
    expect(s.boons.hyean).toEqual({ left: 5 });
    for (const boon of ['alice', 'rewind', 'stitch'] as const)
      expect(
        resolve({ ...card, approve: { ...card.approve, grant: { boon } } })
          .boons[boon],
      ).toBe(true);
  });
  it.each(['reject', 'approve', 'axe', 'bullet'] as const)(
    'spends one hyean choice on awake %s',
    (action) => {
      const s = {
        ...initialState(),
        current: { ...daily, approve: { label: 'x', effects: { sugar: -5 } } },
        boons: { hyean: { left: 5 }, bullet: 3 },
      };
      expect(
        processDocument(s, action, [daily, other], () => 0.5).boons.hyean,
      ).toEqual({ left: 4 });
      expect(s.boons.hyean).toEqual({ left: 5 });
    },
  );
  it('preserves hyean during sleep, rerolls, scenes and rewind prompts', () => {
    const s: State = {
      ...initialState(),
      current: daily,
      boons: { hyean: { left: 5 }, alice: true, rewind: true },
    };
    for (const action of ['reject', 'approve'] as const)
      expect(
        processDocument({ ...s, sleep: 1 }, action, [daily, other], () => 0.5)
          .boons.hyean,
      ).toEqual({ left: 5 });
    const rerolled = processDocument(s, 'alice', [daily, other], () => 0.5);
    expect(rerolled.current?.id).toBe(other.id);
    expect(rerolled.boons.alice).toBeUndefined();
    expect(rerolled.boons.hyean).toEqual({ left: 5 });
    for (const paused of [
      { ...s, scene: 'stitch' },
      { ...s, ending: { id: 'sugar_low' } },
    ])
      expect(
        processDocument(paused, 'approve', [daily, other], () => 0.5),
      ).toBe(paused);
    expect(
      rewind({ ...s, ending: { id: 'sugar_low' } }, [daily, other], () => 0.5)
        .boons.hyean,
    ).toEqual({ left: 5 });
  });
  it('accepts only positive integer hyean uses and rejects all grant years', () => {
    const validate = (grant: unknown) =>
      validateCards([{ ...daily, approve: { ...daily.approve, grant } }]);
    expect(validate({ boon: 'hyean', uses: 5 })).toEqual([]);
    for (const grant of [
      ...[undefined, 0, -1, 1.5, '5', null].map((uses) => ({
        boon: 'hyean',
        uses,
      })),
      { boon: 'hyean', years: 5 },
      { boon: 'hyean', uses: 5, years: 5 },
      { boon: 'alice', uses: 5 },
    ])
      expect(validate(grant)).toContain(
        '[0] grant uses must be a positive integer for hyean, intuition or scope',
      );
  });
  it.each([
    ['people', 10, 90, 50, 10],
    ['faith', 49, 80, 50, -10],
    ['erpin', 50, 50, 47, 5],
  ] as const)(
    'adjusts %s with ties and clamping and previews the same effects',
    (target, people, faith, erpin, delta) => {
      const gauges = { sugar: 99, people, faith, erpin };
      const card = {
        ...daily,
        approve: { ...daily.approve, effects: { sugar: -15 }, adjust: 10 },
      };
      expect(choiceEffects(card.approve, gauges, card.kind)).toEqual({
        sugar: -15,
        [target]: delta,
      });
      expect(previewFor(card, 'approve', gauges)).toContainEqual({
        gauge: target,
        dir: delta > 0 ? 'up' : 'down',
        size: Math.abs(delta),
      });
      expect(resolve(card, { ...initialState(), gauges }).gauges[target]).toBe(
        gauges[target] + delta,
      );
    },
  );
  it('checks year and inclusive gauge conditions along with flags', () => {
    const card = {
      ...daily,
      conditions: {
        minYear: 12,
        flagsAll: ['yes'],
        flagsNone: ['no'],
        gauges: { sugar: { min: 70, max: 80 } },
      },
    };
    const s = {
      ...initialState(),
      year: 12,
      flags: ['yes'],
      gauges: { ...initialState().gauges, sugar: 70 },
    };
    expect(eligible(card, s)).toBe(true);
    expect(eligible(card, { ...s, year: 11 })).toBe(false);
    expect(eligible(card, { ...s, flags: ['yes', 'no'] })).toBe(false);
    expect(eligible(card, { ...s, gauges: { ...s.gauges, sugar: 81 } })).toBe(
      false,
    );
  });
  it('tracks NPC appearances and enforces both gaps and the held Alice charge', () => {
    const npc: Card = {
      ...daily,
      kind: 'special',
      npc: 'sist',
      repeatable: true,
    };
    const s = nextDocument(
      { ...initialState(), year: 12 },
      [npc, other],
      () => 0,
    );
    expect(s.npcYears).toEqual({ sist: 12 });
    expect(
      eligible({ ...npc, npc: 'alice' }, { ...s, year: 12 + NPC_GAP - 1 }),
    ).toBe(false);
    expect(
      eligible({ ...npc, npc: 'alice' }, { ...s, year: 12 + NPC_GAP }),
    ).toBe(true);
    const sameGap = Math.max(NPC_GAP, NPC_SAME_GAP);
    expect(eligible(npc, { ...s, year: 12 + sameGap - 1 })).toBe(false);
    expect(eligible(npc, { ...s, year: 12 + sameGap })).toBe(true);
    expect(
      eligible(
        {
          ...npc,
          id: 'special_strange_card',
          approve: { ...npc.approve, grant: { boon: 'alice' } },
        },
        { ...s, year: 12 + sameGap, boons: { alice: true } },
      ),
    ).toBe(false);
  });
  it('rerolls only to a different eligible daily without advancing time or drowse', () => {
    const s = {
      ...initialState(),
      current: daily,
      year: 60,
      boons: { alice: true as const },
      drowse: { stack: 2 as const, left: 3 },
    };
    const after = rerollDaily(
      s,
      [daily, other, { ...other, id: 'locked', conditions: { minYear: 100 } }],
      () => 0.5,
    );
    expect(after.current?.id).toBe('other');
    expect(after.year).toBe(s.year);
    expect(after.drowse).toEqual(s.drowse);
    expect(after.gauges).toEqual(s.gauges);
    expect(after.boons.alice).toBeUndefined();
    expect(canRerollDaily(s, [daily, other])).toBe(true);
    const unavailable = [daily, { ...other, conditions: { minYear: 100 } }];
    expect(canRerollDaily(s, unavailable)).toBe(false);
    expect(rerollDaily(s, unavailable, () => 0)).toBe(s);
    expect(rerollDaily(s, [daily], () => 0)).toBe(s);
    expect(
      rerollDaily(
        { ...s, current: { ...daily, kind: 'story' } },
        [other],
        () => 0,
      ).boons.alice,
    ).toBe(true);
  });
  it.each([140, 140 + REWIND_YEARS + 1, 198, 199])(
    'offers rewind with the acquisition-year floor from year %s',
    (year) => {
      const s = resolve(
        { ...daily, approve: { ...daily.approve, effects: { sugar: -10 } } },
        {
          ...initialState(),
          year,
          gauges: { ...initialState().gauges, sugar: 5 },
          boons: { rewind: true, bullet: BULLET_CHARGES },
          rewindYear: 140,
          erpinSaved: true,
          sleep: 1,
          flags: ['kept'],
          seen: ['kept'],
          drowse: { stack: 2, left: 2 },
        },
      );
      expect(s.ending).toEqual({ id: 'sleep', cause: 'sugar_low' });
      const failed = s;
      expect(canRewind(failed)).toBe(true);
      const after = rewind(failed, [daily, other], () => 0.5);
      expect(after.year).toBe(Math.max(140, year - REWIND_YEARS));
      expect(after.bestYear).toBe(year);
      expect(after.gauges).toEqual(initialState().gauges);
      expect(after.sleep).toBe(0);
      expect(after.drowse).toEqual({ stack: 0, left: 0 });
      expect(after.flags).toEqual(['kept']);
      expect(after.seen).toEqual(['kept']);
      expect(after.boons.rewind).toBeUndefined();
      expect(after.boons.bullet).toBe(BULLET_CHARGES);
      expect(after.ending).toBeNull();
      expect(after.current).not.toBeNull();
    },
  );
  it('accepts the data stitch grant without years and rejects a duration', () => {
    const chloe = (raw as Card[]).find((c) => c.id === 'fixed_chloe_tailor')!;
    expect(chloe.reject.grant).toEqual({ boon: 'stitch' });
    expect(validateCards(raw)).toEqual([]);
    expect(
      processDocument(
        { ...initialState(), current: chloe },
        'reject',
        [daily, other],
        () => 0.5,
      ).boons.stitch,
    ).toBe(true);
    expect(
      validateCards([
        {
          ...daily,
          approve: { ...daily.approve, grant: { boon: 'stitch', years: 1 } },
        },
      ]),
    ).toContainEqual(expect.stringContaining('grant uses'));
  });
  it('validates the new fields and rejects malformed shapes', () => {
    expect(validateCards(raw)).toEqual([]);
    const invalid = [
      { ...daily, npc: 'sist' },
      { ...daily, kind: 'special', npc: 1 },
      { ...daily, conditions: { minYear: -1 } },
      { ...daily, conditions: { gauges: { sugar: { min: 80, max: 10 } } } },
      { ...daily, conditions: { gauges: { wrong: { min: 1 } } } },
      { ...daily, approve: { ...daily.approve, grant: { boon: 'missing' } } },
      { ...daily, approve: { ...daily.approve, grant: { boon: 'hyean' } } },
      {
        ...daily,
        approve: { ...daily.approve, grant: { boon: 'alice', years: 1 } },
      },
      { ...daily, approve: { ...daily.approve, adjust: 0 } },
      {
        ...daily,
        kind: 'story',
        trigger: { after: 'met', years: -1, order: 0 },
      },
      {
        ...daily,
        kind: 'story',
        trigger: { after: 'met', years: 1, year: 1, order: 0 },
      },
    ];
    for (const card of invalid)
      expect(validateCards([card]).length).toBeGreaterThan(0);
  });
});
