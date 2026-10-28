// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it } from 'vitest';
import rawCards from '../data/cards/m1.json';
import system from '../data/system.json';
import {
  initialState,
  recordSnapshot,
  type Card,
  type Status,
} from '../src/core/state';
import { rewind, processDocument } from '../src/core/loop';
import { loadRun, saveRun } from '../src/save/storage';
import { boonsMarkup, deskMarkup } from '../src/ui/desk';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import {
  fillForm,
  initializeForm,
  readForm,
  switchKind,
} from '../src/editor/form';
import { validateCards } from '../tools/validate-cards';

const cards = rawCards as Card[];
const base = () => structuredClone(cards.find((c) => c.kind === 'daily')!);
const status: Status = {
  id: 'ember',
  turns: 3,
  tick: { sugar: -2 },
  delayed: { faith: 10 },
  scale: { gauge: 'people', factor: 1.5 },
  freeze: 'erpin',
  axeLock: true,
  drowseReset: true,
};
const saved = () => ({
  ...initialState(),
  current: base(),
  statuses: [{ ...status, left: 2, source: base().id }],
  boons: { rewind: true as const },
  rewindYear: 0,
});
beforeEach(() => {
  localStorage.clear();
});

it('round trips statuses including rewind snapshots and migrates old saves', () => {
  const state = recordSnapshot(saved());
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
  const raw = JSON.parse(localStorage.getItem('ner-m1-run')!);
  delete raw.state.statuses;
  delete raw.state.past[0].statuses;
  localStorage.setItem('ner-m1-run', JSON.stringify(raw));
  expect(loadRun(cards)?.statuses).toEqual([]);
  expect(loadRun(cards)?.past[0]!.statuses).toEqual([]);
});
it.each([
  { left: 0 },
  { left: 1.5 },
  { tick: { wrong: 1 } },
  { delayed: { faith: 'bad' } },
  { scale: { gauge: 'faith', factor: 2 } },
  { freeze: 'wrong' },
  { axeLock: false },
  { source: 3 },
])('discards an invalid saved status %j', (invalid) => {
  const state = saved();
  Object.assign(state.statuses[0]!, invalid);
  saveRun(state);
  expect(loadRun(cards)).toBeNull();
  expect(localStorage.getItem('ner-m1-run')).toBeNull();
});
it('removes status pills and renders badge names, counts and axe lock', () => {
  const state = saved();
  const root = document.createElement('div');
  root.innerHTML = boonsMarkup(state);
  expect(root.querySelector('.boon.status')).toBeNull();
  expect(root.querySelector('[data-boon="rewind"]')).not.toBeNull();
  root.innerHTML = deskMarkup(state);
  const badge = root.querySelector<HTMLElement>('.status-badge')!;
  expect(badge.dataset.status).toBe('ember');
  expect(badge.title).toBe(
    `${system.statuses.ember.name} — ${system.statuses.ember.desc}`,
  );
  expect(badge.getAttribute('aria-label')).toBe(
    `${system.statuses.ember.name}, ${system.ui.documentCount.replace('{n}', '2')}`,
  );
  expect(badge.querySelector('b')!.textContent).toBe('2');
  expect(
    root.querySelector('.tool.axe.status-locked .status-left')!.textContent,
  ).toBe('2');
  expect(root.querySelector('.tool.axe')!.getAttribute('aria-disabled')).toBe(
    'true',
  );
  state.boons = { rewind: true, ...{ bullet: 2 } };
  root.innerHTML = deskMarkup(state);
  expect(
    root.querySelector('.tool.bullet')!.getAttribute('aria-disabled'),
  ).toBe('false');
  state.statuses = [];
  root.innerHTML = deskMarkup(state);
  expect(
    root.querySelector('.status-badge, .status-locked, .status-left'),
  ).toBeNull();
});
it.each(['apprentice', 'priest'] as const)(
  'renders status-only dots and marks in %s mode and clears aim',
  (mode) => {
    const card = base();
    card.approve = { label: 'yes', effects: { sugar: 10 }, status };
    const state = { ...initialState(mode), current: card };
    const root = document.createElement('div');
    root.innerHTML = gaugesMarkup(state) + '<button class="tool axe"></button>';
    updateGaugePreview(root, card, 'approve', false, state);
    expect(root.querySelectorAll('.status-mark')).toHaveLength(4);
    for (const key of ['sugar', 'faith', 'people', 'erpin']) {
      const dot = root.querySelector<HTMLElement>(
        `[data-gauge="${key}"] .preview-dot`,
      )!;
      expect(dot.hidden).toBe(false);
      expect(dot.querySelector('.status-mark')!.hasAttribute('data-dir')).toBe(
        false,
      );
    }
    expect(
      root
        .querySelector('[data-gauge="sugar"] .status-mark')!
        .getAttribute('data-dir'),
    ).toBeNull();
    expect(
      root
        .querySelector('.tool.axe')!
        .classList.contains('status-lock-preview'),
    ).toBe(true);
    updateGaugePreview(root, card, null, false, state);
    expect(root.querySelector('.status-mark')).toBeNull();
    expect(
      root
        .querySelector('.tool.axe')!
        .classList.contains('status-lock-preview'),
    ).toBe(false);
  },
);
it('shows scaled exact previews and suppresses frozen card previews', () => {
  const card = base();
  card.approve = { label: 'yes', effects: { sugar: -15, people: 10 } };
  const state = { ...saved(), current: card, boons: { hyean: { left: 2 } } };
  state.statuses[0]!.scale = { gauge: 'sugar', factor: 1.5 };
  state.statuses[0]!.freeze = 'people';
  const root = document.createElement('div');
  root.innerHTML = gaugesMarkup(state);
  updateGaugePreview(root, card, 'approve', false, state);
  expect(
    root.querySelector('[data-gauge="sugar"] .preview-dot')!.textContent,
  ).toBe('\u221225');
  expect(
    root.querySelector<HTMLElement>('[data-gauge="people"] .preview-dot')!
      .hidden,
  ).toBe(true);
});
it('round trips and edits all status controls and removes status for story cards', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.getElementById('form')!;
  initializeForm(root);
  const card = base();
  card.approve.status = structuredClone(status);
  fillForm(root, card);
  expect(readForm(root, card).approve.status).toEqual(status);
  (root.querySelector('#approve-status-turns') as HTMLInputElement).value = '7';
  expect(readForm(root, card).approve.status!.turns).toBe(7);
  (root.querySelector('#approve-status-id') as HTMLSelectElement).value = '';
  expect(readForm(root, card).approve.status).toBeUndefined();
  expect(switchKind(card, 'story').approve.status).toBeUndefined();
});
it('validator accepts a fully specified status', () => {
  const card = base();
  card.approve.status = status;
  expect(validateCards([card])).toEqual([]);
});
it.each([
  { id: 'bad' },
  { turns: 0 },
  { turns: 13 },
  { turns: 1.5 },
  { tick: { sugar: 0 } },
  { tick: { sugar: 6 } },
  { tick: { sugar: 1.5 } },
  { tick: { wrong: 2 } },
  { delayed: { faith: 7 } },
  { delayed: { faith: 30 } },
  { scale: { gauge: 'faith', factor: 2 } },
  { freeze: 'bad' },
  { axeLock: false },
  { drowseReset: false },
])('validator rejects invalid status %j', (invalid) => {
  const card = base();
  card.approve.status = { ...status, ...invalid } as Status;
  expect(validateCards([card]).some((e) => e.includes('status'))).toBe(true);
});
it('validator rejects status without an effect and status on story cards', () => {
  const card = base();
  card.approve.status = { id: 'ember', turns: 2, drowseReset: true };
  expect(validateCards([card])).toContain('[0] status needs an effect');
  const story = structuredClone(cards.find((c) => c.kind === 'story')!);
  story.approve.status = status;
  expect(validateCards([story])).toContain('[0] story status is not allowed');
});

