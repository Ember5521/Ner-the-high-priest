import { describe, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import system from '../data/system.json';
import { END_YEAR, ERA_SCALE, GAUGE_KEYS } from '../src/core/config';
import { nextDocument, rerollDaily } from '../src/core/deck';
import { choiceEffects, processDocument, rewind } from '../src/core/loop';
import { initialState, type Card, type State } from '../src/core/state';
import { previewFor } from '../src/ui/gauges';
import { mulberry32 } from '../tools/simulate';

const daily: Card = {
  ...(raw as Card[]).find((c) => c.kind === 'daily')!,
  id: 'quiet',
  conditions: undefined,
  years: 1,
  reject: { label: 'Reject', effects: {} },
  approve: { label: 'Approve', effects: {} },
};
const danger: Card = {
  ...daily,
  reject: { label: 'Reject', effects: { sugar: -100 } },
  approve: {
    label: 'Approve',
    effects: { people: 5 },
    setFlags: ['safe'],
    relations: { test: 2 },
    grant: { boon: 'rewind' },
  },
};
const unavoidable: Card = {
  ...daily,
  kind: 'fixed',
  axe: false,
  reject: {
    label: 'Reject',
    effects: { sugar: -100, people: 100, faith: -50, erpin: 5 },
    setFlags: ['chosen'],
    relations: { test: 1 },
    grant: { boon: 'bullet' },
  },
  approve: { label: 'Approve', effects: { erpin: 100 } },
};
const resolve = (card: Card, state = initialState(), roll = 0) =>
  processDocument(
    { ...state, scene: null, current: card },
    'reject',
    [daily],
    () => roll,
  );

describe('rescue scenes', () => {
  const rescues = [
    ['stitch', danger, { boons: { stitch: true } }],
    ['erpinSave', danger, { sleep: 1 }],
  ] as const;

  it.each(rescues)(
    'shows %s only on the rescued document',
    (scene, card, patch) => {
      const rescued = resolve(card, { ...initialState(), ...patch });
      expect(rescued.scene).toBe(scene);
      expect(rescued.ending).toBeNull();
      expect(resolve(daily, rescued).scene).toBeNull();
      expect(processDocument(rescued, 'approve', [daily], () => 0)).toBe(
        rescued,
      );
    },
  );

  it.each(rescues)('suppresses %s at the true ending', (_, card, patch) => {
    const ended = resolve(card, {
      ...initialState(),
      ...patch,
      year: END_YEAR,
      boss: { done: 10, drawn: [] },
    });
    expect(ended.ending).toEqual({ id: 'true' });
    expect(ended.scene).toBeNull();
  });

  it('keeps axe and missed scenes ahead of rescues', () => {
    for (const action of ['axe', 'approve'] as const) {
      const card: Card = {
        ...daily,
        axe: 'free',
        axeResult: { scene: 'speakiCaught' },
        missed: { scene: 'speakiFooled' },
      };
      const rescued = processDocument(
        {
          ...initialState(),
          current: card,
          gauges: { ...initialState().gauges, sugar: 0 },
          boons: { stitch: true },
        },
        action,
        [daily],
        () => 0,
      );
      expect(rescued.stitched).toBe(true);
      expect(rescued.scene).toBe(
        action === 'axe' ? 'speakiCaught' : 'speakiFooled',
      );
    }
  });

  it('defines every engine scene key in system.scenes', () => {
    const keys = [
      processDocument(
        { ...initialState(), current: daily, drowse: { stack: 2, left: 1 } },
        'axe',
        [daily],
        () => 0,
      ).scene,
      processDocument({ ...initialState(), current: danger, year: END_YEAR, boss: { done: 0, drawn: [] } }, 'reject', raw as Card[], () => 0).scene,
      ...rescues.map(
        ([, card, patch]) =>
          resolve(card, { ...initialState(), ...patch }).scene,
      ),
      ...(raw as Card[]).flatMap((card) => [
        card.axeResult?.scene,
        card.missed?.scene,
      ]),
    ].filter((key) => key != null);
    expect(new Set(keys)).toEqual(new Set(Object.keys(system.scenes)));
  });
});

describe('fairness rules', () => {
  it.each(['reject', 'approve'] as const)(
    'replaces a lethal sleeping %s with the safe stamp and its side effects',
    (side) => {
      const card =
        side === 'reject'
          ? danger
          : {
              ...danger,
              reject: danger.approve,
              approve: danger.reject,
            };
      const before = { ...initialState(), sleep: 1 };
      const after = resolve(card, before, side === 'reject' ? 0 : 0.9);
      expect(after.erpinSaved).toBe(true);
      expect(after.ending).toBeNull();
      expect(after.gauges).toEqual({ ...before.gauges, people: 55 });
      expect(after.flags).toContain('safe');
      expect(after.relations.test).toBe(2);
      expect(after.boons.rewind).toBe(true);
      expect(after.sleep).toBe(0);
      expect(before.erpinSaved).toBe(false);
    },
  );

  it('saves once per run, including after a rewind', () => {
    const saved = resolve(danger, { ...initialState(), year: 130, sleep: 1 });
    const dead = resolve(danger, { ...saved, sleep: 1 });
    expect(dead.ending).toEqual({ id: 'sleep', cause: 'sugar_low' });
    const revived = rewind(dead, [daily], () => 0.5);
    expect(revived.erpinSaved).toBe(true);
    expect(revived.ending).toBeNull();
    expect(resolve(danger, { ...revived, sleep: 1 }).ending?.id).toBe('sleep');
    expect(initialState().erpinSaved).toBe(false);
  });

  it('does not spend the save on safe rolls, awake stamps or forged effects', () => {
    expect(
      resolve(danger, { ...initialState(), sleep: 1 }, 0.9).erpinSaved,
    ).toBe(false);
    const awake = resolve(danger);
    expect(awake.erpinSaved).toBe(false);
    expect(awake.ending?.cause).toBe('sugar_low');
    const fake = resolve(
      { ...danger, kind: 'speaki', axe: 'free' },
      { ...initialState(), sleep: 1 },
    );
    expect(fake.gauges).toEqual(initialState().gauges);
    expect(fake.erpinSaved).toBe(false);
  });

  it.each([0, 1])(
    'ends the game on a both-sides-fatal axe-forbidden card with sleep=%s',
    (sleep) => {
      const after = resolve(unavoidable, { ...initialState(), sleep });
      expect(after.gauges).toEqual({
        sugar: 0,
        people: 100,
        faith: 0,
        erpin: 55,
      });
      expect(after.ending).toEqual({
        id: sleep ? 'sleep' : 'sugar_low',
        cause: 'sugar_low',
      });
      expect(after.scene).toBeNull();
      expect(after.erpinSaved).toBe(false);
      expect(after.flags).toContain('chosen');
      expect(after.relations.test).toBe(1);
      expect(after.boons.bullet).toBeGreaterThan(0);
    },
  );

  it.each(GAUGE_KEYS)(
    'ends the game at exact boundaries and overshoots for %s',
    (key) => {
      for (const delta of [-100, -50, 50, 100]) {
        const result = { label: 'Stamp', effects: { [key]: delta } };
        const after = resolve({
          ...unavoidable,
          reject: result,
          approve: result,
        });
        expect(after.gauges[key]).toBe(delta < 0 ? 0 : 100);
        expect(after.ending?.cause).toBe(
          `${key}_${delta < 0 ? 'low' : 'high'}`,
        );
      }
    },
  );

  it('ends on a lethal sleeping approve stamp after the save was spent', () => {
    const after = resolve(
      unavoidable,
      { ...initialState(), sleep: 1, erpinSaved: true },
      0.9,
    );
    expect(after.gauges).toEqual({ ...initialState().gauges, erpin: 100 });
    expect(after.erpinSaved).toBe(true);
    expect(after.ending).toEqual({ id: 'sleep', cause: 'erpin_high' });
  });

  it.each([0, 1])(
    'leaves axe-able both-lethal cards fatal with sleep=%s',
    (sleep) => {
      const after = resolve(
        { ...unavoidable, axe: true },
        { ...initialState(), sleep },
      );
      expect(after.ending?.cause).toBe('sugar_low');
      expect(after.erpinSaved).toBe(false);
    },
  );

  it('does not protect an awake lethal stamp when another stamp is safe', () => {
    expect(resolve({ ...danger, axe: false }).ending?.cause).toBe('sugar_low');
  });

  it('uses scaled and adjusted real effects to determine safety', () => {
    const [year] = ERA_SCALE.reduce((a, b) => (b[1] > a[1] ? b : a));
    const card = {
      ...danger,
      reject: { label: 'Reject', effects: { sugar: -40 } },
    };
    expect(
      choiceEffects(card.reject, initialState().gauges, card.kind, year).sugar,
    ).toBeLessThanOrEqual(-50);
    expect(
      resolve(card, { ...initialState(), year, sleep: 1 }).erpinSaved,
    ).toBe(true);
    const adjusted: Card = {
      ...unavoidable,
      reject: { label: 'Reject', effects: { people: -10 }, adjust: 20 },
    };
    const after = resolve(adjusted, {
      ...initialState(),
      gauges: { ...initialState().gauges, people: 10 },
    });
    expect(after.gauges.people).toBe(20);
  });

  it('keeps previews unchanged by rescues', () => {
    for (const card of [danger, unavoidable]) {
      const before = structuredClone(card);
      const preview = previewFor(card, 'reject', initialState().gauges);
      expect(preview).toContainEqual({
        gauge: 'sugar',
        dir: 'down',
        size: 100,
      });
      resolve(card, { ...initialState(), sleep: 1 });
      expect(previewFor(card, 'reject', initialState().gauges)).toEqual(
        preview,
      );
      expect(card).toEqual(before);
    }
  });

  it('consumes only the original sleep roll before the unchanged seeded deck draws', () => {
    for (const card of [danger, unavoidable, daily]) {
      const seed = 9;
      const expectedRng = mulberry32(seed);
      expectedRng();
      const actualRng = vi.fn(mulberry32(seed));
      const after = processDocument(
        { ...initialState(), current: card, sleep: 1 },
        'reject',
        [daily],
        actualRng,
      );
      const expected = nextDocument(
        { ...after, current: null, recent: [] },
        [daily],
        expectedRng,
      );
      expect(after.current).toEqual(expected.current);
      expect(actualRng.mock.calls.length).toBe(after.ending ? 1 : 4);
      expect(actualRng()).toBe(expectedRng());
    }
  });
});

describe("Chloe's stitch", () => {
  it.each(GAUGE_KEYS)(
    'clamps exact boundaries and overshoots for %s once',
    (key) => {
      for (const delta of [-100, -50, 50, 100]) {
        const card: Card = {
          ...danger,
          kind: 'fixed',
          reject: { label: 'Reject', effects: { [key]: delta } },
        };
        const before: State = { ...initialState(), boons: { stitch: true } };
        const after = resolve(card, before);
        expect(after.gauges).toEqual({
          ...before.gauges,
          [key]: delta < 0 ? 10 : 90,
        });
        expect(after.stitched).toBe(true);
        expect(after.boons.stitch).toBeUndefined();
        expect(after.ending).toBeNull();
        expect(before.boons.stitch).toBe(true);
        const dead = resolve(card, after);
        expect(dead.ending).not.toBeNull();
        expect(dead.stitched).toBe(false);
      }
    },
  );

  it.each([0, 1])(
    'catches all breaking gauges together with sleep=%s',
    (sleep) => {
      const before: State = {
        ...initialState(),
        sleep,
        boons: { stitch: true },
      };
      const after = resolve({ ...unavoidable, axe: true }, before);
      expect(after.gauges).toEqual({
        sugar: 10,
        people: 90,
        faith: 10,
        erpin: 55,
      });
      expect(after.stitched).toBe(true);
      expect(after.erpinSaved).toBe(false);
      expect(after.ending).toBeNull();
      expect(after.boons.stitch).toBeUndefined();
      expect(resolve(daily, after).stitched).toBe(false);
    },
  );

  it('lets the first sleep save preserve stitch and consumes stitch on fatal forbidden cards', () => {
    const before: State = {
      ...initialState(),
      sleep: 1,
      boons: { stitch: true },
    };
    const saved = resolve(danger, before);
    expect(saved.erpinSaved).toBe(true);
    expect(saved.stitched).toBe(false);
    expect(saved.boons.stitch).toBe(true);
    const stitched = resolve(danger, { ...saved, sleep: 1 });
    expect(stitched.stitched).toBe(true);
    expect(stitched.gauges.sugar).toBe(10);
    expect(stitched.ending).toBeNull();
    for (const sleep of [0, 1]) {
      const stood = resolve(unavoidable, { ...before, sleep });
      expect(stood.stitched).toBe(true);
      expect(stood.boons.stitch).toBeUndefined();
      expect(stood.gauges.sugar).toBe(10);
      expect(stood.gauges.people).toBe(90);
      expect(stood.ending).toBeNull();
    }
  });

  it('preserves stitch on safe documents and does not prevent the true ending', () => {
    const before: State = { ...initialState(), boons: { stitch: true } };
    const safe = resolve(daily, before);
    expect(safe.stitched).toBe(false);
    expect(safe.boons.stitch).toBe(true);
    const ended = resolve(danger, {
      ...before,
      year: END_YEAR,
      boss: { done: 10, drawn: [], kickoutUsed: true },
    });
    expect(ended.stitched).toBe(true);
    expect(ended.ending).toEqual({ id: 'true' });
    expect(
      resolve(daily, {
        ...before,
        year: END_YEAR,
        boss: { done: 10, drawn: [] },
      }).ending,
    ).toEqual({
      id: 'true',
    });
  });

  it('clears the document flag on reroll and rewind', () => {
    const stitched = resolve(danger, {
      ...initialState(),
      boons: { stitch: true },
    });
    const rerolled = rerollDaily(
      { ...stitched, scene: null, boons: { alice: true } },
      [daily, { ...daily, id: 'other' }],
      () => 0.5,
    );
    expect(rerolled.stitched).toBe(false);
    const revived = rewind(
      {
        ...stitched,
        year: 180,
        ending: { id: 'sugar_low' },
        boons: { rewind: true },
      },
      [daily],
      () => 0.5,
    );
    expect(revived.stitched).toBe(false);
  });
});
