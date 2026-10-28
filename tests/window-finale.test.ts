import { describe, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import { END_YEAR, GAUGE_KEYS, SLEEP_TURNS } from '../src/core/config';
import { dueYear, nextDocument } from '../src/core/deck';
import {
  canRewind,
  dismissScene,
  processDocument,
  rewind,
} from '../src/core/loop';
import { initialState, type Card, type State } from '../src/core/state';
import { mulberry32, simulate } from '../tools/simulate';
import { validateCards } from '../tools/validate-cards';

const cards = raw as Card[];
// The elf windows share a range.
const windowed = cards
  .filter(
    (c) =>
      c.trigger?.from !== undefined &&
      c.variant?.group === 'elves' &&
      c.variant.pool === 1,
  )
  .map(({ variant: _, ...card }) => card);
const windows = windowed.filter(
  (c) =>
    c.trigger!.from === windowed[0]!.trigger!.from &&
    c.trigger!.to === windowed[0]!.trigger!.to,
);
const window = windows[0]!;
const range = window.trigger!;
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  conditions: undefined,
  reject: { label: 'Reject', effects: {} },
  approve: { label: 'Approve', effects: {} },
};
const finale = cards.find(
  (c) => c.kind === 'story' && c.trigger?.year === END_YEAR,
)!;
const draw = (state: State, pool = [daily, ...windows]) =>
  nextDocument(state, pool, () => 0.5);
const resolve = (state: State, pool: Card[]) =>
  processDocument(state, 'approve', pool, () => 0.5);

describe('year advancement', () => {
  it.each([
    ...new Set(
      cards
        .filter(
          (c) =>
            c.trigger?.year !== undefined &&
            c.bossAfter === undefined &&
            c.trigger.year >= 3,
        )
        .map((c) => c.trigger!.year!),
    ),
  ])('stops a three-year daily at the pending year-%s event', (year) => {
    const story = cards.find(
      (c) =>
        (c.kind === 'story' || c.kind === 'fixed') && c.trigger?.year === year,
    )!;
    const arriving = resolve(
      {
        ...initialState(),
        year: year === END_YEAR ? 199 : year - 2,
        current: { ...daily, years: 3 },
      },
      [daily, story],
    );
    expect(arriving.year).toBe(year);
    expect(arriving.current?.id).toBe(story.id);
  });

  it('clamps to END_YEAR and begins the boss', () => {
    const ended = resolve(
      { ...initialState(), year: 199, current: { ...daily, years: 3 } },
      cards,
    );
    expect(ended.year).toBe(END_YEAR);
    expect(ended.current?.id).toBe('story_avalanche');
  });

  it.each(['fixed', 'window', 'after', 'scheduled'])(
    'uses the earliest pending %s due year and ignores consumed cards',
    (kind) => {
      const mandatory: Card = {
        ...finale,
        id: 'mandatory',
        kind: 'fixed',
        trigger:
          kind === 'window'
            ? { from: 100, to: 101, order: 0 }
            : kind === 'after'
              ? { after: 'ready', years: 2, order: 0 }
              : kind === 'scheduled'
                ? { scheduled: true, order: 0 }
                : { year: 100, order: 0 },
      };
      const state: State = {
        ...initialState(),
        year: 98,
        current: { ...daily, years: 3 },
        flagYears: { ready: 98 },
        windowYears: { mandatory: 100 },
        scheduled: { mandatory: 100 },
        seen: kind === 'scheduled' ? ['mandatory'] : [],
      };
      const pool = [daily, mandatory];
      expect(resolve(state, pool).year).toBe(100);
      expect(
        resolve({ ...state, seen: ['mandatory'], scheduled: {} }, pool).year,
      ).toBe(101);
      expect(
        resolve({ ...state, current: { ...daily, years: 0 } }, pool).year,
      ).toBe(98);
    },
  );
});