it('renders axe-lock-only aim without gauge marks', () => {
  const card = base();
  card.approve = {
    label: 'yes',
    effects: {},
    status: { id: 'axe_repair', turns: 2, axeLock: true },
  };
  const state = { ...initialState(), current: card };
  const root = document.createElement('div');
  root.innerHTML = gaugesMarkup(state) + '<button class="tool axe"></button>';
  updateGaugePreview(root, card, 'approve', false, state);
  expect(root.querySelector('.tool.axe.status-lock-preview')).not.toBeNull();
  expect(root.querySelector('.status-mark')).toBeNull();
});
it('uses modified values for apprentice pips while a scale is active', () => {
  const card = base();
  card.approve = { label: 'yes', effects: { sugar: 20 } };
  const state = {
    ...initialState('apprentice'),
    current: card,
    statuses: [
      {
        id: 'ember',
        left: 2,
        source: card.id,
        scale: { gauge: 'sugar' as const, factor: 0.5 as const },
      },
    ],
  };
  const root = document.createElement('div');
  root.innerHTML = gaugesMarkup(state);
  updateGaugePreview(root, card, 'approve', false, state);
  expect(
    root.querySelector<HTMLElement>('[data-gauge="sugar"] .preview-dot')!
      .dataset.pips,
  ).toBe('2');
});

