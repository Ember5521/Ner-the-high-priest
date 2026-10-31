// @vitest-environment jsdom
import { expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card } from '../src/core/state';
import { canRerollDaily } from '../src/core/deck';
import { aimScope, placeBlindfold, processDocument, useBandage } from '../src/core/loop';
import { toolsMarkup } from '../src/ui/tools';
import { playerAction } from '../tools/simulate';

const cards = raw as Card[];
const ids = [
  'story_diana_thanks', 'story_diana_thanks_again', 'fixed_xion_request',
  'special_renewa_curtain', 'fixed_chloe_tailor', 'special_sist_shop',
  'special_strange_card',
];
const stateFor = (card: Card) => ({
  ...initialState(),
  current: card,
  gauges: { ...initialState().gauges, sugar: 30 },
  boons: { scope: 4, bullet: 2, blindfold: 1, bandage: 1, alice: true as const },
});
const markup = (state: ReturnType<typeof stateFor>) => {
  const root = document.createElement('div');
  root.innerHTML = toolsMarkup(
    state.current, state.drowse, true, false, false, undefined, state.boons.scope,
    false, false, { boons: state.boons, blindfold: state.blindfold, bandageDisabled: false },
  );
  return root;
};

it.each(ids)('locks held items on %s', (id) => {
  const card = cards.find((c) => c.id === id)!;
  expect(card).toBeDefined();
  const state = stateFor(card);
  expect(aimScope(state)).toBe(state);
  expect(processDocument(state, 'bullet', cards, () => 0.5)).toBe(state);
  expect(placeBlindfold(state, 'sugar')).toBe(state);
  expect(useBandage(state, 'sugar')).toBe(state);
  expect(canRerollDaily(state, cards)).toBe(false);
  const root = markup(state);
  for (const selector of ['.tool.bullet', '.tool.scope', '.blindfold-slot', '.bandage-slot'])
    expect(root.querySelector(selector)?.getAttribute('aria-disabled')).toBe('true');
});

it.each(cards.filter((card) => card.kind === 'story'))('locks held items on story $id', (card) => {
  const state = stateFor(card);
  expect(placeBlindfold(state, 'sugar')).toBe(state);
  expect(useBandage(state, 'sugar')).toBe(state);
  expect(aimScope(state)).toBe(state);
  expect(processDocument(state, 'bullet', cards, () => 0.5)).toBe(state);
  const root = markup(state);
  for (const selector of ['.blindfold-slot', '.bandage-slot'])
    expect(root.querySelector(selector)?.getAttribute('aria-disabled')).toBe('true');
});

it('does not choose a forbidden bullet in the simulator', () => {
  const card = cards.find((c) => c.id === 'special_strange_card')!;
  const state = { ...stateFor(card), gauges: { ...stateFor(card).gauges, sugar: 1 }, drowse: { stack: 2 as const, left: 1 }, current: { ...card, reject: { ...card.reject, effects: { sugar: -10 } }, approve: { ...card.approve, effects: { sugar: -10 } } } };
  expect(playerAction(state, 'careful', () => 0.5)).toBe('reject');
});

it('allows held items on an ordinary daily card', () => {
  const card = cards.find((c) => c.kind === 'daily' && c.axe === true)!;
  const state = stateFor(card);
  expect(aimScope(state).scoped).toBe(true);
  expect(processDocument(state, 'bullet', cards, () => 0.5)).not.toBe(state);
  expect(placeBlindfold(state, 'sugar').blindfold).toBe('sugar');
  expect(useBandage(state, 'sugar').gauges.sugar).toBeGreaterThan(30);
  expect(canRerollDaily(state, cards)).toBe(true);
  const root = markup(state);
  expect(root.querySelector('.tool.bullet')?.getAttribute('aria-disabled')).toBe('false');
  expect(root.querySelector('.tool.scope')?.getAttribute('aria-disabled')).toBe('false');
  expect(root.querySelector('.bandage-slot')?.getAttribute('aria-disabled')).toBe('false');
  expect(root.querySelector('.blindfold-slot')?.hasAttribute('aria-disabled')).toBe(false);
});

it('still permits the axe on the strange card', () => {
  const state = stateFor(cards.find((c) => c.id === 'special_strange_card')!);
  expect(processDocument(state, 'axe', cards, () => 0.5)).not.toBe(state);
});