describe('mandatory cards deferred during sleep', () => {
  const quiet = { ...daily, years: 1 };

  it('draws an overdue fixed card immediately after the final sleeping stamp', () => {
    const renewa = cards.find((c) => c.id === 'fixed_renewa_theater')!;
    const year = renewa.trigger!.from!;
    const assigned = { [renewa.id]: year };
    const pool = [quiet, renewa];
    let state = processDocument(
      {
        ...initialState(),
        year: year - 1,
        windowYears: assigned,
        current: quiet,
        drowse: { stack: 2, left: 1 },
      },
      'axe',
      pool,
      () => 0.5,
    );
    expect(state.year).toBe(year);
    expect(state.sleep).toBe(SLEEP_TURNS);
    expect(state.scene).toBe('asleep');
    state = dismissScene(state);
    for (let remaining = SLEEP_TURNS; remaining > 0; remaining--) {
      expect(state.current?.id).toBe(quiet.id);
      expect(state.seen).not.toContain(renewa.id);
      state = resolve(state, pool);
      expect(state.sleep).toBe(remaining - 1);
    }
    expect(state.year).toBe(year + SLEEP_TURNS);
    expect(state.current?.id).toBe(renewa.id);
  });

  it.each(['daily', 'special', 'speaki'] as const)(
    'uses the normal %s draw while a mandatory card is due',
    (kind) => {
      const random: Card = {
        ...quiet,
        id: kind,
        kind,
        axe: kind === 'speaki' ? 'free' : true,
      };
      const mandatory: Card = { ...finale, trigger: { year: 0, order: 0 } };
      const state = nextDocument(
        { ...initialState(), sleep: 1 },
        [quiet, random, mandatory],
        () => 0,
      );
      expect(state.current?.kind).toBe(kind);
      expect(state.seen).not.toContain(mandatory.id);
    },
  );

  it('preserves due dates, scheduled entries and expired windows, then drains the usual queue exactly once', () => {
    const year = range.to!;
    const base: Card = {
      ...finale,
      years: 0,
      reject: quiet.reject,
      approve: quiet.approve,
    };
    const scheduled: Card = {
      ...base,
      id: 'scheduled',
      trigger: { scheduled: true, order: 0 },
    };
    const fixed: Card = {
      ...base,
      kind: 'fixed',
      id: 'fixed',
      trigger: { year, order: 1 },
    };
    const after: Card = {
      ...base,
      id: 'after',
      trigger: { after: 'ready', years: 1, order: 2 },
    };
    const expired: Card = {
      ...base,
      id: 'window',
      trigger: { from: year, to: year, order: 3 },
    };
    const queue = [scheduled, fixed, after, expired];
    const pool = [quiet, ...[...queue].reverse()];
    let state = draw(
      {
        ...initialState(),
        year,
        sleep: SLEEP_TURNS,
        flags: ['ready'],
        flagYears: { ready: year - 1 },
        scheduled: { [scheduled.id]: year },
      },
      pool,
    );
    const windowYears = state.windowYears;
    expect(windowYears[expired.id]).toBe(year);
    for (let remaining = SLEEP_TURNS; remaining > 0; remaining--) {
      expect(state.current?.id).toBe(quiet.id);
      expect(state.scheduled[scheduled.id]).toBe(year);
      expect(state.seen).toEqual([]);
      state = resolve(state, pool);
      expect(state.windowYears).toEqual(windowYears);
    }
    expect(state.year).toBeGreaterThan(expired.trigger!.to!);
    for (const card of queue) {
      expect(state.current?.id).toBe(card.id);
      state = resolve(state, pool);
    }
    expect(state.scheduled[scheduled.id]).toBeUndefined();
    expect(state.seen).toEqual(queue.map((c) => c.id));
    expect(state.current?.id).toBe(quiet.id);
  });

  it('wakes at END_YEAR and skips older mandatory cards', () => {
    const earlier: Card = {
      ...finale,
      id: 'earlier',
      trigger: { year: END_YEAR - 1, order: 0 },
    };
    const pool = [quiet, finale, earlier, ...cards.filter((c) => c.boss)];
    let state = draw(
      { ...initialState(), year: END_YEAR - 1, sleep: SLEEP_TURNS },
      pool,
    );
    expect(state.current?.id).toBe(quiet.id);
    state = resolve(state, pool);
    expect(state.year).toBe(END_YEAR);
    expect(state.sleep).toBe(0);
    expect(state.drowse).toEqual({ stack: 0, left: 0 });
    expect(state.current?.id).toBe(finale.id);
    expect(state.ending).toBeNull();
    state = resolve(state, pool);
    expect(state.seen).toEqual([finale.id]);
    expect(state.current?.boss).toBe('cleanup');
  });

  it('terminates seeded simulations that repeatedly fall asleep across END_YEAR', () => {
    // A repeatable daily with forged effects forces sleep without gauge damage.
    const repeatingFake: Card = { ...quiet, axe: 'free' };
    const start: Card = {
      ...finale,
      id: 'start',
      years: END_YEAR - 3,
      trigger: { year: 0, order: 0 },
      reject: quiet.reject,
      approve: quiet.approve,
    };
    const pool = [
      start,
      repeatingFake,
      finale,
      ...cards
        .filter((c) => c.boss)
        .map((c) => ({ ...c, reject: quiet.reject, approve: quiet.approve })),
    ];
    const result = simulate('balanced', 10, 9, pool);
    expect(result.trueEndingPct).toBe(100);
    expect(result.docs.avg).toBe(15);
    expect(result.years.avg).toBe(END_YEAR);
    expect(simulate('balanced', 10, 9, pool)).toEqual(result);
  });
});

