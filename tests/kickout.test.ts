// @vitest-environment jsdom
import { expect, it, beforeEach } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card, type State } from '../src/core/state';
import { processDocument, rewind, declineRewind, canRewind } from '../src/core/loop';
import { loadRun, saveRun } from '../src/save/storage';

const cards = raw as Card[];
const daily = cards.find(c => c.kind === 'daily')!;
const fatal: Card = { ...daily, boss: 'unrest', reject: { label: 'x', effects: { sugar: -100, people: 100 } }, approve: { label: 'x', effects: { sugar: -100, people: 100 } } };
const base = (): State => ({ ...initialState(), year: 200, boss: { done: 0, drawn: [] }, current: fatal });
const step = (s: State, card: Card = fatal) => processDocument({ ...s, current: card, scene: null }, 'reject', cards, () => 0);
beforeEach(() => localStorage.clear());

it('uses stitch and offers rewind before the last kick-out', () => {
 const stitched = step({ ...base(), boons: { stitch: true, rewind: true } });
 expect(stitched.gauges).toMatchObject({ sugar: 10, people: 90 });
 expect(stitched.scene).toBe('stitch');
 expect(stitched.record.helped).toBe(true);
 expect(stitched.boss?.kickoutUsed).toBeUndefined();
 const failed = step(stitched);
 expect(canRewind(failed)).toBe(true);
 expect(failed.boss?.kickoutUsed).toBeUndefined();
 const saved = declineRewind(failed, cards, () => 0);
 expect(saved.gauges).toMatchObject({ sugar: 3, people: 97 });
 expect(saved.scene).toBe('kickout');
 expect(saved.record.helped).toBe(true);
 expect(saved.boss?.kickoutUsed).toBe(true);
 const dead = step({ ...saved, boons: {} });
 expect(dead.ending).not.toBeNull();
 expect(dead.boss?.kickoutUsed).toBe(true);
});
it('uses kick-out immediately when rewind is unavailable', () => {
 const saved = step(base());
 expect(saved.scene).toBe('kickout');
 expect(saved.record.helped).toBe(true);
 expect(saved.gauges).toMatchObject({ sugar: 3, people: 97 });
});
it('uses the sleeping rescue before kick-out', () => {
 const card: Card = { ...fatal, approve: { label: 'safe', effects: {} } };
 const saved = step({ ...base(), sleep: 1 }, card);
 expect(saved.erpinSaved).toBe(true);
 expect(saved.record.helped).toBe(true);
 expect(saved.scene).toBe('erpinSave');
 expect(saved.boss?.kickoutUsed).toBeUndefined();
});
it('works for status ticks and sleeping stamps', () => {
 const neutral: Card = { ...fatal, reject: { label: 'x', effects: {} }, approve: { label: 'x', effects: {} } };
 const ticked = step({ ...base(), gauges: { ...base().gauges, sugar: 1 }, statuses: [{ id: 'sugar_cut', source: 'x', left: 1, tick: { sugar: -2 } }] }, neutral);
 expect(ticked.gauges.sugar).toBe(3);
 expect(ticked.scene).toBe('kickout');
 const asleep = step({ ...base(), sleep: 1 });
 expect(asleep.scene).toBe('kickout');
 expect(asleep.erpinSaved).toBe(false);
});
it('does not kick out outside the boss or in bishop mode', () => {
 expect(step({ ...base(), year: 10, boss: undefined }).ending).not.toBeNull();
 const bishop = { ...initialState('bishop'), boss: { done: 0, drawn: [] }, current: fatal };
 expect(step(bishop).boss?.kickoutUsed).toBeUndefined();
});
it('retains kick-out through save and rewind', () => {
 const first = step(base());
 saveRun(first);
 expect(loadRun(cards)?.boss?.kickoutUsed).toBe(true);
 expect(loadRun(cards)?.record.helped).toBe(true);
 const snapshot = { ...base(), current: daily, past: [] };
 const dead = { ...first, scene: null, boons: { ...first.boons, rewind: true as const }, ending: { id: 'sugar_low' }, past: [snapshot] };
 expect(rewind(dead, cards, () => 0).boss?.kickoutUsed).toBe(true);
});
it('floors sugar ticks and makes either rebellion choice nonlethal', () => {
 const neutral: Card = { ...fatal, reject: { label: 'x', effects: {} } };
 for (const sugar of [14, 15, 16]) {
  const after = step({ ...base(), gauges: { ...base().gauges, sugar }, statuses: [{ id: 'sugar_cut', source: 'x', left: 1, tick: { sugar: -2 }, floor: 15 }] }, neutral);
  expect(after.gauges.sugar).toBe(sugar === 14 ? 14 : 15);
 }
 const rebellion = cards.find(c => c.id === 'boss_sugar_rebellion')!;
 for (const action of ['reject', 'approve'] as const) for (const sugar of [1, 99]) {
  const after = processDocument({ ...base(), current: rebellion, gauges: { sugar, people: sugar, faith: sugar, erpin: sugar }, statuses: [{ id: 'sugar_cut', source: 'x', left: 1, tick: { sugar: -2 } }] }, action, cards, () => 0);
  expect(after.ending).toBeNull();
  expect(Object.values(after.gauges).every(v => v >= 1 && v <= 99)).toBe(true);
  expect(after.boss?.kickoutUsed).toBeUndefined();
 }
});

it('marks an accepted boss rewind after restoring a clean snapshot', () => {
 const snapshot = { ...base(), current: daily, past: [] };
 const failed = step({ ...base(), boons: { rewind: true }, past: [snapshot] });
 expect(failed.record.helped).toBe(false);
 expect(rewind(failed, cards, () => 0).record.helped).toBe(true);
});
