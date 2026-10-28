// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import rawCards from '../data/cards/m1.json';
import type { Card } from '../src/core/state';
import {
  commaList,
  duplicateCard,
  fillForm,
  initializeForm,
  listedCards,
  newCard,
  readForm,
  switchKind,
  uniqueId,
} from '../src/editor/form';
import { validateCards } from '../tools/validate-cards';
import { renderPreview } from '../src/editor/preview';
import system from '../data/system.json';
const cards = rawCards as Card[];
let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  root = document.getElementById('form')!;
  initializeForm(root);
});
const input = (id: string, value: string) => {
  (document.getElementById(id) as HTMLInputElement).value = value;
};
describe('editor form', () => {
  it.each([-25, 25])('allows delta %s only on adjust results', (delta) => {
    const card = structuredClone(
      cards.find((c) => c.id === 'special_sist_deal_late')!,
    );
    delete card.look;
    delete card.approve.schedule;
    card.approve.adjust = 10;
    card.approve.effects.sugar = delta;
    expect(validateCards([card])).toEqual([]);
    delete card.approve.adjust;
    expect(validateCards([card])).toContain(`[0] invalid delta ${delta}`);
    card.reject.adjust = 10;
    expect(validateCards([card])).toContain(`[0] invalid delta ${delta}`);
  });

  it('round-trips the late Sist deal delta', () => {
    const card = structuredClone(cards.find((c) => c.id === 'special_sist_deal_late')!);
    fillForm(root, card);
    expect(readForm(root, card)).toEqual(card);
    // the price lives in the data; the owner tunes it in the editor
    expect(readForm(root, card).approve.effects.sugar).toBe(
      card.approve.effects.sugar,
    );
  });

  it('validates special look only on story/fixed cards', () => {
    const story = cards.find((c) => c.id === 'story_diana_thanks')!;
    expect(validateCards([story])).toEqual([]);
    for (const look of ['story', '', true, null, undefined])
      expect(validateCards([{ ...story, look }])).toContain(
        '[0] look must be special, quest or hard on story/fixed cards',
      );
    for (const kind of ['daily', 'special', 'speaki'] as const)
      expect(
        validateCards([{ ...switchKind(story, kind), look: 'special' }]),
      ).toContain(
        '[0] look must be special, quest or hard on story/fixed cards',
      );
  });

  it.each(['fixed_beast_kids_bread', 'fixed_beast_kids_bread_again'])(
    'preserves the counted axe, window and schedule when editing %s',
    (id) => {
      const card = cards.find((c) => c.id === id)!;
      fillForm(root, card);
      const axe = root.querySelector<HTMLSelectElement>('#f-axe')!;
      expect(axe.value).toBe('true');
      expect([...axe.options].find((o) => o.value === 'true')!.disabled).toBe(
        false,
      );
      expect(readForm(root, card)).toEqual(card);
      expect(validateCards(cards)).toEqual([]);
    },
  );

  it.each(['story', 'fixed'] as const)(
    'edits direction stamps on %s cards',
    (kind) => {
      const card = switchKind(
        cards.find((c) => c.id === 'story_escape_1')!,
        kind,
      );
      fillForm(root, card);
      const checkbox = root.querySelector<HTMLSelectElement>('#f-stamps')!;
      expect(checkbox.value).toBe('direction');
      expect([...checkbox.options].map((o) => o.textContent)).toEqual([
        '없음',
        '좌·우 화살표',
        '빛',
        '손 내밀기',
      ]);
      expect(checkbox.closest<HTMLElement>('[data-kinds]')!.hidden).toBe(false);
      expect(root.querySelector('.reject .ed-choice-name')!.textContent).toBe(
        '왼쪽',
      );
      expect(root.querySelector('.approve .ed-choice-name')!.textContent).toBe(
        '오른쪽',
      );
      expect(readForm(root, card).stamps).toBe('direction');
      checkbox.value = '';
      expect(readForm(root, card)).not.toHaveProperty('stamps');
      checkbox.value = 'light';
      expect(readForm(root, card).stamps).toBe('light');
      fillForm(root, { ...card, stamps: 'light' });
      expect(checkbox.value).toBe('light');
      expect(root.querySelector('.reject .ed-choice-name')!.textContent).toBe(
        '빛으로',
      );
      expect(root.querySelector('.approve .ed-choice-name')!.textContent).toBe(
        '빛으로',
      );
      checkbox.value = 'meet';
      expect(readForm(root, card).stamps).toBe('meet');
      fillForm(root, { ...card, stamps: 'meet' });
      expect(checkbox.value).toBe('meet');
      for (const side of ['reject', 'approve'])
        expect(
          root.querySelector(`.${side} .ed-choice-name`)!.textContent,
        ).toBe('손을 내민다');
      checkbox.value = 'direction';
      expect(readForm(root, card).stamps).toBe('direction');
      for (const other of ['daily', 'special', 'speaki'] as const) {
        const switched = switchKind(card, other);
        expect(switched).not.toHaveProperty('stamps');
        fillForm(root, switched);
        expect(checkbox.closest<HTMLElement>('[data-kinds]')!.hidden).toBe(
          true,
        );
      }
    },
  );

  it('edits hyean uses and preserves other grants', () => {
    const card = cards.find((c) => c.id === 'story_diana_thanks')!;
    fillForm(root, card);
    expect(
      root.querySelector<HTMLElement>('[data-grant-uses="reject"]')!.hidden,
    ).toBe(false);
    expect(
      root.querySelector('[data-grant-uses="reject"]')!.textContent,
    ).toContain('횟수');
    expect(readForm(root, card)).toEqual(card);
    input('reject-grant-uses', '3');
    expect(readForm(root, card).reject.grant).toEqual({
      boon: 'hyean',
      uses: 3,
    });
    const other = {
      ...card,
      reject: { ...card.reject, grant: { boon: 'alice' as const } },
    };
    fillForm(root, other);
    expect(
      root.querySelector<HTMLElement>('[data-grant-uses="reject"]')!.hidden,
    ).toBe(true);
    expect(readForm(root, other)).toEqual(other);
  });
  it.each(['story', 'fixed', 'daily', 'special'] as const)(
    'round trips every %s card, preserving unexposed data',
    (kind) => {
      for (const card of cards.filter((c) => c.kind === kind)) {
        fillForm(root, card);
        expect(readForm(root, card)).toEqual(card);
      }
    },
    // ~170 daily cards through the DOM form: slow under a parallel full run
    30000,
  );
  it('trims comma lists, omits empty keys and zero effects', () => {
    const card = cards.find((c) => c.kind === 'daily')!;
    fillForm(root, card);
    input('f-minYear', '');
    input('f-maxYear', '');
    input('reject-flags', ' one, , two ,');
    input('f-flagsAll', ' , ready, ');
    input('f-flagsNone', ' , ');
    root
      .querySelectorAll('.ed-effects button')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.getAttribute('data-value') === '0'),
        ),
      );
    const result = readForm(root, card);
    expect(result.reject.setFlags).toEqual(['one', 'two']);
    expect(result.conditions).toEqual({ flagsAll: ['ready'] });
    expect(result.reject.effects).toEqual({});
    expect(result.approve.effects).toEqual({});
    input('reject-flags', '');
    input('f-flagsAll', '');
    expect(readForm(root, result).reject).not.toHaveProperty('setFlags');
    expect(readForm(root, result)).not.toHaveProperty('conditions');
    expect(commaList(' , ')).toEqual([]);
  });
  it('locks story effects to zero, and shows applicable fields', () => {
    const card = switchKind(
      cards.find((c) => c.kind === 'daily')!,
      'story',
    );
    fillForm(root, card);
    expect(
      [...root.querySelectorAll<HTMLButtonElement>('.ed-effects button')].every(
        (b) => b.disabled,
      ),
    ).toBe(true);
    expect(
      [
        ...root.querySelectorAll<HTMLElement>(
          '.ed-effects [aria-pressed="true"]',
        ),
      ].every((b) => b.dataset.value === '0'),
    ).toBe(true);
    expect(root.querySelector('.reject .ed-choice-name')?.textContent).toBe(
      '승인',
    );
    expect(
      root.querySelector<HTMLElement>('[data-kinds="daily"]')!.hidden,
    ).toBe(true);
    expect(readForm(root, card).reject.effects).toEqual({});
  });
  it('applies kind switch rules without losing content', () => {
    const original = cards.find((c) => c.kind === 'daily')!;
    fillForm(root, original);
    input('f-kind', 'story');
    const story = readForm(root, original);
    expect(story).toMatchObject({
      title: original.title,
      text: original.text,
      trigger: { year: 0, order: 0 },
      axe: false,
      reject: { effects: {} },
    });
    const daily = switchKind(story, 'daily');
    expect(daily.tier).toBe(1);
    expect(daily).not.toHaveProperty('trigger');
    const special = switchKind(daily, 'special');
    expect(special.axe).toBe('free');
    expect(special.axeResult?.scene).toBe(Object.keys(system.scenes)[0]);
    expect(
      validateCards(
        [story, daily, special].map((c, i) => ({ ...c, id: String(i) })),
      ),
    ).toEqual([]);
    fillForm(root, special);
    input('f-axe-flags', 'caught, ,done');
    expect(readForm(root, special).axeResult?.setFlags).toEqual([
      'caught',
      'done',
    ]);
  });
  it('generates distinct template and duplicate IDs', () => {
    const list = [...cards];
    for (const kind of ['story', 'fixed', 'daily', 'special'] as const) {
      const first = newCard(list, kind);
      list.push(first);
      const copy = duplicateCard(list, first);
      list.push(copy);
      expect(first.id).not.toBe(copy.id);
      expect(copy.id).not.toBe(uniqueId(list, kind));
      copy.reject.label = 'changed';
      expect(first.reject.label).toBe('');
    }
  });
  it('sorts scheduled events by year/order, then daily tier/title, then specials; filters names and content', () => {
    const base = cards[0]!;
    const sample: Card[] = [
      { ...base, id: 'special', kind: 'special' },
      { ...base, id: 'late', trigger: { year: 2, order: 0 } },
      { ...base, id: 'tier2', kind: 'daily', tier: 2, title: 'a' },
      { ...base, id: 'b', kind: 'daily', tier: 1, title: 'b' },
      { ...base, id: 'early2', kind: 'fixed', trigger: { year: 0, order: 2 } },
      { ...base, id: 'a', kind: 'daily', tier: 1, title: 'a' },
      { ...base, id: 'early1', trigger: { year: 0, order: 1 } },
    ];
    expect(listedCards(sample).map((c) => c.id)).toEqual([
      'early1',
      'early2',
      'late',
      'a',
      'b',
      'tier2',
      'special',
    ]);
    expect(listedCards(sample, 'daily').map((c) => c.id)).toEqual([
      'a',
      'b',
      'tier2',
    ]);
    expect(listedCards(sample, 'all', system.speakers.erpin.name)).toHaveLength(
      sample.length,
    );
    expect(listedCards(sample, 'all', 'not present')).toEqual([]);
    expect(listedCards(sample, 'all', base.text.slice(0, 8))).toHaveLength(
      sample.length,
    );
  });
  it('uses real game caption and gauge preview markup', () => {
    const card = cards.find(
      (c) => c.kind === 'daily' && Object.keys(c.approve.effects).length,
    )!;
    renderPreview(root, card, 'approve');
    expect(root.querySelector('.ner-line')).toBeNull();
    expect(root.querySelector('.choice-caption')?.textContent).toBe(
      card.approve.label,
    );
    expect(root.querySelectorAll('.preview-dot:not([hidden])')).toHaveLength(
      Object.keys(card.approve.effects).length,
    );
    renderPreview(root, card, 'axe');
    expect(root.querySelector('.choice-caption')?.textContent).toBe(
      system.axeLine,
    );
    renderPreview(root, card, null);
    expect(root.querySelector('.choice-caption')?.textContent).toBe('');
  });
});