describe('window triggers', () => {
  it('picks inclusive uniform integer years once using the run RNG without mutating input', () => {
    const before = initialState();
    const rng = vi.fn(() => 0.5);
    const first = nextDocument(
      { ...before, year: Math.max(...windows.map((c) => c.trigger!.to!)) },
      windows,
      rng,
    );
    expect(rng).toHaveBeenCalledTimes(windows.length);
    expect(before.windowYears).toEqual({});
    for (const card of windows) {
      const t = card.trigger!;
      for (const roll of [0, 0.25, 0.5, 0.999999]) {
        const s = nextDocument(before, [daily, card], () => roll);
        expect(s.windowYears[card.id]).toBe(
          t.from! + Math.floor(roll * (t.to! - t.from! + 1)),
        );
        expect(dueYear(card, s)).toBeGreaterThanOrEqual(t.from!);
        expect(dueYear(card, s)).toBeLessThanOrEqual(t.to!);
      }
    }
    rng.mockClear();
    nextDocument({ ...first, current: null, year: range.to! }, windows, rng);
    expect(rng).not.toHaveBeenCalled();
    const seeded = (seed: number) =>
      nextDocument(before, [daily, ...windows], mulberry32(seed)).windowYears;
    expect(seeded(11)).toEqual(seeded(11));
    expect(seeded(11)).not.toEqual(seeded(12));
  });

  it('shares due-year/order sorting, catches overdue jumps, and never shows a window twice', () => {
    const tied: Card = {
      ...window,
      id: 'tied',
      kind: 'story',
      years: 0,
      trigger: { year: range.to!, order: range.order + 1 },
    };
    const pool = [daily, tied, ...windows];
    let s = nextDocument(initialState(), pool, () => 0.999999);
    const years = s.windowYears;
    expect(s.current?.id).toBe(daily.id);
    s = resolve(
      {
        ...s,
        year: range.to! - 1,
        current: { ...daily, years: daily.years + 1 },
      },
      pool,
    );
    for (const card of [...windows, tied]) {
      expect(s.current?.id).toBe(card.id);
      s = resolve({ ...s, gauges: initialState().gauges }, pool);
    }
    expect(s.current?.id).toBe(daily.id);
    expect(s.windowYears).toEqual(years);
    expect(s.seen).toEqual([...windows, tied].map((c) => c.id));
  });

  it('retains picks and seen cards through rewind, including overdue unseen cards', () => {
    const pool = [daily, ...windows];
    const picked = nextDocument(initialState(), pool, () => 0);
    const seen = windows[0]!;
    const failed: State = {
      ...picked,
      year: range.to!,
      seen: [seen.id],
      boons: { rewind: true },
      ending: { id: 'sugar_low' },
      current: null,
    };
    expect(canRewind(failed)).toBe(true);
    let s = rewind(failed, pool, () => {
      throw new Error('Unexpected RNG draw');
    });
    expect(s.windowYears).toEqual(picked.windowYears);
    for (const card of windows.slice(1)) {
      expect(s.current?.id).toBe(card.id);
      s = resolve({ ...s, gauges: initialState().gauges }, pool);
    }
    expect(s.current?.id).toBe(daily.id);
    expect(s.seen.filter((id) => id === seen.id)).toHaveLength(1);
  });
});