it.each([null, 'reject', 'axe', 'bullet', 'alice'] as const)(
  'clears replacement preview on aim %s',
  (aim) => {
    const state = saved();
    delete state.statuses[0]!.axeLock;
    state.current.approve.status = {
      id: 'strike',
      turns: 3,
      tick: { sugar: -2 },
    };
    state.current.reject.status = undefined;
    const root = document.createElement('div');
    root.innerHTML = deskMarkup(state);
    updateGaugePreview(root, state.current, 'approve', false, state);
    expect(root.querySelectorAll('.status-badge.status-ending')).toHaveLength(
      4,
    );
    expect(root.querySelector('.tool.axe.status-ending')).toBeNull();
    updateGaugePreview(root, state.current, aim, false, state);
    expect(root.querySelector('.status-ending')).toBeNull();
  },
);
it('does not preview replacement of a status expiring this document', () => {
  const state = saved();
  state.statuses[0]!.left = 1;
  state.current.approve.status = status;
  const root = document.createElement('div');
  root.innerHTML = deskMarkup(state);
  updateGaugePreview(root, state.current, 'approve', false, state);
  expect(root.querySelector('.status-ending')).toBeNull();
  state.current.years = 0;
  updateGaugePreview(root, state.current, 'approve', false, state);
  expect(root.querySelector('.status-ending')).toBeNull();
});
it('renders restored badges after save loading and rewind', () => {
  const state = recordSnapshot({ ...saved(), year: 160 });
  saveRun(state);
  const loaded = loadRun(cards)!;
  const root = document.createElement('div');
  root.innerHTML = deskMarkup(loaded);
  expect(root.querySelectorAll('.status-badge')).toHaveLength(4);
  const restored = rewind(
    { ...loaded, year: 166, statuses: [], ending: { id: 'sugar_low' } },
    cards,
    () => 0.5,
  );
  root.innerHTML = deskMarkup(restored);
  expect(root.querySelectorAll('.status-badge')).toHaveLength(4);
  expect(root.querySelector('.status-left')!.textContent).toBe('2');
});

it('keeps the axe lock out of cap eviction previews after a stitch rescue', () => {
  const card = base();
  card.approve = {
    label: 'yes',
    effects: {},
    status: { id: 'sprout', turns: 3, freeze: 'faith' },
  };
  const state = {
    ...initialState(),
    current: card,
    statuses: [
      { id: 'axe_repair', left: 2, source: card.id, axeLock: true as const },
      { id: 'ember', left: 2, source: card.id, tick: { sugar: -2 } },
    ],
  };
  const root = document.createElement('div');
  root.innerHTML = deskMarkup(state);
  updateGaugePreview(root, card, 'approve', false, state);
  expect(root.querySelector('.tool.axe.status-ending')).toBeNull();
  expect(root.querySelector('.status-badge.status-ending')).toBeNull();
  state.statuses[0]!.left = 1;
  state.boons.stitch = true;
  state.gauges.people = 5;
  card.approve.effects.people = -10;
  updateGaugePreview(root, card, 'approve', false, state);
  expect(root.querySelector('.status-ending')).toBeNull();
});

it('drops retired status ids without discarding a save', () => {
  const state = saved();
  state.statuses[0]!.id = 'retired-status';
  saveRun(state);
  expect(loadRun(cards)?.statuses).toEqual([]);
});

it('keeps same-moment non-story expiry and story follow-up replacement previews in sync with resolution', () => {
  const state = saved();
  delete state.statuses[0]!.axeLock;
  const followup = { ...base(), id: 'followup', conditions: undefined };
  state.current.approve.effects = {};
  state.statuses[0]!.left = 1;
  state.current.years = 0;
  state.current.approve.status = { ...status, axeLock: undefined };
  const root = document.createElement('div');
  root.innerHTML = deskMarkup(state);
  updateGaugePreview(root, state.current, 'approve', false, state);
  expect(root.querySelector('.status-ending')).toBeNull();
  const expired = processDocument(state, 'approve', [followup], () => 0.5);
  expect(expired.statuses[0]?.left).toBe(status.turns);
  expect(expired.gauges.faith).toBe(state.gauges.faith + 10);

  state.current.kind = 'story';
  state.current.years = 1;
  state.current.approve.effects = {};
  state.current.approve.schedule = { card: followup.id, years: 0 };
  updateGaugePreview(root, state.current, 'approve', false, state);
  expect(root.querySelector('.status-ending')).not.toBeNull();
  const sameMoment = processDocument(state, 'approve', [followup], () => 0.5);
  expect(sameMoment.year).toBe(state.year);
  expect(sameMoment.gauges).toEqual(state.gauges);
  expect(sameMoment.statuses[0]?.left).toBe(status.turns);
});
