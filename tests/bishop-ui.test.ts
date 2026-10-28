// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import {
  advanceBishop,
  answerCard,
  bishopConfig,
  bishopDeck,
} from '../src/core/bishop';
import { nextDocument } from '../src/core/deck';
import { choiceEffects } from '../src/core/loop';
import { initialState, type Card, type State } from '../src/core/state';
import { fillForm, initializeForm, readForm } from '../src/editor/form';
import {
  emptyCollection,
  loadCollection,
  loadMode,
  loadRun,
  saveCollection,
  saveMode,
  saveRun,
  saveSettings,
} from '../src/save/storage';
import { setLanguage, system } from '../src/i18n';
import { mount } from '../src/ui/app';
import { bishopBar, bishopNotice, bishopSheet } from '../src/ui/bishop';
import { deskMarkup } from '../src/ui/desk';
import { gaugesMarkup, previewFor, updateGaugePreview } from '../src/ui/gauges';
import { titleScreen } from '../src/ui/screens';
import { bindTitle } from '../src/ui/title';

const cards = raw as Card[];
const deck = bishopDeck(cards);
const bishop = () => initialState('bishop', () => 0);
const daily = {
  ...deck.find((c) => c.kind === 'daily')!,
  reject: { label: 'x', effects: { sugar: 20 } },
};
let root: HTMLDivElement;
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setLanguage('ko');
  saveSettings({
    sfx: 0,
    bgm: 0,
    lastSfx: 75,
    language: 'ko',
    tutorialSeen: true, musicAsked: true,
  });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
  setLanguage('ko');
});