describe('boss and finale queue', () => {
  it.each([1, 7, 42, 1234])('interleaves the boss documents for seed %s', (seed) => {
    const rng = mulberry32(seed);
    let state = nextDocument(
      { ...initialState(), year: 200 },
      cards,
      rng,
    );
    expect(state.current?.id).toBe('story_avalanche');
    state = processDocument(state, 'approve', cards, rng);
    expect(state.current?.id).toBe('fixed_chloe_tailor');
    state = processDocument(state, 'approve', cards, rng);
    const drawn: string[] = [];
    const beats: Record<number, string> = {
      2: 'story_finale_no_reply',
      4: 'story_finale_witch_queen',
    };
    for (let n = 1; n <= 10; n++) {
      expect(state.current?.boss).toBe(n <= 2 ? 'cleanup' : 'unrest');
      if (n !== 5) expect(state.current?.id).not.toBe('boss_sugar_cut');
      if (n !== 10) expect(state.current?.id).not.toBe('boss_sugar_rebellion');
      if (n === 5) expect(state.current?.id).toBe('boss_sugar_cut');
      if (n === 10) expect(state.current?.id).toBe('boss_sugar_rebellion');
      drawn.push(state.current!.id);
      state = processDocument(
        { ...state, gauges: initialState().gauges },
        'approve',
        cards,
        rng,
      );
      expect(state.year).toBe(200);
      expect(state.boss?.done).toBe(n);
      if (n >= 5 && n < 10) {
        expect(state.statuses.find((s) => s.id === 'sugar_cut')).toMatchObject({
          left: 1,
          tick: { sugar: -2 },
        });
        const neutral: Card = {
          ...daily,
          kind: 'fixed',
          boss: undefined,
          bossAfter: undefined,
          bossAt: undefined,
          status: undefined,
          approve: { label: 'x', effects: {} },
        };
        const ticked = processDocument(
          { ...state, current: neutral, sleep: 0, gauges: initialState().gauges, statuses: state.statuses.filter((s) => s.id === 'sugar_cut') },
          'approve',
          cards,
          rng,
        );
        expect(ticked.gauges.sugar).toBe(initialState().gauges.sugar - 2);
        expect(ticked.statuses.some((s) => s.id === 'sugar_cut')).toBe(true);
      }
      if (beats[n]) {
        expect(state.current?.id).toBe(beats[n]);
        state = processDocument(state, 'approve', cards, rng);

      }
    }
    expect(new Set(drawn).size).toBe(10);
    for (const id of [
      'story_escape_1',
      'story_escape_2',
      'story_escape_3',
      'story_escape_4',
      'story_finale_light',
      'story_finale_stranger',
    ]) {
      expect(state.current?.id).toBe(id);
      state = processDocument(state, 'approve', cards, rng);
    }
    expect(state.ending?.id).toBe('true');
    expect(state.statuses.some((s) => s.id === 'sugar_cut')).toBe(false);
  });
  it.each(['approve', 'reject'] as const)('starts the cut on %s and blocks discards', (side) => {
    const cut = cards.find((c) => c.id === 'boss_sugar_cut')!;
    const state = { ...initialState(), year: 200, current: cut, boss: { done: 4, drawn: [] }, boons: { bullet: 2 } };
    expect(processDocument(state, 'axe', cards, () => 0.5)).toBe(state);
    expect(processDocument(state, 'bullet', cards, () => 0.5)).toBe(state);
    const resolved = processDocument(state, side, cards, () => 0.5);
    expect(resolved.statuses.some((s) => s.id === 'sugar_cut')).toBe(true);
  });
  it('rewinds across slot 5 and draws the cut again without its status', () => {
    let state = nextDocument({ ...initialState(), year: 200, boons: { rewind: true } }, cards, () => 0.5);
    while ((state.boss?.done ?? 0) < 7) {
      state = processDocument({ ...state, gauges: initialState().gauges, scene: null, sleep: 0 }, 'approve', cards, () => 0.5);
    }
    expect(state.statuses.some((s) => s.id === 'sugar_cut')).toBe(true);
    state = rewind({ ...state, ending: { id: 'sugar_low' } }, cards, () => 0.5);
    expect(state.boss?.done).toBe(4);
    expect(state.current?.id).toBe('boss_sugar_cut');
    expect(state.statuses.some((s) => s.id === 'sugar_cut')).toBe(false);
  });
  it('validates bossAt values and uniqueness', () => {
    const card = cards.find((c) => c.id === 'boss_sugar_cut')!;
    for (const value of [0, 11, 1.5])
      expect(validateCards([{ ...card, bossAt: value }])).toContain('[0] invalid bossAt');
    expect(validateCards([{ ...card, boss: undefined }])).toContain('[0] invalid bossAt');
    expect(validateCards([card, { ...card, id: 'another' }])).toContain('[1] duplicate bossAt');
  });
  it('wakes when the boss begins and preserves normal gauge endings', () => {
    const state = resolve(
      { ...initialState(), year: 199, current: daily, sleep: 2 },
      cards,
    );
    expect(state.sleep).toBe(0);
    expect(state.current?.id).toBe('story_avalanche');
    const fatal = {
      ...daily,
      approve: { label: 'fatal', effects: { sugar: -20 } },
    };
    const dead = processDocument(
      { ...state, current: fatal, gauges: { ...state.gauges, sugar: 1 } },
      'approve',
      cards,
      () => 0.5,
    );
    expect(dead.ending).toBeNull();
    expect(dead.scene).toBe('kickout');
    expect(dead.gauges.sugar).toBe(3);
  });
});

