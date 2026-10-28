import { describe, expect, it } from 'vitest';
import rawCards from '../data/cards/m1.json';
import { statusGauges, statusesReplacedBy } from '../src/core/status';
import { choiceEffects, processDocument, rewind } from '../src/core/loop';
import {
  initialState,
  recordSnapshot,
  type ActiveStatus,
  type Card,
  type State,
} from '../src/core/state';

const daily: Card = {
  id: 'daily_test',
  kind: 'daily',
  tier: 1,
  speaker: 'ner',
  faction: 'x',
  title: 'test',
  text: 'test',
  years: 1,
  axe: true,
  reject: { label: 'no', effects: {} },
  approve: { label: 'yes', effects: {} },
};
const active = (extra: Partial<ActiveStatus> = {}): ActiveStatus => ({
  id: 'ember',
  left: 2,
  source: daily.id,
  tick: { sugar: -2 },
  ...extra,
});
const start = (extra: Partial<State> = {}): State => ({
  ...initialState(),
  current: structuredClone(daily),
  ...extra,
});
const resolve = (
  state: State,
  action: 'reject' | 'approve' | 'axe' | 'bullet' | 'alice' = 'approve',
) =>
  processDocument(
    state,
    action,
    [daily, { ...daily, id: 'daily_other' }],
    () => 0.5,
  );

