import { describe, expect, it } from 'vitest';
import { nextDocument } from '../src/core/deck';
import { directorWeight, targetTension, tension } from '../src/core/director';
import { initialState, type Card } from '../src/core/state';
import { DIRECTOR_CLAMP, DIRECTOR_K, TENSION_CURVE } from '../src/core/config';
import { choiceEffects } from '../src/core/loop';

const card = (delta: number, weight = 1): Card => ({
  id: `delta-${delta}`,
  kind: 'daily',
  tier: 1,
  speaker: 'test',
  faction: 'test',
  title: 'Test',
  text: 'Test',
  years: 1,
  axe: true,
  weight,
  reject: { label: 'Reject', effects: { sugar: delta } },
  approve: { label: 'Approve', effects: { sugar: delta } },
});

describe('tension director', () => {
  it('prefers pressure while calm and relief above target', () => {
    const calm = initialState();
    const desired = Math.min(50, DIRECTOR_CLAMP, targetTension(calm.year));
    expect(
      directorWeight({ ...card(desired), kind: 'story' }, calm),
    ).toBeGreaterThan(directorWeight({ ...card(0), kind: 'story' }, calm));
    const tense = { ...calm, gauges: { ...calm.gauges, sugar: 100 } };
    const relief = Math.max(-DIRECTOR_CLAMP, targetTension(tense.year) - 50);
    expect(
      directorWeight({ ...card(relief), kind: 'story' }, tense),
    ).toBeGreaterThan(directorWeight({ ...card(10), kind: 'story' }, tense));
    expect(tension(tense.gauges)).toBe(50);
    expect(calm.gauges.sugar).toBe(50);
  });

  it.each([
    [TENSION_CURVE[0]![0] - 10, TENSION_CURVE[0]![1]],
    ...TENSION_CURVE,
    ...TENSION_CURVE.slice(1).map(([year, value], index) => [
      (year + TENSION_CURVE[index]![0]) / 2,
      (value + TENSION_CURVE[index]![1]) / 2,
    ]),
    [TENSION_CURVE.at(-1)![0] + 20, TENSION_CURVE.at(-1)![1]],
  ])('interpolates and holds curve endpoints at year %s', (year, target) => {
    expect(targetTension(year)).toBeCloseTo(target, 12);
  });

  it('averages both choices, clamps gauges and desired change, and applies base weight', () => {
    const state = initialState();
    state.year = 150;
    const mixed = { ...card(200, 3), reject: card(0).reject };
    expect(directorWeight(mixed, state)).toBeCloseTo(
      3 *
        Math.exp(
          -DIRECTOR_K *
            (25 - Math.min(DIRECTOR_CLAMP, targetTension(150))) ** 2,
        ),
    );
    state.gauges.people = 90;
    const adjusted = {
      ...card(0),
      reject: { label: 'Reject', effects: {}, adjust: 20 },
      approve: { label: 'Approve', effects: {}, adjust: 20 },
    };
    const delta = choiceEffects(
      adjusted.approve,
      state.gauges,
      adjusted.kind,
      state.year,
    ).people!;
    const change =
      Math.abs(Math.max(0, Math.min(100, state.gauges.people + delta)) - 50) -
      40;
    expect(directorWeight(adjusted, state)).toBeCloseTo(
      Math.exp(
        -DIRECTOR_K *
          (change -
            Math.max(
              -DIRECTOR_CLAMP,
              Math.min(DIRECTOR_CLAMP, targetTension(150) - 40),
            )) **
            2,
      ),
    );
  });

  it('falls back to plain weights when the chosen tier director weights are negligible', () => {
    const quiet = card(0, 1e-20);
    const pressure = card(10, 9e-20);
    const rolls = [0.99, 0, 0.05];
    expect(
      nextDocument(initialState(), [quiet, pressure], () => rolls.shift()!)
        .current?.id,
    ).toBe(quiet.id);
    expect(rolls).toEqual([]);
  });

  it('biases only the selected tier and retains conditions and recent exclusion', () => {
    const quiet = card(0);
    const pressure = card(10);
    const locked = { ...card(12, 1e9), conditions: { flagsAll: ['locked'] } };
    const otherTier = { ...card(13, 1e9), tier: 3 as const };
    const state = initialState();
    const quietShare =
      directorWeight(quiet, state) /
      (directorWeight(quiet, state) + directorWeight(pressure, state));
    const rolls = [0.99, 0, (1 + quietShare) / 2];
    expect(
      nextDocument(initialState(), [quiet, pressure, locked, otherTier], () =>
        rolls.shift()!,
      ).current?.id,
    ).toBe(pressure.id);
    expect(
      nextDocument(
        { ...initialState(), recent: [pressure.id] },
        [quiet, pressure],
        () => 0.99,
      ).current?.id,
    ).toBe(quiet.id);
  });
});
