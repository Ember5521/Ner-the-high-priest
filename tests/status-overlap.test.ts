import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type ActiveStatus, type Card, type State } from '../src/core/state';
import { eligible, nextDocument } from '../src/core/deck';
import { processDocument } from '../src/core/loop';
import { PRACTICUM_QUIET_YEARS } from '../src/core/config';

const cards = raw as Card[];
const find = (id: string) => structuredClone(cards.find((c) => c.id === id)!);
const PRACTICUM = 'special_fricle_pikora';
const plain: Card = {
  id: 'daily_plain',
  kind: 'daily',
  tier: 1,
  speaker: 'ner',
  faction: 'x',
  title: 'plain',
  text: 'plain',
  years: 1,
  axe: true,
  reject: { label: 'no', effects: { sugar: -5 } },
  approve: { label: 'yes', effects: { sugar: 5 } },
};
const lingering: Card = {
  ...plain,
  id: 'daily_lingering',
  approve: {
    label: 'yes',
    effects: {},
    status: { id: 'ember', turns: 3, tick: { people: -2 } },
  },
};
const running = (extra: Partial<ActiveStatus> = {}): ActiveStatus => ({
  id: 'ember',
  left: 3,
  source: 'x',
  tick: { faith: 2 },
  ...extra,
});
const at = (year: number, extra: Partial<State> = {}): State => ({
  ...initialState('priest', () => 0.5),
  year,
  windowYears: { [PRACTICUM]: 175 },
  ...extra,
});

describe('lingering effects never pile up', () => {
  it('starts no new gauge effect in the quiet years before the practicum', () => {
    const quiet = 175 - PRACTICUM_QUIET_YEARS;
    expect(eligible(lingering, at(quiet - 1))).toBe(true);
    expect(eligible(lingering, at(quiet))).toBe(false);
    expect(eligible(plain, at(quiet))).toBe(true);
    expect(eligible(lingering, at(quiet, { seen: [PRACTICUM] }))).toBe(true);
    // an axe lock touches no gauge and may still come
    const dull = find('daily_guard_axe_repair');
    expect(eligible({ ...dull, conditions: undefined }, at(quiet))).toBe(true);
  });

  it('holds the practicum until every gauge effect has run out', () => {
    const practicum = find(PRACTICUM);
    const deck = [practicum, plain];
    const due = at(176, { current: null });
    expect(
      nextDocument({ ...due, statuses: [running()] }, deck, () => 0.5).current?.id,
    ).toBe(plain.id);
    expect(
      nextDocument(
        { ...due, statuses: [running({ id: 'dull_axe', tick: undefined, axeLock: true })] },
        deck,
        () => 0.5,
      ).current?.id,
    ).toBe(PRACTICUM);
    expect(nextDocument(due, deck, () => 0.5).current?.id).toBe(PRACTICUM);
  });

  it("keeps new gauge effects away while Pikora's drift or the sugar cut holds the gauge", () => {
    const drift = running({ id: 'pikora_drift', tick: { people: 5 } });
    const state = at(185, { seen: [PRACTICUM], statuses: [drift] });
    expect(eligible(lingering, state)).toBe(false);
    expect(
      eligible(lingering, { ...state, statuses: [{ ...drift, tick: { sugar: 5 } }] }),
    ).toBe(true);
    const cut = running({ id: 'sugar_cut', tick: { sugar: -2 }, floor: 8 });
    const terms = find('daily_monatium_new_terms');
    expect(eligible(terms, { ...state, statuses: [cut] })).toBe(false);
  });

  it('lets the boss sugar cut clear whatever else was running on sugar', () => {
    const card = find('boss_sugar_cut');
    const state = {
      ...initialState('priest', () => 0.5),
      year: 200,
      boss: { done: 4, drawn: [] },
      current: card,
      statuses: [
        running({ id: 'grace_year', tick: { sugar: 3 } }),
        running({ id: 'ember', tick: { faith: 2 } }),
      ],
    };
    const next = processDocument(state, 'approve', cards, () => 0.5);
    expect(next.statuses.map((s) => s.id).sort()).toEqual(['ember', 'sugar_cut']);
  });
});