describe('window validation', () => {
  it.each(['story', 'fixed'] as const)(
    'accepts %s windows including a single year and zero',
    (kind) => {
      for (const trigger of [range, { from: 0, to: 0, order: 0 }])
        expect(
          validateCards([
            {
              ...window,
              kind,
              axe: false,
              trigger,
              reject: daily.reject,
              approve: daily.approve,
            },
          ]),
        ).toEqual([]);
    },
  );
  it.each([
    { from: -1, to: 2, order: 0 },
    { from: 0.5, to: 2, order: 0 },
    { from: 0, to: 1.5, order: 0 },
    { from: 2, to: 1, order: 0 },
    { from: 0, order: 0 },
    { to: 1, order: 0 },
    { from: 0, to: 1, order: -1 },
    { from: 0, to: 1, order: 0.5 },
    ...[{ year: 0 }, { after: 'ready', years: 1 }, { scheduled: true }].map(
      (extra) => ({ ...range, ...extra }),
    ),
  ])('rejects malformed or mixed window %j', (trigger) => {
    expect(validateCards([{ ...window, trigger }])).toContain(
      '[0] invalid story/fixed trigger',
    );
  });
  it.each(['daily', 'special'])('rejects windows on %s cards', (kind) => {
    expect(validateCards([{ ...window, kind }])).toContain(
      '[0] trigger is only allowed on story/fixed cards',
    );
  });
});
