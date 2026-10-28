import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card, type State } from '../src/core/state';
import { eligible, nextDocument } from '../src/core/deck';
import { NPC_GAP, NPC_SAME_GAP } from '../src/core/config';
import { hasHyean, processDocument } from '../src/core/loop';
import { validateCards } from '../tools/validate-cards';

const cards = raw as Card[];
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  id: 'daily',
  conditions: undefined,
  years: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
const thanks = cards.find((c) => c.id === 'story_diana_thanks')!;
const kids = cards.find((c) => c.id === 'fixed_beast_kids_bread')!;
const pool = [daily, thanks];
const draw = (state: State, choices = pool) =>
  nextDocument({ ...state, current: null }, choices, () => 0.5);
const resolve = (
  state: State,
  choices = pool,
  action: 'approve' | 'reject' | 'axe' = 'approve',
) => processDocument(state, action, choices, () => 0.5);
const source: Card = {
  ...daily,
  approve: { ...daily.approve, schedule: { card: thanks.id, years: 3 } },
};

describe('choice schedules', () => {
  it('schedules a bullet fixed card from a fixed choice, shows it on time once', () => {
    const target: Card = {
      ...daily,
      id: 'scheduled_fixed',
      kind: 'fixed',
      tier: undefined,
      axe: 'bullet',
      trigger: { scheduled: true, order: 1 },
    };
    const sender: Card = {
      ...target,
      id: 'sender',
      axe: false,
      trigger: { year: 0, order: 0 },
      approve: { ...daily.approve, schedule: { card: target.id, years: 3 } },
    };
    delete target.tier;
    delete sender.tier;
    const all = [daily, sender, target];
    expect(validateCards(all)).toEqual([]);
    let state = draw(initialState(), all);
    expect(state.current?.id).toBe(sender.id);
    state = resolve(state, all);
    expect(state.scheduled).toEqual({ [target.id]: 4 });
    expect(state.current?.id).toBe(daily.id);
    state = resolve({ ...state, current: { ...daily, years: 10 } }, all);
    expect(state.year).toBe(4);
    expect(state.current?.id).toBe(target.id);
    expect(state.scheduled).toEqual({});
    state = resolve(state, all);
    expect(state.current?.id).toBe(daily.id);
    expect(draw({ ...state, year: 50 }, all).current?.id).toBe(daily.id);
  });
  it('queues from the resolved year, keeps the earliest due year without mutation or duplicates', () => {
    const before = {
      ...initialState(),
      year: 10,
      current: { ...source, years: 2 },
    };
    const first = resolve(before);
    expect(before.scheduled).toEqual({});
    expect(first.year).toBe(12);
    expect(first.scheduled).toEqual({ [thanks.id]: 15 });
    const later = resolve({ ...first, current: source });
    expect(later.scheduled).toEqual({ [thanks.id]: 15 });
    expect(first.scheduled).toEqual({ [thanks.id]: 15 });
    const earlier = resolve({ ...later, year: 5, current: source });
    expect(earlier.scheduled).toEqual({ [thanks.id]: 9 });
    expect(draw({ ...earlier, year: 8 }).current?.id).toBe(daily.id);
    const due = draw({ ...earlier, year: 9 });
    expect(due.current?.id).toBe(thanks.id);
    expect(due.scheduled).toEqual({});
  });

  it('never draws an unscheduled card by year, including after a previous appearance', () => {
    for (const year of [0, 10, 199]) {
      expect(draw({ ...initialState(), year }).current?.id).toBe(daily.id);
      expect(
        draw({ ...initialState(), year, seen: [thanks.id] }).current?.id,
      ).toBe(daily.id);
    }
  });

  it('orders scheduled, story and fixed cards together by due year then order and waits for conditions', () => {
    const fixed: Card = {
      ...thanks,
      id: 'fixed',
      kind: 'fixed',
      years: 0,
      trigger: { year: 7, order: 2 },
    };
    const story: Card = {
      ...fixed,
      id: 'story',
      kind: 'story',
      trigger: { year: 8, order: 0 },
    };
    const all = [daily, story, fixed, thanks];
    const initial = {
      ...initialState(),
      year: 10,
      scheduled: { [thanks.id]: 7 },
    };
    let s = draw(initial, all);
    expect(s.current?.id).toBe(thanks.id);
    s = resolve(s, all);
    expect(s.current?.id).toBe(fixed.id);
    s = resolve(s, all);
    expect(s.current?.id).toBe(story.id);
    expect(
      draw({ ...initial, scheduled: { [thanks.id]: 9 } }, all).current?.id,
    ).toBe(fixed.id);
    const locked = { ...thanks, conditions: { flagsAll: ['ready'] } };
    const waiting = draw(initial, [daily, locked]);
    expect(waiting.current?.id).toBe(daily.id);
    expect(waiting.scheduled).toEqual(initial.scheduled);
    expect(
      draw({ ...waiting, flags: ['ready'] }, [daily, locked]).current?.id,
    ).toBe(thanks.id);
  });

  it.each(['approve', 'reject'] as const)(
    'runs the Diana chain and grants hyean on %s, then schedules and grants again',
    (action) => {
      const all = [daily, kids, thanks];
      let s = nextDocument(
        { ...initialState(), year: 50, flags: ['met_diana'] },
        all,
        () => 0,
      );
      expect(s.current?.id).toBe(kids.id);
      s = resolve(s, all);
      const resolvedYear = 50 + kids.years;
      const dueYear = resolvedYear + kids.approve.schedule!.years;
      expect(s.year).toBe(resolvedYear);
      expect(s.scheduled).toEqual({ [thanks.id]: dueYear });
      expect(s.flags).toEqual(['met_diana']);
      expect(hasHyean(s)).toBe(false);
      while (s.year + daily.years < dueYear) {
        const year = s.year + daily.years;
        s = resolve(s, all);
        expect(s.year).toBe(year);
        expect(s.current?.id).toBe(daily.id);
      }
      s = resolve(s, all);
      expect(s.year).toBe(dueYear);
      expect(s.current?.id).toBe(thanks.id);
      const due = s;
      expect(resolve(due, all, 'axe')).toBe(due);
      s = resolve(due, all, action);
      const grantedYear = dueYear + thanks.years;
      expect(s.year).toBe(grantedYear);
      expect(s.gauges).toEqual(
        action === 'reject'
          ? due.gauges
          : { ...due.gauges, sugar: 50, people: 50 },
      );
      expect(s.boons.hyean).toEqual(
        action === 'reject' ? { left: 5 } : undefined,
      );
      expect(s.statuses).toEqual([]);
      expect(hasHyean(s)).toBe(action === 'reject');
      expect(s.scheduled).toEqual({});
      const repeatYear = grantedYear + 1;
      const repeatDue =
        repeatYear + source.years + source.approve.schedule!.years;
      s = resolve({ ...s, year: repeatYear, current: source }, all);
      expect(s.scheduled).toEqual({ [thanks.id]: repeatDue });
      s = draw({ ...s, year: repeatDue }, all);
      expect(s.current?.id).toBe(thanks.id);
      s = resolve(s, all, action);
      expect(s.boons.hyean).toEqual(
        action === 'reject' ? { left: 5 } : undefined,
      );
      expect(s.statuses).toEqual([]);
      expect(s.seen.filter((id) => id === thanks.id)).toHaveLength(1);
      expect(draw({ ...s, year: 30 }, all).current?.id).toBe(daily.id);
    },
  );

  it('only schedules the chosen result and never schedules an axe resolution', () => {
    for (const action of ['reject', 'axe'] as const) {
      expect(
        resolve({ ...initialState(), current: source }, pool, action).scheduled,
      ).toEqual({});
    }
    const rejectSource = {
      ...source,
      reject: source.approve,
      approve: daily.approve,
    };
    expect(
      resolve({ ...initialState(), current: rejectSource }, pool, 'reject')
        .scheduled,
    ).toEqual({ [thanks.id]: 4 });
  });
});

