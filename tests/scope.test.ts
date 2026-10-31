import { expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card } from '../src/core/state';
import { aimScope, choiceEffects, processDocument } from '../src/core/loop';
const cards = raw as Card[];
const daily = cards.find(c => c.kind === 'daily' && c.axe === true)!;
const state = () => ({ ...initialState(), current: daily, boons: { scope: 4, bullet: 2, alice: true as const }, gauges: { sugar: 70, people: 30, faith: 50, erpin: 50 } });
it('scales outward, inward and crossing effects and Fricle press', () => {
  const s = aimScope(state());
  expect(choiceEffects({ label: '', effects: { sugar: 20, people: 6, faith: 8 } }, s.gauges, 'fixed', 0, [], s)).toEqual({ sugar: 5, people: 12, faith: 2 });
  expect(choiceEffects({ label: '', effects: { sugar: -25 } }, s.gauges, 'fixed', 0, [], s).sugar).toBe(-25);
  expect(choiceEffects({ label: '', effects: {}, witchPress: { amount: 20, floor: 5 } }, s.gauges, 'fixed', 0, [], s).sugar).toBe(5);
});
it('spends on a stamp but preserves charges on discard and reroll', () => {
  const s = aimScope(state());
  for (const action of ['axe', 'bullet', 'alice'] as const) {
    const next = processDocument(s, action, cards, () => 0.5);
    expect(next.boons.scope).toBe(4);
    expect(next.scoped).toBeUndefined();
  }
  const next = processDocument(s, 'approve', cards, () => 0.5);
  expect(next.boons.scope).toBe(3);
  expect(next.scoped).toBeUndefined();
});
it('aims at a forgery too: a stamp wastes the charge, the axe keeps it', () => {
  const speaki = { ...daily, kind: 'speaki' as const, axe: 'free' as const };
  const s = aimScope({ ...state(), current: speaki });
  expect(s.scoped).toBe(true);
  const stamped = processDocument(s, 'approve', cards, () => 0.5);
  expect(stamped.gauges).toEqual(s.gauges);
  expect(stamped.boons.scope).toBe(s.boons.scope! - 1);
  expect(processDocument(s, 'axe', cards, () => 0.5).boons.scope).toBe(s.boons.scope);
});
it('halves Pikora drift and guards invalid targets', () => {
  const card = cards.find(c => c.id === 'special_fricle_pikora')!;
  const s = aimScope({ ...state(), current: card });
  expect(processDocument(s, 'approve', cards, () => 0.5).statuses.filter(x => x.id === 'pikora_drift').every(x => x.left === 3)).toBe(true);
  for (const current of [null, { ...daily, kind: 'story' as const }, { ...daily, look: 'special' as const }]) {
    const blocked = { ...state(), current };
    expect(aimScope(blocked)).toBe(blocked);
  }
  for (const extra of [{ sleep: 1 }, { scene: 'asleep' as const }, { ending: { id: 'sugar_low' } }, { scoped: true as const }, { boons: {} }]) {
    const blocked = { ...state(), ...extra };
    expect(aimScope(blocked)).toBe(blocked);
  }
});