it('preserves unknown card, choice, condition and trigger keys on round-trip', () => {
  const card = {
    ...cards.find((c) => c.trigger?.scheduled)!,
    future: { enabled: true },
  };
  const extended = Object.assign(card, {
    trigger: { ...card.trigger!, future: true },
    conditions: { ...card.conditions, future: [1] },
    approve: { ...card.approve, future: 'kept' },
  });
  fillForm(root, extended);
  expect(readForm(root, extended)).toEqual(extended);
});

it('views, edits and clears variant pools without losing fixed card fields', () => {
  for (const card of cards.filter((c) => c.variant)) {
    fillForm(root, card);
    expect(readForm(root, card)).toEqual(card);
    expect(
      root
        .querySelector<HTMLElement>('#f-variant-group')!
        .closest<HTMLElement>('[data-kinds]')!.hidden,
    ).toBe(false);
    input('f-variant-group', 'other');
    input('f-variant-pool', '4');
    expect(readForm(root, card).variant).toEqual({ group: 'other', pool: 4 });
    input('f-variant-group', '');
    expect(readForm(root, card)).not.toHaveProperty('variant');
    expect(switchKind(card, 'daily').variant).toEqual(card.variant);
  }
});

it('loads the practicum values and exposes intuition in the grant selector', () => {
  const card = cards.find((c) => c.id === 'special_fricle_pikora')!;
  fillForm(root, card);
  for (const [id, expected] of [['reject-witchPress-amount', '10'], ['reject-witchPress-floor', '15'], ['approve-witchDrift-perDoc', '5'], ['approve-witchDrift-turns', '6']] as const)
    expect((document.getElementById(id) as HTMLInputElement).value).toBe(expected);
  expect(readForm(root, card)).toEqual(card);
  expect(root.querySelector('#approve-grant-boon option[value="intuition"]')).not.toBeNull();
});