describe('special period blocks', () => {
  const special: Card = {
    ...daily,
    kind: 'special',
    id: 'period',
    repeatable: true,
    period: 50,
  };
  it.each([0, 23, 49])(
    'limits appearances within the block after year %s and permits the next block',
    (year) => {
      const before = { ...initialState(), year };
      const s = nextDocument(before, [special, daily], () => 0);
      expect(s.current?.id).toBe(special.id);
      expect(before.appearanceYears).toEqual({});
      expect(s.appearanceYears).toEqual({ [special.id]: [year] });
      expect(eligible(special, s)).toBe(false);
      expect(
        nextDocument(
          { ...s, current: null, year: 49 },
          [special, daily],
          () => 0,
        ).current?.id,
      ).toBe(daily.id);
      const next = nextDocument(
        { ...s, current: null, year: 50 },
        [special, daily],
        () => 0,
      );
      expect(next.current?.id).toBe(special.id);
      expect(eligible(special, { ...next, year: 99 })).toBe(false);
      expect(eligible(special, { ...next, year: 100 })).toBe(true);
    },
  );
  it('combines period blocks with same-NPC and global gaps', () => {
    const gap = Math.max(NPC_GAP, NPC_SAME_GAP);
    const period = gap + 2;
    const appeared = period - 1;
    const ready = appeared + gap;
    const npc = { ...special, npc: 'diana', period };
    const s = nextDocument(
      { ...initialState(), year: appeared },
      [npc, daily],
      () => 0,
    );
    expect(eligible(npc, { ...s, year: appeared })).toBe(false);
    expect(eligible(npc, { ...s, year: ready - 1 })).toBe(false);
    expect(eligible(npc, { ...s, year: ready })).toBe(true);
    expect(
      eligible(npc, {
        ...s,
        year: ready,
        npcYears: { diana: appeared, sist: ready - NPC_GAP + 1 },
      }),
    ).toBe(false);
    expect(
      eligible(npc, {
        ...s,
        year: ready + 1,
        npcYears: { diana: appeared, sist: ready - NPC_GAP + 1 },
      }),
    ).toBe(true);
    expect(eligible(npc, { ...s, year: appeared - 1 })).toBe(false);
  });
  it('remembers appearances in later blocks when time is rewound', () => {
    const later = nextDocument(
      { ...initialState(), year: 150 },
      [special, daily],
      () => 0,
    );
    const earlier = nextDocument(
      { ...later, current: null, year: 145 },
      [special, daily],
      () => 0,
    );
    expect(earlier.current?.id).toBe(special.id);
    expect(earlier.appearanceYears[special.id]).toEqual([150, 145]);
    expect(eligible(special, { ...earlier, year: 150 })).toBe(false);
  });
  it('preserves one-shot specials even across period boundaries', () => {
    const once = { ...special, repeatable: false };
    const s = nextDocument(initialState(), [once, daily], () => 0);
    expect(
      nextDocument({ ...s, current: null, year: 50 }, [once, daily], () => 0)
        .current?.id,
    ).toBe(daily.id);
  });
});

