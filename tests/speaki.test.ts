// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { SPEAKI_CHANCE, SPEAKI_GAP, SPECIAL_CHANCE } from '../src/core/config';
import { materializeCard, nextDocument } from '../src/core/deck';
import { initialState, type Card } from '../src/core/state';
import { processDocument } from '../src/core/loop';
import { documentMarkup } from '../src/ui/document';
import { toolsMarkup } from '../src/ui/tools';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import {
  fillForm,
  initializeForm,
  listedCards,
  readForm,
} from '../src/editor/form';
import { validateCards } from '../tools/validate-cards';
import { playerAction } from '../tools/simulate';

const cards = raw as Card[];
const forgeries = cards.filter((c) => c.kind === 'speaki');
const mimic = forgeries.find((c) => c.mimic)!;
const target = cards.find((c) => c.id === mimic.mimic)!;
const daily = { ...target, conditions: undefined };
const pool = [daily, ...forgeries];
const rolls =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

describe('Speaki forgeries', () => {
  it('materialises each mimic from its daily target without changing the source', () => {
    for (const source of forgeries.filter((c) => c.mimic)) {
      const before = structuredClone(source);
      const original = cards.find((c) => c.id === source.mimic)!;
      const resolved = materializeCard(source, cards);
      for (const key of [
        'speaker',
        'faction',
        'title',
        'tier',
        'years',
        'reject',
        'approve',
      ] as const)
        expect(resolved[key]).toEqual(original[key]);
      for (const key of [
        'id',
        'kind',
        'text',
        'axe',
        'axeResult',
        'missed',
      ] as const)
        expect(resolved[key]).toEqual(source[key]);
      resolved.approve.effects.sugar = 999;
      expect(source).toEqual(before);
      expect(original.approve.effects.sugar).not.toBe(999);
    }
    const standalone = forgeries.find((c) => !c.mimic)!;
    expect(materializeCard(standalone, cards)).toBe(standalone);
  });

  it('renders the daily header, classes, tools, preview dots and exact numbers', () => {
    const forged = materializeCard(mimic, cards);
    const visibleDaily = { ...target, text: forged.text };
    expect(documentMarkup(forged)).toBe(documentMarkup(visibleDaily));
    expect(toolsMarkup(forged, initialState().drowse)).toBe(
      toolsMarkup(visibleDaily, initialState().drowse),
    );
    const root = document.createElement('div');
    for (const year of [0, 150]) {
      const state = {
        ...initialState(),
        year,
        boons: { hyean: { left: 1 } },
      };
      root.innerHTML = gaugesMarkup(state);
      for (const side of ['reject', 'approve'] as const) {
        updateGaugePreview(root, visibleDaily, side, false, state);
        const expected = root.innerHTML;
        updateGaugePreview(root, forged, side, false, state);
        expect(root.innerHTML).toBe(expected);
        expect(
          root.querySelector('.preview-dot.exact:not([hidden])'),
        ).not.toBeNull();
      }
    }
  });

  it('uses the chance boundary before the special roll and preserves mandatory priority', () => {
    const source = { ...mimic, conditions: undefined };
    const special = cards.find((c) => c.kind === 'special' && !c.modes)!;
    const sample = [daily, source, { ...special, conditions: undefined }];
    expect(
      nextDocument(
        initialState(),
        sample,
        rolls(SPEAKI_CHANCE - Number.EPSILON, 0),
      ).current?.id,
    ).toBe(source.id);
    expect(
      nextDocument(
        initialState(),
        sample,
        rolls(SPEAKI_CHANCE, SPECIAL_CHANCE, 0, 0),
      ).current?.id,
    ).toBe(daily.id);
    expect(
      nextDocument(initialState(), sample, rolls(SPEAKI_CHANCE, 0, 0)).current
        ?.id,
    ).toBe(special.id);
    const mandatory = {
      ...cards.find((c) => c.kind === 'story')!,
      trigger: { year: 0, order: 0 },
      conditions: undefined,
    };
    expect(
      nextDocument(initialState(), [...sample, mandatory], () => 0).current?.id,
    ).toBe(mandatory.id);
  });

  it('enforces the year gap and once per run, ignores NPC gaps, and allows another after a catch', () => {
    const first = nextDocument(
      { ...initialState(), npcYears: { speaki: 0, other: 0 } },
      pool,
      () => 0,
    );
    expect(first.current?.kind).toBe('speaki');
    expect(first.appearanceYears[first.current!.id]).toEqual([0]);
    expect(first.npcYears).toEqual({ speaki: 0, other: 0 });
    const caught = processDocument(first, 'axe', pool, () => 0);
    expect(caught.scene).toBe(first.current!.axeResult!.scene);
    const resume = { ...caught, scene: null, current: null };
    expect(
      nextDocument({ ...resume, year: SPEAKI_GAP - 1 }, pool, () => 0).current
        ?.kind,
    ).toBe('daily');
    const second = nextDocument({ ...resume, year: SPEAKI_GAP }, pool, () => 0);
    expect(second.current?.kind).toBe('speaki');
    expect(second.current?.id).not.toBe(first.current?.id);
    expect(
      nextDocument(
        {
          ...second,
          current: null,
          year: SPEAKI_GAP * 2,
          seen: forgeries.map((c) => c.id),
        },
        pool,
        () => 0,
      ).current?.kind,
    ).toBe('daily');
  });

  it('requires both own and target conditions and an existing daily target', () => {
    const source = {
      ...mimic,
      conditions: {
        minYear: SPEAKI_GAP,
        flagsAll: ['own'],
        gauges: { people: { min: 40 } },
      },
    };
    const original = {
      ...daily,
      conditions: {
        flagsAll: ['target'],
        flagsNone: ['blocked'],
        gauges: { sugar: { max: 60 } },
      },
    };
    const sample = [
      daily,
      { ...original, id: 'conditioned' },
      { ...source, mimic: 'conditioned' },
    ];
    const state = {
      ...initialState(),
      year: SPEAKI_GAP,
      flags: ['own', 'target'],
    };
    expect(nextDocument(state, sample, () => 0).current?.kind).toBe('speaki');
    for (const patch of [
      { year: SPEAKI_GAP - 1 },
      { flags: ['own'] },
      { flags: ['target'] },
      { flags: ['own', 'target', 'blocked'] },
      { gauges: { ...state.gauges, people: 39 } },
      { gauges: { ...state.gauges, sugar: 61 } },
    ])
      expect(
        nextDocument({ ...state, ...patch }, sample, () => 0).current?.kind,
      ).toBe('daily');
    for (const badTarget of ['missing', source.id])
      expect(
        nextDocument(state, [daily, { ...source, mimic: badTarget }], () => 0)
          .current?.kind,
      ).toBe('daily');
  });

  it.each(['reject', 'approve'] as const)(
    'stamping %s has no copied side effects and raises drowse',
    (side) => {
      const forged = materializeCard(mimic, cards);
      forged[side] = {
        ...forged[side],
        setFlags: ['bad'],
        relations: { speaki: 1 },
        grant: { boon: 'rewind' },
        schedule: { card: 'bad', years: 1 },
      };
      const state = { ...initialState(), current: forged };
      const after = processDocument(state, side, pool, () => 0);
      expect(after.gauges).toEqual(state.gauges);
      expect(after.flags).toEqual([]);
      expect(after.relations).toEqual({});
      expect(after.boons).toEqual({});
      expect(after.scheduled).toEqual({});
      expect(after.drowse.stack).toBe(1);
      expect(after.scene).toBe(forged.missed!.scene);
      expect(after.year).toBe(forged.years);
    },
  );

  it('simulator policies choose by visible effects and careful can axe a forgery', () => {
    const forged = materializeCard(mimic, cards);
    const visibleDaily = {
      ...forged,
      kind: 'daily' as const,
      axe: true as const,
    };
    for (const policy of ['balanced', 'careful'] as const)
      expect(
        playerAction({ ...initialState(), current: forged }, policy, () => 0),
      ).toBe(
        playerAction(
          { ...initialState(), current: visibleDaily },
          policy,
          () => 0,
        ),
      );
    const lethal = {
      ...forged,
      reject: { ...forged.reject, effects: { sugar: -20 } },
      approve: { ...forged.approve, effects: { sugar: -20 } },
    };
    expect(
      playerAction(
        {
          ...initialState(),
          gauges: { ...initialState().gauges, sugar: 5 },
          current: lethal,
        },
        'careful',
        () => 0,
      ),
    ).toBe('axe');
  });
});