describe('lingering statuses', () => {
  it('starts after the host, ticks once per document, and expires', () => {
    const state = start();
    state.current!.approve.status = {
      id: 'ember',
      turns: 2,
      tick: { sugar: -2 },
    };
    const host = resolve(state);
    expect(host.gauges.sugar).toBe(50);
    expect(host.statuses[0]).toMatchObject({ left: 2, source: daily.id });
    const first = resolve(host);
    expect(first.gauges.sugar).toBe(48);
    expect(first.statuses[0]!.left).toBe(1);
    const last = resolve(first);
    expect(last.gauges.sugar).toBe(46);
    expect(last.statuses).toEqual([]);
    expect(resolve(last).gauges.sugar).toBe(46);
  });
  it.each(['daily', 'special', 'speaki', 'fixed'] as const)(
    'keeps authored %s status values at year 150',
    (kind) => {
      const state = start({ year: 150 });
      state.current!.kind = kind;
      if (kind === 'speaki') state.current!.axe = 'free';
      state.current!.approve.status = {
        id: 'ember',
        turns: 2,
        tick: { sugar: -3 },
        delayed: { faith: 10 },
      };
      const result = resolve(state);
      expect(result.statuses[0]!.tick!.sugar).toBe(-3);
      expect(result.statuses[0]!.delayed!.faith).toBe(10);
      expect(resolve(result).statuses[0]!.tick!.sugar).toBe(-3);
    },
  );
  it('fires a delayed hit exactly once', () => {
    const state = start({
      statuses: [active({ tick: undefined, delayed: { faith: -20 } })],
    });
    const first = resolve(state);
    expect(first.gauges.faith).toBe(50);
    const last = resolve(first);
    expect(last.gauges.faith).toBe(30);
    expect(resolve(last).gauges.faith).toBe(30);
  });
  it.each([
    [1.5, 5, 10],
    [1.5, -15, -25],
    [0.5, 5, 5],
    [0.5, -15, -10],
    [0.5, 0, 0],
  ] as const)('rounds factor %s delta %s to %s', (factor, delta, expected) => {
    expect(
      choiceEffects(
        { label: '', effects: { sugar: delta } },
        initialState().gauges,
        'fixed',
        0,
        [active({ scale: { gauge: 'sugar', factor } })],
      ).sugar,
    ).toBe(expected);
  });
  it('freezes card changes, ticks and delayed hits until the following document', () => {
    const state = start({
      statuses: [
        active({
          id: 'hibernation',
          left: 1,
          freeze: 'sugar',
          tick: undefined,
        }),
        active({ delayed: { sugar: -10 }, left: 1 }),
      ],
    });
    state.current!.approve.effects.sugar = -20;
    const result = resolve(state);
    expect(result.gauges.sugar).toBe(50);
    expect(result.statuses).toEqual([]);
    expect(state.statuses[0]!.left).toBe(1);
  });
  it('locks axe but allows bullet and passes time on both discard tools', () => {
    const locked = start({
      statuses: [active({ axeLock: true })],
      boons: { bullet: 2 },
    });
    expect(resolve(locked, 'axe')).toBe(locked);
    const bullet = resolve(locked, 'bullet');
    expect(bullet.gauges.sugar).toBe(48);
    expect(bullet.statuses[0]!.left).toBe(1);
    expect(bullet.boons.bullet).toBe(1);
    expect(resolve(start({ statuses: [active()] }), 'axe').gauges.sugar).toBe(
      48,
    );
  });
  it('resets drowse only on expiry', () => {
    const state = start({
      drowse: { stack: 2, left: 5 },
      statuses: [active({ drowseReset: true })],
    });
    const first = resolve(state);
    expect(first.drowse.stack).toBe(2);
    expect(resolve(first).drowse).toEqual({ stack: 0, left: 0 });
  });
  it('replaces a positive tick with a negative tick on the same gauge', () => {
    const state = start({
      statuses: [active({ id: 'sprout', tick: { people: 2 } })],
    });
    state.current!.approve.status = {
      id: 'strike',
      turns: 3,
      tick: { people: -2 },
    };
    const result = resolve(state);
    expect(result.gauges.people).toBe(52);
    expect(result.statuses).toEqual([
      { id: 'strike', left: 3, source: daily.id, tick: { people: -2 } },
    ]);
  });
  it.each([
    { id: 'sprout', turns: 3, tick: { faith: 1 } },
    { id: 'ember', turns: 3, freeze: 'faith' as const },
    { id: 'strike', turns: 3, delayed: { people: -10 } },
    {
      id: 'strike',
      turns: 3,
      scale: { gauge: 'sugar' as const, factor: 1.5 as const },
    },
  ])('agrees with replacement preview for $id and caps at two', (incoming) => {
    const state = start({
      statuses: [
        active({ left: 5 }),
        active({ id: 'strike', left: 5, tick: { people: 2 } }),
      ],
    });
    state.current!.approve.status = incoming;
    const replaced = statusesReplacedBy(state.statuses, incoming);
    const result = resolve(state);
    expect(result.statuses.map((s) => s.id)).toEqual([
      ...state.statuses.filter((s) => !replaced.includes(s)).map((s) => s.id),
      incoming.id,
    ]);
    expect(result.statuses.length).toBeLessThanOrEqual(2);
    expect(statusesReplacedBy(state.statuses, undefined)).toEqual([]);
  });
  it.each(['priest', 'apprentice', 'bishop'] as const)(
    'keeps the axe locked for three documents in %s mode',
    (mode) => {
      const cards = rawCards as Card[];
      const card = (id: string) =>
        structuredClone(cards.find((c) => c.id === id)!);
      let state: State = {
        ...initialState(mode, () => 0.5),
        year: 20,
        drowse: { stack: 1, left: 10 },
        current: card('daily_guard_axe_repair'),
      };
      const stamp = (id: string, side: 'reject' | 'approve' = 'approve') => {
        state = processDocument(
          { ...state, current: card(id) },
          side,
          cards,
          () => 0.5,
        );
      };
      // "아직 쓸 만해요… 아마도요." — refusing the repair dulls the axe
      stamp('daily_guard_axe_repair', 'reject');
      for (const [id, left] of [
        ['daily_witch_ticking_parcel', 2],
        ['daily_villager_hibernation', 1],
      ] as const) {
        stamp(id);
        expect(state.statuses.find((s) => s.id === 'dull_axe')?.left).toBe(
          left,
        );
        expect(processDocument(state, 'axe', cards, () => 0.5)).toBe(state);
      }
      expect(state.statuses.map((s) => s.id)).toEqual([
        'dull_axe',
        'ticking_parcel',
        'hibernation',
      ]);
      state = processDocument(
        { ...state, current: structuredClone(daily) },
        'approve',
        cards,
        () => 0.5,
      );
      expect(state.statuses.some((s) => s.id === 'dull_axe')).toBe(false);
    },
  );
  it.each(['priest', 'apprentice', 'bishop'] as const)(
    'does not evict gauge statuses when an axe lock arrives in %s mode',
    (mode) => {
      const state = start({
        ...initialState(mode, () => 0.5),
        current: structuredClone(daily),
        statuses: [
          active({ left: 5 }),
          active({ id: 'strike', left: 5, tick: { people: 2 } }),
        ],
      });
      state.current!.approve.status = {
        id: 'axe_repair',
        turns: 3,
        axeLock: true,
      };
      expect(resolve(state).statuses.map((s) => s.id)).toEqual([
        'ember',
        'strike',
        'axe_repair',
      ]);
    },
  );
  it('counts cap overflow after expiring old statuses', () => {
    const state = start({
      statuses: [
        active({ left: 5 }),
        active({ id: 'strike', left: 1, tick: { people: 2 } }),
      ],
    });
    state.current!.approve.status = { id: 'sprout', turns: 3, freeze: 'faith' };
    const survivors = state.statuses.filter((s) => s.left > 1);
    expect(
      statusesReplacedBy(survivors, state.current!.approve.status),
    ).toEqual([]);
    expect(resolve(state).statuses.map((s) => s.id)).toEqual([
      'ember',
      'sprout',
    ]);
  });
  it('collects only valid, deduplicated gauges from every status effect', () => {
    expect(
      statusGauges({
        id: 'ember',
        turns: 2,
        tick: { people: 2 },
        delayed: { people: -10, faith: 5 },
        scale: { gauge: 'faith', factor: 1.5 },
        freeze: 'sugar',
      }),
    ).toEqual(['sugar', 'people', 'faith']);
    expect(statusGauges({ id: 'axe_repair', turns: 2, axeLock: true })).toEqual(
      [],
    );
  });
  it.each([
    [-5, 2, 1],
    [5, 98, 99],
  ] as const)(
    'clamps status delta %s at the safe boundary',
    (delta, value, expected) => {
      const state = start({
        statuses: [
          active({
            tick: { sugar: delta },
            delayed: { sugar: delta },
            left: 1,
          }),
        ],
      });
      state.gauges.sugar = value;
      const result = resolve(state);
      expect(result.gauges.sugar).toBe(expected);
      expect(result.ending).toBeNull();
    },
  );
  it('card deltas still kill even with a healing status', () => {
    const state = start({ statuses: [active({ tick: { sugar: 5 } })] });
    state.gauges.sugar = 5;
    state.current!.approve.effects.sugar = -10;
    expect(resolve(state).ending?.id).toBe('sugar_low');
  });
  it('does not pass time on Alice reroll or a zero-year story', () => {
    const state = start({ boons: { alice: true }, statuses: [active()] });
    const reroll = resolve(state, 'alice');
    expect(reroll.current!.id).not.toBe(daily.id);
    expect(reroll.statuses).toEqual(state.statuses);
    expect(reroll.gauges).toEqual(state.gauges);
    state.current!.kind = 'story';
    state.current!.years = 0;
    expect(resolve(state).statuses).toEqual(state.statuses);
  });
  it('rewind restores an independent copy of statuses', () => {
    const state = recordSnapshot(
      start({ year: 160, boons: { rewind: true }, statuses: [active()] }),
    );
    const dead = {
      ...state,
      year: 166,
      statuses: [],
      ending: { id: 'sugar_low' },
    };
    const restored = rewind(dead, [daily], () => 0.5);
    expect(restored.statuses).toEqual(state.statuses);
    restored.statuses[0]!.left = 9;
    expect(state.past[0]!.statuses[0]!.left).toBe(2);
  });
});
