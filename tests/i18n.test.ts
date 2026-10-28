// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ja from '../data/i18n/ja.json';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { join } from 'node:path';
import base from '../data/system.json';
import rawCards from '../data/cards/m1.json';
import {
  defaultLanguage,
  format,
  localizeCard,
  mergeStrings,
  setLanguage,
} from '../src/i18n';
import { mount } from '../src/ui/app';
import { system } from '../src/i18n';
import { initialState, type Card } from '../src/core/state';
import {
  loadRun,
  loadSettings,
  saveRun,
  saveSettings,
} from '../src/save/storage';
import { validateTranslations } from '../tools/validate-cards';

vi.mock('../data/i18n/en.json', async () => {
  const { default: cards } = await import('../data/cards/m1.json');
  const daily = cards.find((card) => card.kind === 'daily')!;
  return {
    default: {
      system: {
        title: { options: 'Options' },
        options: { title: 'Options', languages: { ko: 'ignored' } },
        ui: { calendar: 'Year' },
        gameOvers: { sugar_low: { title: 'Sugar riot' } },
        tutorial: { steps: [{ title: 'Documents' }] },
      },
      cards: {
        [daily.id]: {
          title: 'Translated document',
          text: 'Translated body',
          approve: 'Accept',
        },
      },
    },
  };
});

let root: HTMLDivElement;
let dispose: (() => void) | undefined;
const click = (selector: string) =>
  root.querySelector<HTMLButtonElement>(selector)!.click();
