// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { eligible, nextDocument } from '../src/core/deck';
import { initialState, type Card } from '../src/core/state';
import { fillForm, initializeForm, readForm } from '../src/editor/form';
import { cardFeatures } from '../src/editor/features';
import { koMessage } from '../src/editor/messages';
import { validateCards } from '../tools/validate-cards';
import { mulberry32 } from '../tools/simulate';

const cards = raw as Card[];
const listed = `daily_sist_charm daily_sist_rumor special_sist_deal_late
daily_mayo_relic daily_mayo_pawn_bell daily_mayo_candlestick daily_mayo_escaped_collection daily_mayo_world_tree_branch
daily_kyarot_cane daily_kyarot_statue daily_kyarot_cane_vine
daily_marie_tunnel daily_marie_fireworks daily_marie_window daily_marie_tunnel_vault
daily_ashur_school daily_ashur_bread_tasting daily_ashur_first_student
daily_erpin_snack_decree daily_erpin_doll daily_erpin_birthday_week daily_erpin_new_crown daily_erpin_golden_throne daily_erpin_parade
daily_kid_question daily_kid_tree_swing
daily_beast_hide_and_seek daily_beast_acorns daily_beast_sleepover daily_beast_honey_trade
daily_sweetshop_sign daily_sweetshop_flavor daily_church_vigil daily_church_new_hymn
daily_villager_praise_contest daily_villager_day_off daily_villager_festival_leftovers
daily_witch_parcel daily_witch_apprentices daily_monatium_toy daily_diana_berries daily_belita_gift daily_belita_letter`.split(
  /\s+/,
);
const daily = cards.find((c) => c.kind === 'daily')!;

it('makes maxYear inclusive for daily, special and Speaki draws', () => {
  for (const kind of ['daily', 'special', 'speaki'] as const) {
    const limited = {
      ...daily,
      id: 'limited',
      kind,
      conditions: { maxYear: 185 },
    };
    const fallback = { ...daily, id: 'fallback', conditions: undefined };
    expect(eligible(limited, { ...initialState(), year: 185 })).toBe(true);
    expect(eligible(limited, { ...initialState(), year: 186 })).toBe(false);
    for (const year of [185, 186])
      expect(
        nextDocument({ ...initialState(), year }, [limited, fallback], () => 0)
          .current?.id,
      ).toBe(year === 185 ? 'limited' : 'fallback');
  }
});

it('rejects a forgery when its mimic target expires', () => {
  const source = { ...cards.find((c) => c.mimic)!, conditions: undefined };
  const target = { ...daily, id: source.mimic!, conditions: { maxYear: 185 } };
  const fallback = { ...daily, id: 'fallback', conditions: undefined };
  for (const year of [185, 186])
    expect(
      nextDocument(
        { ...initialState(), year },
        [source, target, fallback],
        () => 0,
      ).current?.id,
    ).toBe(year === 185 ? source.id : fallback.id);
});

it('validates integer bounds and their ordering and translates errors', () => {
  for (const maxYear of [-1, 1.5, '185', null, Infinity]) {
    const errors = validateCards([{ ...daily, conditions: { maxYear } }]);
    expect(errors).toContain('[0] invalid condition maxYear');
    expect(koMessage(errors[0]!)).not.toContain('invalid condition');
  }
  for (const conditions of [
    { maxYear: 0 },
    { minYear: 185, maxYear: 185 },
    { maxYear: 185 },
  ])
    expect(validateCards([{ ...daily, conditions }])).toEqual([]);
  const error = '[0] condition minYear must not exceed maxYear';
  expect(
    validateCards([{ ...daily, conditions: { minYear: 186, maxYear: 185 } }]),
  ).toContain(error);
  expect(koMessage(error)).not.toContain('minYear');
});

it('round trips, edits and clears year fields, including compact mimic cards', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.getElementById('form')!;
  initializeForm(root);
  for (const source of [daily, cards.find((c) => c.mimic)!]) {
    const card = {
      ...source,
      conditions: { ...source.conditions, minYear: 100, maxYear: 185 },
    };
    fillForm(root, card, cards);
    expect(readForm(root, card)).toEqual(card);
    const min = root.querySelector<HTMLInputElement>('#f-minYear')!;
    const max = root.querySelector<HTMLInputElement>('#f-maxYear')!;
    expect(min.disabled || max.disabled).toBe(false);
    max.value = '180';
    expect(readForm(root, card).conditions?.maxYear).toBe(180);
    min.value = max.value = '';
    const cleared = readForm(root, card);
    expect(cleared.conditions?.minYear).toBeUndefined();
    expect(cleared.conditions?.maxYear).toBeUndefined();
    expect(
      cardFeatures(card, cards).find((f) => f.kind === 'condition')?.body,
    ).toContain('185년까지');
  }
});

it('keeps every listed card out of seeded late draws and retains an unconditional daily pool', () => {
  const banned = new Set([
    ...listed.filter((id) => (cards.find((c) => c.id === id)?.conditions?.maxYear ?? 185) <= 185),
    ...cards.filter((c) => c.kind === 'speaki').map((c) => c.id),
  ]);
  for (const id of banned) {
    const card = cards.find((c) => c.id === id)!;
    if (id === 'special_sist_deal_late')
      expect(card.trigger).toEqual({ from: 100, to: 180, order: 1 });
    else expect(card.conditions?.maxYear, id).toBe(185);
  }
  const rng = mulberry32(2026);
  const optional = cards.filter((c) => !['story', 'fixed'].includes(c.kind));
  let state = initialState();
  const counts: number[] = [];
  for (let year = 186; year <= 199; year++) {
    const unconditional = cards.filter(
      (c) =>
        c.kind === 'daily' &&
        !c.conditions?.gauges &&
        eligible(c, { ...initialState(), year }),
    );
    counts.push(unconditional.length);
    expect(unconditional.length).toBeGreaterThan(0);
    for (let draw = 0; draw < 200; draw++) {
      state = nextDocument({ ...state, year, current: null }, optional, rng);
      expect(state.current).toBeTruthy();
      expect(banned.has(state.current!.id)).toBe(false);
    }
    // Even without any gauge-dependent cards, repeated draws have a valid pool.
    for (let draw = 0; draw < 100; draw++) {
      state = nextDocument(
        { ...state, year, current: null },
        unconditional,
        rng,
      );
      expect(state.current?.kind).toBe('daily');
    }
  }
  console.log(
    'Years 186–199: eligible daily cards without gauge conditions:',
    counts.join(', '),
  );
});