describe('schedule and period validation', () => {
  const validDaily = { ...daily, conditions: undefined };
  it('accepts the data and scheduled story/fixed targets on either choice', () => {
    expect(validateCards(raw)).toEqual([]);
    for (const kind of ['story', 'fixed'] as const) {
      const target = structuredClone({ ...thanks, kind });
      if (kind === 'story') delete target.reject.mend;
      if (kind !== 'story') delete target.look;
      expect(
        validateCards([validDaily, target, { ...kids, reject: kids.approve }]),
      ).toEqual([]);
    }
  });
  it.each([null, false, [], 1])('rejects malformed schedule %s', (schedule) => {
    expect(
      validateCards([
        { ...validDaily, approve: { ...daily.approve, schedule } },
      ]),
    ).toContain('[0] schedule must be an object');
  });
  it.each([undefined, -1, 1.5, '3', Infinity])(
    'rejects schedule years %s',
    (years) => {
      expect(
        validateCards([
          {
            ...validDaily,
            approve: { ...daily.approve, schedule: { card: thanks.id, years } },
          },
          thanks,
        ]),
      ).toContain('[0] schedule.years must be a nonnegative integer');
    },
  );
  it.each([undefined, '', 'missing', 'daily', 1])(
    'rejects schedule target %s',
    (card) => {
      expect(
        validateCards([
          {
            ...validDaily,
            approve: { ...daily.approve, schedule: { card, years: 1 } },
          },
          thanks,
        ]),
      ).toContain('[0] schedule.card must reference a scheduled-trigger card');
    },
  );
  it('rejects existing targets with a year or after trigger', () => {
    for (const trigger of [
      { year: 0, order: 0 },
      { after: 'met', years: 1, order: 0 },
    ]) {
      expect(validateCards([source, { ...thanks, trigger }])).toContain(
        '[0] schedule.card must reference a scheduled-trigger card',
      );
    }
  });
  it.each([
    { scheduled: false, order: 1 },
    { scheduled: 'true', order: 1 },
    { scheduled: true },
    { scheduled: true, order: -1 },
    { scheduled: true, order: 0.5 },
    { scheduled: true, year: 0, order: 1 },
    { scheduled: true, after: 'met', years: 1, order: 1 },
    { scheduled: true, years: 1, order: 1 },
  ])('rejects malformed scheduled trigger %j', (trigger) => {
    expect(validateCards([{ ...thanks, trigger }])).toContain(
      '[0] invalid story/fixed trigger',
    );
  });
  it('forbids scheduled triggers on daily and special cards', () => {
    for (const kind of ['daily', 'special']) {
      expect(
        validateCards([{ ...daily, kind, trigger: thanks.trigger }]),
      ).toContain('[0] trigger is only allowed on story/fixed cards');
    }
  });
  it.each([0, -1, 0.5, '50', null, Infinity])('rejects period %s', (period) => {
    expect(validateCards([{ ...kids, period }, thanks])).toContain(
      '[0] period must be a positive integer on special cards',
    );
  });
  it.each(['story', 'fixed', 'daily'])('forbids period on %s', (kind) => {
    expect(validateCards([{ ...validDaily, kind, period: 50 }])).toContain(
      '[0] period must be a positive integer on special cards',
    );
  });
});