function changeLanguage(lang: string): void {
  root.querySelector<HTMLButtonElement>(`.flag[data-lang="${lang}"]`)!.click();
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  saveSettings({
    sfx: 0,
    lastSfx: 100,
    bgm: 0,
    language: 'ko',
    tutorialSeen: true, musicAsked: true,
  });
  root = document.createElement('div');
  document.body.append(root);
  vi.spyOn(history, 'pushState').mockImplementation(() => {});
  vi.spyOn(history, 'back').mockImplementation(() => {});
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  root.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setLanguage('ko');
});
it('merges nested strings and array indices with Korean fallback and fixed language labels', () => {
  const merged = mergeStrings(base, {
    tutorial: { steps: [{ title: 'First' }] },
    options: { languages: { ko: 'Wrong', en: 'Wrong', ja: 'Wrong' } },
  });
  expect(merged.tutorial.steps).toHaveLength(base.tutorial.steps.length);
  expect(merged.tutorial.steps[0]).toEqual({
    ...base.tutorial.steps[0],
    title: 'First',
  });
  expect(merged.tutorial.steps[1]).toEqual(base.tutorial.steps[1]);
  expect(merged.options.languages).toEqual({
    ko: '한국어',
    en: 'English',
    ja: '日本語',
  });
  expect(merged.notice).toBe(base.notice);
  expect(mergeStrings(base, { notice: 4 }).notice).toBe(base.notice);
});
it('takes browser defaults and gives a valid saved language priority', () => {
  for (const [browser, expected] of [
    ['ko-KR', 'ko'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['fr', 'en'],
  ]) {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(browser!);
    localStorage.removeItem('ner-settings');
    expect(defaultLanguage()).toBe(expected);
    expect(loadSettings().language).toBe(expected);
  }
  saveSettings({ ...loadSettings(), language: 'ja' });
  expect(loadSettings().language).toBe('ja');
});
it('re-renders title and open options immediately and injects Japanese fonts once', () => {
  dispose = mount(root);
  click('.options-open');
  changeLanguage('en');
  expect(document.documentElement.lang).toBe('en');
  expect(root.querySelector('#options-title')!.textContent).toBe('Options');
  expect(root.querySelector('.options-open')!.getAttribute('title')).toBe(
    'Options',
  );
  expect(loadSettings().language).toBe('en');
  expect(root.querySelectorAll('.preferences-overlay')).toHaveLength(1);
  expect(root.querySelector<HTMLElement>('.title-screen')!.inert).toBe(true);
  changeLanguage('ja');
  changeLanguage('ko');
  changeLanguage('ja');
  expect(document.querySelectorAll('#japanese-fonts')).toHaveLength(1);
  expect(
    document.querySelector<HTMLLinkElement>('#japanese-fonts')!.href,
  ).toContain('display=swap');
  click('[data-close]');
  expect(root.querySelector<HTMLElement>('.title-screen')!.inert).toBeFalsy();
});
it('keeps current run, rewind history, collection, and menu when changing language and continuing', () => {
  const cards = rawCards as Card[];
  const state = {
    ...initialState(),
    year: 42,
    current: cards.find((card) => card.kind === 'daily')!,
    boons: { rewind: true as const },
    drowse: { stack: 1 as const, left: 4 },
  };
  const { past: _, ...snapshot } = state;
  state.past = [snapshot];
  saveRun(state);
  dispose = mount(root);
  click('.title-continue');
  const before = loadRun(cards);
  click('.menu-button');
  click('[data-menu="options"]');
  changeLanguage('en');
  expect(root.querySelector('.document h1')!.textContent).toBe(
    'Translated document',
  );
  expect(root.querySelector('.body-text')!.textContent).toBe('Translated body');
  expect(root.querySelector('.year')!.textContent).toBe('Year 42년');
  expect(root.querySelector<HTMLElement>('.menu')!.hidden).toBe(false);
  expect(loadRun(cards)).toEqual(before);
  const saved = JSON.parse(localStorage.getItem('ner-m1-run')!);
  expect(saved.state.current).toEqual({ id: state.current.id });
  expect(saved.state.past[0].current).toEqual({ id: state.current.id });
  click('[data-close]');
  dispose();
  dispose = mount(root);
  click('.title-continue');
  expect(root.querySelector('.document h1')!.textContent).toBe(
    'Translated document',
  );
  expect(loadRun(cards)).toEqual(before);
});
it('keeps a reset run discarded when the open options dialog changes language', () => {
  const cards = rawCards as Card[];
  saveRun({
    ...initialState(),
    current: cards.find((card) => card.kind === 'daily')!,
  });
  dispose = mount(root);
  click('.title-continue');
  click('.menu-button');
  click('[data-menu="options"]');
  click('.erase-records');
  click('.erase-yes');
  changeLanguage('en');
  expect(loadRun(cards)).toBeNull();
  click('[data-close]');
  expect(root.querySelector('.title-screen')).not.toBeNull();
  expect(root.querySelector('.title-continue')).toBeNull();
});
it('refreshes an ending, tutorial step and album details using live system copy', () => {
  const state = {
    ...initialState(),
    current: (rawCards as Card[]).find((card) => card.kind === 'daily')!,
    ending: { id: 'sugar_low' },
  };
  // A saved ending is displayed through the same continue/render path.
  saveRun(state);
  dispose = mount(root);
  click('.title-continue');
  setLanguage('en');
  expect(root.querySelector('.ending-paper h1')!.textContent).toBe(
    'Sugar riot',
  );
  click('.return');
  click('.album-open');
  click('.album-card[data-ending="sugar_low"]');
  setLanguage('ko');
  setLanguage('en');
  expect(
    root.querySelector('.album-detail:not([hidden]) h3')!.textContent,
  ).toBe('Sugar riot');
  click('.album-close');
  click('.tutorial-open');
  setLanguage('ko');
  setLanguage('en');
  expect(root.querySelector('#tutorial-title')!.textContent).toBe('Documents');
  click('.tutorial-next');
  setLanguage('ja');
  expect(root.querySelector('#tutorial-title')!.textContent).toBe(
    ja.system.tutorial.steps[1]!.title,
  );
});
it('overlays only card copy and preserves all logic and missing fields', () => {
  const card = (rawCards as Card[]).find((card) => card.kind === 'daily')!;
  const localized = localizeCard(card, {
    cards: { [card.id]: { title: 'Title', approve: 'Accept' } },
  });
  expect(localized).toEqual({
    ...card,
    title: 'Title',
    approve: { ...card.approve, label: 'Accept' },
  });
  expect(card.title).not.toBe('Title');
  expect(localized.approve.effects).toBe(card.approve.effects);
});
it('validates ids, paths, string values and required Korean placeholders', () => {
  const result = validateTranslations(
    {
      system: {
        title: { yearUnit: 'Year', nonexistent: 'Unknown' },
        notice: 5,
      },
      cards: { unknown: { title: 'Unknown' } },
    },
    rawCards,
  );
  expect(result.errors.join('\n')).toContain('unknown card id');
  expect(result.errors.join('\n')).toContain('unknown system path');
  expect(result.errors.join('\n')).toContain('translation must be a string');
  expect(result.errors.join('\n')).toContain('missing placeholder {year}');
  const card = (rawCards as Card[]).find((card) => card.kind === 'daily')!;
  const sourceCards = [{ ...card, title: '제목 {name}' }];
  expect(
    validateTranslations(
      { cards: { [card.id]: { title: 'Title' } } },
      sourceCards,
    ).errors,
  ).toContain(`cards.${card.id}.title: missing placeholder {name}`);
  expect(
    validateTranslations({ system: {}, cards: {} }, rawCards).errors,
  ).toEqual([]);
  expect(
    validateTranslations(
      {
        system: { tutorial: { steps: [{ title: 'First' }] } },
        cards: { [card.id]: { title: 'Title' } },
      },
      rawCards,
    ),
  ).toMatchObject({
    errors: [],
    cards: 1,
    system: 1,
    totalCards: rawCards.length,
  });
});
it('keeps all Hangul out of runtime TypeScript except comments', () => {
  const printer = ts.createPrinter({ removeComments: true });
  for (const dir of ['ui', 'core', 'save']) {
    const folder = join(process.cwd(), 'src', dir);
    for (const file of readdirSync(folder).filter((file) =>
      file.endsWith('.ts'),
    )) {
      const text = readFileSync(join(folder, file), 'utf8');
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      expect(printer.printFile(source), `${dir}/${file}`).not.toMatch(
        /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/,
      );
    }
  }
});

it('formats plain values, singular and plural branches, preserving unknown keys', () => {
  expect(format('{n} {n|document|documents}', { n: 1 })).toBe('1 document');
  expect(format('{n|one|other}', { n: '1' })).toBe('one');
  for (const n of [0, 2, -1, '01', 'many'])
    expect(format('{n|one|other}', { n })).toBe('other');
  expect(format('{missing} {missing|one|other} {n}', { n: 0 })).toBe(
    '{missing} {missing|one|other} 0',
  );
  expect(format('{toString|one|other}', {})).toBe('{toString|one|other}');
});

it.each(['erase', 'unlock'] as const)(
  'preserves the %s confirmation and completion across language changes',
  (action) => {
    dispose = mount(root);
    click('.options-open');
    click(action === 'erase' ? '.erase-records' : '.unlock-bishop');
    changeLanguage('en');
    expect(root.querySelector<HTMLElement>(`.${action}-confirm`)!.hidden).toBe(
      false,
    );
    expect(document.activeElement).toBe(root.querySelector(`.${action}-no`));
    click(`.${action}-yes`);
    changeLanguage('ja');
    expect(root.querySelector('.reset-status')!.textContent).toBe(
      action === 'erase' ? system.options.eraseDone : system.options.unlockDone,
    );
    expect(
      root.querySelector<HTMLButtonElement>('.unlock-bishop')!.disabled,
    ).toBe(action === 'unlock');
  },
);