it.each(['apprentice', 'priest'] as const)(
  'unlocks bishop after clearing %s and lets the title select and start it',
  (mode) => {
    const collection = emptyCollection();
    collection.cleared[mode] = true;
    root.innerHTML = titleScreen(collection);
    const bishop = root.querySelector<HTMLButtonElement>(
      '[data-mode="bishop"]',
    )!;
    expect(bishop.hasAttribute('aria-disabled')).toBe(false);
    expect(bishop.querySelector('.mode-lock')).toBeNull();
    const start = vi.fn();
    const select = vi.fn();
    dispose = bindTitle(root, 'priest', select, start, { tutorial: vi.fn() });
    bishop.click();
    expect(select).toHaveBeenCalledWith('bishop');
    bishop.click();
    vi.advanceTimersByTime(620);
    expect(start).toHaveBeenCalledOnce();
  },
);
it('keeps the lock label when activated by keyboard', () => {
  root.innerHTML = titleScreen(emptyCollection());
  const start = vi.fn();
  dispose = bindTitle(root, 'priest', vi.fn(), start, { tutorial: vi.fn() });
  const paper = root.querySelector<HTMLButtonElement>('[data-mode="bishop"]')!;
  paper.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  expect(paper.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
  expect(start).not.toHaveBeenCalled();
  vi.advanceTimersByTime(450);
  expect(paper.querySelector('.mode-lock')!.textContent).toBe(
    system.modes.bishop.locked,
  );
});
it('renders the flow, counted omens, blessings and accessible descriptions only in bishop', () => {
  const state = bishop();
  state.year = 6;
  state.bishop!.flow = { id: 'harvest', until: 20 };
  state.bishop!.omens = [{ id: 'ants' }, { id: 'ants' }];
  state.bishop!.blessings = ['careful'];
  root.innerHTML = bishopBar(state) + bishopSheet(state);
  expect(
    root.querySelector('[data-omen="ants"] .bishop-repeat')!.textContent,
  ).toBe('2');
  expect(root.querySelectorAll('[data-omen="ants"]')).toHaveLength(1);
  const pill = root.querySelector('.bishop-pill')!;
  expect(pill.textContent).toContain('14');
  expect(pill.getAttribute('data-flow')).toBe('harvest');
  expect(pill.querySelector('.bishop-pill-count')!.textContent).toBe(system.bishop.multCount.replace('{n}', '4'));
  expect(root.querySelector('.bishop-flow')!.textContent).toContain(
    system.bishop.flows.harvest.desc,
  );
  expect(root.querySelector('[data-omen="ants"]')!.textContent).toContain(
    system.bishop.omens.ants.desc,
  );
  expect(
    root.querySelector('[data-blessing="careful"]')!.textContent,
  ).toContain(system.bishop.blessings.careful.desc);
  expect(bishopBar(initialState())).toBe('');
  expect(bishopBar(bishop())).toContain(system.bishop.multNone);
});
it('renders the answer choices, translated copy and full blessing stamp labels', () => {
  const state = bishop();
  state.current = answerCard(['napprayer', 'careful']);
  state.sleep = 2;
  for (const language of ['ko', 'en', 'ja'] as const) {
    setLanguage(language);
    root.innerHTML = deskMarkup(state);
    expect(root.querySelectorAll('.bishop-choice')).toHaveLength(2);
    expect(
      root
        .querySelector('[data-side="approve"]')!
        .getAttribute('data-blessing'),
    ).toBe('careful');
    expect(root.querySelector('.sender h1')!.textContent).toBe(
      system.bishop.answer.title,
    );
    expect(root.querySelector('.document-number')!.textContent).toContain(
      system.factions.fairy,
    );
    expect(
      root.querySelector('[data-action="reject"] .tool-name')!.textContent,
    ).toContain(system.bishop.blessings.napprayer.name);
    expect(root.querySelector('.desk.sleeping')).toBeNull();
  }
  state.current = answerCard(['careful']);
  root.innerHTML = deskMarkup(state);
  expect(root.querySelectorAll('.bishop-choice')).toHaveLength(1);
  expect(
    root.querySelector('[data-action="approve"]')!.getAttribute('aria-label'),
  ).toBe(system.bishop.blessings.careful.name);
});
it('uses the final effective size for bishop pips and hyean, matching applied effects', () => {
  const state = bishop();
  state.year = 1000;
  state.bishop!.blessings = ['sweet'];
  const expected = choiceEffects(
    daily.reject,
    state.gauges,
    daily.kind,
    state.year,
    [],
    state,
    daily,
  ).sugar!;
  expect(
    previewFor(daily, 'reject', state.gauges, state.year, [], state)[0]!.size,
  ).toBe(expected);
  root.innerHTML = gaugesMarkup(state);
  updateGaugePreview(root, daily, 'reject', false, state);
  const dot = root.querySelector<HTMLElement>(
    '[data-gauge="sugar"] .preview-dot',
  )!;
  expect(dot.dataset.tier).toBe('4');
  expect(dot.dataset.dir).toBeUndefined();
  expect(dot.getAttribute('aria-label')).toContain(String(expected));
  state.boons.hyean = { left: 1 };
  updateGaugePreview(root, daily, 'reject', false, state);
  expect(dot.textContent).toBe('+' + expected);
  expect(dot.dataset.dir).toBe('up');
});
it('counts bishop preview pips from the effective change rather than the base', () => {
  const state = bishop();
  state.year = 1000;
  state.bishop!.blessings = ['sweet'];
  const small = { ...daily, reject: { label: 'x', effects: { sugar: 5 } } };
  root.innerHTML = gaugesMarkup(state);
  updateGaugePreview(root, small, 'reject', false, state);
  const dot = root.querySelector<HTMLElement>(
    '[data-gauge="sugar"] .preview-dot',
  )!;
  expect(dot.dataset.pips).toBe('2');
  expect(dot.dataset.tier).toBe('1');
});
it('has no dread desk or embers even after year 200', () => {
  for (const year of [186, 200, 1000]) {
    root.innerHTML = deskMarkup({ ...bishop(), year, current: daily });
    expect(
      root.querySelector('.desk.dread, .embers, [data-finale]'),
    ).toBeNull();
  }
});
it.each(['omen', 'embraceGift', 'embrace'] as const)(
  'renders the %s notice using existing copy',
  (kind) => {
    root.innerHTML = bishopNotice(
      kind === 'omen' ? { kind, id: 'ants' } : { kind },
    );
    expect(
      root.querySelector('.bishop-notice')!.getAttribute('data-kind'),
    ).toBe(kind);
    expect(root.querySelector('button')!.textContent).toBe(
      system.bishop.notice[kind].button,
    );
    expect(root.textContent).not.toMatch(/\{name\}/);
  },
);
it('continues a saved bishop run, focuses and dismisses notices before allowing a stamp, and saves its record', () => {
  const state = bishop();
  state.year = 80;
  state.bestYear = 80;
  state.current = daily;
  state.bishop!.notices = [
    { kind: 'omen', id: 'ants' },
    { kind: 'embraceGift' },
  ];
  saveRun(state);
  saveMode('bishop');
  dispose = mount(root);
  expect(root.querySelector('.continue-detail')!.textContent).toContain(
    system.modes.bishop.name,
  );
  root.querySelector<HTMLButtonElement>('.title-continue')!.click();
  expect(document.activeElement).toBe(
    root.querySelector('.bishop-notice-next'),
  );
  expect(root.querySelector('.topbar')!.hasAttribute('inert')).toBe(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(root.querySelector('.bishop-notice')!.getAttribute('data-kind')).toBe(
    'embraceGift',
  );
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  expect(root.querySelector('.bishop-notice')).toBeNull();
  expect(loadRun(cards)?.bishop!.notices).toEqual([]);
  root.querySelector<HTMLButtonElement>('.menu-button')!.click();
  expect(root.querySelector('.menu:not([hidden])')).not.toBeNull();
});
it('round trips bishop cards, pending answers, Infinity sentinel and rewind snapshots', () => {
  let state = nextDocument(bishop(), deck, () => 0.5);
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
  expect(loadMode()).toBe('priest');
  saveMode('bishop');
  expect(loadMode()).toBe('bishop');
  const crisis = deck.find((c) => c.id === bishopConfig.crisis.cards[0])!;
  state.current = crisis;
  state.boons.rewind = true;
  const { past: _, ...snapshot } = state;
  state.past = [structuredClone(snapshot)];
  saveRun(state);
  const restored = loadRun(cards)!;
  expect(restored.current).toEqual(crisis);
  expect(restored.past[0]!.current).toEqual(crisis);
  state = nextDocument(
    advanceBishop({ ...bishop(), year: 50 }, 0, () => 0),
    deck,
    () => 0,
  );
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
});
it('migrates old collections to a zero bishop record and preserves story saves without a bishop block', () => {
  localStorage.setItem(
    'ner-m1-collection',
    JSON.stringify({
      bestYear: { apprentice: 20, priest: 200 },
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: true },
      endings: ['true'],
    }),
  );
  expect(loadCollection().bestYear).toEqual({
    apprentice: 20,
    priest: 200,
    bishop: 0,
  });
  const collection = loadCollection();
  collection.bestYear.bishop = 321;
  saveCollection(collection);
  expect(loadCollection()).toEqual(collection);
  const state = nextDocument(initialState(), cards, () => 0.5);
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
  expect(loadRun(cards)?.bishop).toBeUndefined();
});
it('rejects corrupt bishop state without preventing a new game', () => {
  const state = nextDocument(bishop(), deck, () => 0.5);
  state.bishop!.blessings = ['missing'];
  saveRun(state);
  expect(loadRun(cards)).toBeNull();
});
it('round trips the existing bishop-only card through the editor', () => {
  root.innerHTML = readFileSync('editor.html', 'utf8');
  const form = root.querySelector<HTMLElement>('#form')!;
  initializeForm(form);
  const card = cards.find((c) => c.id === 'bishop_bigwood_heavy_fruit')!;
  fillForm(form, card, cards);
  expect(readForm(form, card)).toEqual(card);
});
it('lets the player choose the answer while asleep and resumes the preserved sleep afterwards', () => {
  const state = bishop();
  state.year = 50;
  state.sleep = 2;
  state.bishop!.pendingAnswers = 1;
  state.bishop!.answer = ['sweet', 'careful'];
  state.current = answerCard(state.bishop!.answer);
  saveRun(state);
  dispose = mount(root);
  root.querySelector<HTMLButtonElement>('.title-continue')!.click();
  vi.advanceTimersByTime(2000);
  expect(loadRun(cards)!.current!.blessings).toEqual(['sweet', 'careful']);
  for (const key of ['ArrowRight', 'ArrowRight', ' '])
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  const granted = loadRun(cards)!;
  expect(granted.bishop!.blessings).toEqual(['careful']);
  expect(granted.sleep).toBe(2);
  expect(granted.year).toBe(50);
});
it('records a bishop ending past 200 without granting a story clear or extra ending', () => {
  const state = bishop();
  state.year = 321;
  state.bestYear = 333;
  state.ending = { id: 'sugar_low', cause: 'sugar_low' };
  saveRun(state);
  dispose = mount(root);
  root.querySelector<HTMLButtonElement>('.title-continue')!.click();
  const collection = loadCollection();
  expect(collection.bestYear.bishop).toBe(333);
  expect(collection.cleared).toEqual({ apprentice: false, priest: false });
  expect(collection.endings).toEqual(['sugar_low']);
  expect(root.querySelector('.ending-mode')!.textContent).toBe(
    system.modes.bishop.endingLine,
  );
  expect(root.querySelector('.ending-paper')!.textContent).toContain(
    system.bishop.reign.replace('{year}', '321'),
  );
  root.querySelector<HTMLButtonElement>('.return')!.click();
  expect(root.querySelector('[data-record="bishop"]')!.textContent).toContain(
    '333',
  );
});
it('resumes a bishop rewind offer after a fatal document cleared current', () => {
  const state = bishop();
  state.year = 210;
  state.current = null;
  state.boons.rewind = true;
  state.ending = { id: 'sugar_low', cause: 'sugar_low' };
  state.gauges.sugar = 0;
  state.bishop!.notices = [{ kind: 'embraceGift' }];
  saveRun(state);
  dispose = mount(root);
  root.querySelector<HTMLButtonElement>('.title-continue')!.click();
  expect(root.querySelector('.rewind')).not.toBeNull();
  expect(document.activeElement).toBe(
    root.querySelector('[data-rewind="yes"]'),
  );
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(document.activeElement).toBe(root.querySelector('[data-rewind="no"]'));
  root.querySelector<HTMLButtonElement>('[data-rewind="no"]')!.click();
  expect(root.querySelector('.ending-screen')).not.toBeNull();
});

it('renders multipliers, fresh flow, sections and specials', () => {
  const state = bishop();
  state.bishop!.flow = { id: 'bread', until: 20 };
  state.bishop!.flowNew = true;
  state.bishop!.omens = [{ id: 'ants' }];
  state.bishop!.blessings = ['careful'];
  state.statuses = [{ id: 'sugar_cut', source: 'test', left: 2, scale: { gauge: 'sugar', factor: 0.5 } }];
  root.innerHTML = gaugesMarkup(state) + bishopBar(state) + bishopSheet(state) + deskMarkup({ ...state, current: daily });
  const arrow = root.querySelector('[data-gauge="sugar"] .mult[data-side="loss"]')!;
  expect(arrow.getAttribute('data-n')).toBe('3');
  expect(arrow.getAttribute('data-dir')).toBe('in');
  expect(arrow.querySelectorAll('i')).toHaveLength(3);
  expect(root.querySelector('.bishop-pill[data-fresh] .bishop-pill-flow')).not.toBeNull();
  for (const section of ['flow','omens','blessings','statuses','base']) expect(root.querySelector('.bishop-' + section)).not.toBeNull();
  expect(root.querySelector('.status-tray .bishop-special[data-special="bread"][data-tip]')).not.toBeNull();
  root.innerHTML = gaugesMarkup(initialState());
  expect(root.querySelector('.mult')).toBeNull();
});

it.each([true, false])('migrates legacy bishop saves (used=%s)', (used) => {
  const state = bishop();
  state.year = 61;
  saveRun(state);
  const saved = JSON.parse(localStorage.getItem('ner-m1-run')!);
  const b = saved.state.bishop;
  delete b.embrace; delete b.nextEvent; delete b.omenBag; delete b.lastOmen; delete b.flowNew;
  b.embraceUsed = used;
  b.blessings = used ? ['embrace', 'sweet'] : ['sweet'];
  b.omens = [{ id: 'ants', empowered: true }];
  b.notices = [{ kind: 'flow', id: 'harvest' }, { kind: 'flowEnd', id: 'harvest' }, { kind: 'omen', id: 'ants' }];
  localStorage.setItem('ner-m1-run', JSON.stringify(saved));
  const loaded = loadRun(cards)!.bishop!;
  expect(loaded.embrace).toBe(used ? 'used' : 'none');
  expect(loaded.blessings).toEqual(['sweet']);
  expect(loaded.omens).toEqual([{ id: 'ants' }]);
  expect(loaded.notices).toEqual([{ kind: 'omen', id: 'ants' }]);
  expect(loaded.nextEvent).toEqual({ kind: 'omen', at: 75 });
  expect(loaded.lastOmen).toBe('ants');
  expect(loaded.omenBag).toHaveLength(4);
  expect(loaded.flowNew).toBe(false);
});
