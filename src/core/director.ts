import { bishopConfig, bishopCurve } from './bishop';
import {
  APPRENTICE_TENSION_DELTA,
  DIRECTOR_CLAMP,
  DIRECTOR_K,
  GAUGE_KEYS,
  TENSION_CURVE,
} from './config';
import { choiceEffects } from './loop';
import type { Card, Choice, State } from './state';

export function tension(gauges: State['gauges']): number {
  return Math.max(...GAUGE_KEYS.map((key) => Math.abs(gauges[key] - 50)));
}

export function targetTension(year: number): number {
  const first = TENSION_CURVE[0]!;
  if (year <= first[0]) return first[1];
  for (let i = 1; i < TENSION_CURVE.length; i++) {
    const [endYear, end] = TENSION_CURVE[i]!;
    const [startYear, start] = TENSION_CURVE[i - 1]!;
    if (year <= endYear)
      return (
        start + ((year - startYear) / (endYear - startYear)) * (end - start)
      );
  }
  return TENSION_CURVE.at(-1)![1];
}

export function directorWeight(card: Card, state: State): number {
  const current = tension(state.gauges);
  const outcomes = (['reject', 'approve'] as Choice[]).map((choice) => {
    const effects = choiceEffects(
      card[choice],
      state.gauges,
      card.kind,
      state.year,
      state.statuses,
      state,
      card,
    );
    const gauges = { ...state.gauges };
    for (const key of GAUGE_KEYS)
      gauges[key] = Math.max(
        0,
        Math.min(100, gauges[key] + (effects[key] ?? 0)),
      );
    return tension(gauges);
  });
  const dExp = (outcomes[0]! + outcomes[1]!) / 2 - current;
  const desired = Math.max(
    -DIRECTOR_CLAMP,
    Math.min(
      DIRECTOR_CLAMP,
      (state.mode === 'bishop'
        ? bishopCurve(state.year, bishopConfig.tension)
        : targetTension(state.year) + (state.mode === 'apprentice' ? APPRENTICE_TENSION_DELTA : 0)) - current,
    ),
  );
  return (card.weight ?? 1) * Math.exp(-DIRECTOR_K * (dExp - desired) ** 2);
}