describe('Speaki validation and editing', () => {
  it('validates data and rejects invalid mimic targets, copied fields, text, axe and scenes', () => {
    expect(validateCards(cards)).toEqual([]);
    const check = (patch: Record<string, unknown>) =>
      validateCards([target, { ...mimic, ...patch }]);
    expect(check({ mimic: target.id })).toEqual([]);
    for (const value of ['missing', mimic.id, 123])
      expect(check({ mimic: value })).toContain(
        '[1] mimic must reference an existing daily card on speaki cards only',
      );
    for (const key of ['speaker', 'faction', 'title', 'reject', 'approve'])
      expect(check({ [key]: target[key as keyof Card] })).toContain(
        `[1] mimic cards must not define ${key}`,
      );
    expect(check({ text: '' })).toContain('[1] text must be a nonempty string');
    expect(check({ axe: true })).toContain(
      '[1] speaki cards must have free axe',
    );
    expect(check({ missed: { scene: 'missing' } })).toContain(
      '[1] missed must specify a valid system scene on free axe cards only',
    );
    expect(check({ axeResult: { scene: 'missing' } })).toContain(
      '[1] invalid axeResult',
    );
    expect(validateCards([{ ...target, mimic: target.id }])).toContain(
      '[0] mimic must reference an existing daily card on speaki cards only',
    );
    const standalone = forgeries.find((c) => !c.mimic)!;
    expect(validateCards([{ ...standalone, title: '' }])).toContain(
      '[0] title must be a nonempty string',
    );
  });

  it('filters by the target title and round-trips compact mimic cards through read-only fields', () => {
    document.body.innerHTML = readFileSync('editor.html', 'utf8');
    const root = document.getElementById('form')!;
    initializeForm(root);
    expect(listedCards(cards, 'speaki', target.title)).toContain(mimic);
    expect(listedCards(cards, 'speaki')).toEqual(forgeries);
    for (const card of forgeries) {
      fillForm(root, card, cards);
      expect(readForm(root, card)).toEqual(card);
      if (card.mimic) {
        expect(
          (root.querySelector('#f-title') as HTMLInputElement).disabled,
        ).toBe(true);
        expect((root.querySelector('#f-title') as HTMLInputElement).value).toBe(
          materializeCard(card, cards).title,
        );
        (root.querySelector('#f-text') as HTMLTextAreaElement).value =
          'Edited forgery';
        expect(readForm(root, card)).toEqual({
          ...card,
          text: 'Edited forgery',
        });
      }
    }
  });
});
