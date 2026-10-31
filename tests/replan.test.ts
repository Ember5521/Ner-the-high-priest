// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, recordSnapshot, type Card } from '../src/core/state';
import {
  choiceEffects,
  mendEffects,
  placeBlindfold,
  processDocument,
  rewind,
  sleepCoin,
  useBandage,
} from '../src/core/loop';
import { eligible, nextDocument } from '../src/core/deck';
import { bishopDeck } from '../src/core/bishop';
import {
  fillForm,
  initializeForm,
  readForm,
  listedCards,
  listTab,
} from '../src/editor/form';
import { loadRun, saveRun } from '../src/save/storage';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import system from '../data/system.json';
import { documentMarkup } from '../src/ui/document';
import { toolsMarkup } from '../src/ui/tools';
import { boonsMarkup, deskMarkup } from '../src/ui/desk';
import { bindTooltips } from '../src/ui/tooltip';
import { validateCards } from '../tools/validate-cards';

const cards = raw as Card[];
const find = (id: string) => cards.find((c) => c.id === id)!;
const daily: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  id: 'neutral',
  conditions: undefined,
  years: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

it('mends only selected gauges, with stable ties and no overshoot or scaling', () => {
  const gauges = { sugar: 10, people: 90, faith: 40, erpin: 55 };
  expect(mendEffects({ mode: 'worst', count: 2, amount: 30 }, gauges)).toEqual({
    sugar: 30,
    people: -30,
  });
  expect(
    mendEffects({ mode: 'center', count: 1, exclude: ['sugar'] }, gauges),
  ).toEqual({ people: -40 });
  expect(mendEffects({ mode: 'all', amount: 15 }, gauges)).toEqual({
    sugar: 15,
    people: -15,
    faith: 10,
    erpin: -5,
  });
  const state = { ...initialState('bishop', () => 0), gauges, year: 1000 };
  state.bishop!.blessings = ['sweet'];
  expect(
    choiceEffects(
      { label: 'x', effects: {}, mend: { mode: 'all', amount: 15 } },
      gauges,
      'special',
      1000,
      [],
      state,
    ),
  ).toEqual({ sugar: 15, people: -15, faith: 10, erpin: -5 });
});

it('protects the placed gauge from both a choice and ticks and consumes one blindfold', () => {
  let state = {
    ...initialState(),
    current: { ...daily, approve: { label: 'x', effects: { sugar: -20 } } },
    boons: { blindfold: 2 },
    statuses: [{ id: 'strike', source: 'test', left: 2, tick: { sugar: -3 } }],
  };
  const placed = placeBlindfold(state, 'sugar');
  expect(placeBlindfold(placed).blindfold).toBeUndefined();
  const next = processDocument(placed, 'approve', [daily], () => 0.5);
  expect(next.gauges.sugar).toBe(50);
  expect(next.boons.blindfold).toBe(1);
  expect(next.blindfold).toBeUndefined();
  expect(next.statuses[0]?.left).toBe(1);
  expect(state.boons.blindfold).toBe(2);
});


it('chains a zero-year schedule before another due document without advancing time', () => {
  const deal = find('special_sist_deal');
  const shop = find('special_sist_shop');
  const state = processDocument(
    { ...initialState(), year: 50, current: deal },
    'approve',
    [daily, shop],
    () => 0.5,
  );
  expect(state.year).toBe(50);
  expect(state.current?.id).toBe(shop.id);
  expect(state.scheduled).toEqual({});
});

it('skips ineligible window cards permanently and selects two disjoint spirit members', () => {
  const picked = nextDocument(initialState(), cards, () => 0.5);
  const spirits = picked.poolCards!.map(find);
  expect(spirits).toHaveLength(2);
  expect(spirits[0]!.pool!.member).not.toBe(spirits[1]!.pool!.member);
  const touched = (c: Card) =>
    new Set([
      ...Object.keys(c.reject.effects),
      ...Object.keys(c.approve.effects),
    ]);
  expect(
    [...touched(spirits[0]!)].some((g) => touched(spirits[1]!).has(g)),
  ).toBe(false);
  expect(
    Math.abs(
      picked.windowYears[spirits[0]!.id]! - picked.windowYears[spirits[1]!.id]!,
    ),
  ).toBeGreaterThanOrEqual(8);
  const xion = find('fixed_xion_request');
  const skipped = nextDocument(
    { ...initialState(), year: 100, windowYears: { [xion.id]: 100 } },
    [daily, xion],
    () => 0.5,
  );
  expect(skipped.seen).toContain(xion.id);
  expect(
    nextDocument(
      { ...skipped, current: null, flags: ['xion_debt'] },
      [daily, xion],
      () => 0.5,
    ).current?.id,
  ).toBe(daily.id);
});

it('creates four independent witch drifts and clamps witch pressure safely', () => {
  const witch = find('special_fricle_pikora');
  const state = { ...initialState(), current: witch };
  const drift = processDocument(state, 'approve', [daily], () => 0.25);
  expect(drift.statuses).toHaveLength(4);
  expect(
    drift.statuses.every(
      (s) =>
        s.id === 'pikora_drift' &&
        s.left === witch.approve.witchDrift!.turns &&
        Object.values(s.tick!)[0] === -witch.approve.witchDrift!.perDoc,
    ),
  ).toBe(true);
  const pressed = processDocument(
    { ...state, gauges: { sugar: 2, people: 98, faith: 50, erpin: 50 } },
    'reject',
    [daily],
    () => 0.25,
  );
  // gauges already past the floor stay put; Fricle never pulls one inward
  expect(pressed.gauges).toEqual({
    sugar: 2,
    people: 98,
    faith: 40,
    erpin: 40,
  });
  expect(pressed.ending).toBeNull();
});

it('rolls each witch drift fresh while Erpin stamps in her sleep', () => {
  const witch = find('special_fricle_pikora');
  const rolls = [0.1, 0.9, 0.1, 0.9];
  const drift = processDocument(
    { ...initialState(), sleep: 2, current: witch },
    'reject',
    [daily],
    sleepCoin(0.8, () => rolls.shift() ?? 0.5),
  );
  expect(drift.statuses.map((s) => Math.sign(Object.values(s.tick!)[0]!))).toEqual([
    -1, 1, -1, 1,
  ]);
});

it('rewinds three boss documents and never crosses the acquisition floor', () => {
  let state = {
    ...initialState(),
    year: 200,
    current: daily,
    boss: { done: 0, drawn: [] as string[] },
    boons: { rewind: true as const },
    rewindYear: 145,
  };
  let history = recordSnapshot(state);
  for (let done = 1; done <= 6; done++)
    history = recordSnapshot({ ...history, boss: { done, drawn: [] } });
  const restored = rewind(
    { ...history, ending: { id: 'sugar_low' } },
    cards,
    () => 0.5,
  );
  expect(restored.boss?.done).toBe(3);
  expect(restored.year).toBe(200);
  const normal = rewind(
    {
      ...initialState(),
      year: 143,
      rewindYear: 141,
      boons: { rewind: true },
      ending: { id: 'sugar_low' },
    },
    [daily],
    () => 0.5,
  );
  expect(normal.year).toBe(141);
});

it('migrates removed ids and loan state in both the live save and rewind history', () => {
  const state = recordSnapshot({
    ...initialState(),
    current: daily,
    boons: { rewind: true },
  });
  const old = JSON.parse(JSON.stringify(state));
  for (const entry of [old, ...old.past]) {
    entry.current = { id: 'retired-card' };
    entry.loan = { gauge: 'sugar', lent: 30, interest: 10 };
    entry.seen = ['retired-card'];
    entry.scheduled = { 'retired-card': 30 };
  }
  localStorage.setItem(
    'ner-m1-run',
    JSON.stringify({ version: 1, state: old }),
  );
  const loaded = loadRun([daily])!;
  expect(loaded).not.toBeNull();
  for (const entry of [loaded, ...loaded.past]) {
    expect(entry.current).toBeNull();
    expect(entry).not.toHaveProperty('loan');
    expect(entry.seen).toEqual([]);
    expect(entry.scheduled).toEqual({});
  }
  expect(nextDocument(loaded, [daily], () => 0.5).current?.id).toBe(daily.id);
});

it('saves new items, boss progress, spirit picks and all four drifts', () => {
  const state = {
    ...initialState(),
    current: find('boss_snow_road'),
    year: 200,
    boss: { done: 1, drawn: ['boss_snow_road'] },
    poolCards: ['daily_sylla_yokan', 'daily_naia_lake_party'],
    blindfold: 'sugar' as const,
    boons: {
      blindfold: 2,
      scope: 4,
      understudy: true as const,
    },
  };
  saveRun(state);
  expect(loadRun(cards)).toEqual(state);
});

it('round-trips every new data field through the editor', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const form = document.querySelector<HTMLElement>('#form')!;
  initializeForm(form);
  for (const card of cards.filter(
    (c) => c.look || c.pool || c.boss || c.bossAfter || c.bossAt || c.status,
  )) {
    fillForm(form, card, cards);
    expect(readForm(form, card)).toEqual(card);
  }
  const card = find('special_sist_shop');
  fillForm(form, card, cards);
  form.querySelector<HTMLTextAreaElement>('#replan-reject-grant')!.value =
    '{"boon":"scope","uses":4}';
  form.querySelector<HTMLTextAreaElement>('#replan-approve-schedule')!.value =
    '{"card":"special_sist_shop","years":0}';
  expect(readForm(form, card).reject.grant).toEqual({ boon: 'scope', uses: 4 });
  expect(readForm(form, card).approve.schedule?.years).toBe(0);
  expect(validateCards(raw)).toEqual([]);
});

it('renders blindfold placement, mend marks and a scope status tip', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const state = {
    ...initialState(),
    current: daily,
    blindfold: 'sugar' as const,
    boons: { blindfold: 2, scope: 4 },
  };
  root.innerHTML = deskMarkup(state);
  expect(root.querySelector('.sist-slot .blindfold-slot[data-placed]')).not.toBeNull();
  expect(root.querySelector('.blindfold-slot b')).toBeNull();
  expect(
    root.querySelector('[data-gauge="sugar"][data-blindfold] .blindfold-mark'),
  ).not.toBeNull();
  const tips = bindTooltips(root);
  root.querySelector<HTMLElement>('[data-boon="scope"]')!.focus();
  expect(root.querySelector('.tip [data-use-item]')).toBeNull();
  expect(
    root.querySelector('[data-boon="scope"]')?.hasAttribute('data-tip-use'),
  ).toBe(false);
  const mended = {
    ...state,
    blindfold: undefined,
    gauges: { ...state.gauges, people: 10 },
  };
  updateGaugePreview(
    root,
    {
      ...daily,
      approve: {
        label: 'mend',
        effects: {},
        mend: { mode: 'center', count: 1, exclude: ['sugar'] },
      },
    },
    'approve',
    false,
    mended,
  );
  expect(
    root.querySelector('[data-gauge="people"] .preview-dot[data-mend]'),
  ).not.toBeNull();
  expect(root.querySelector('[data-gauge="people"] .pips')).toBeNull();
  tips.dispose();
});

it('keeps boss and excluded characters out of bishop and converts spirit visits', () => {
  const deck = bishopDeck(cards);
  expect(
    deck.some(
      (c) =>
        c.boss ||
        c.bossAfter ||
        [
          'fixed_xion_request',
          'fixed_renewa_theater',
          'special_renewa_curtain',
          'fixed_chloe_tailor',
          'quest_goldie_storage',
        ].includes(c.id),
    ),
  ).toBe(false);
  for (const source of cards.filter((c) => c.pool))
    expect(deck.find((c) => c.id === source.id)).toMatchObject({
      kind: 'special',
      period: 60,
      repeatable: true,
    });
});

it('renders hard prefixes, validates hard looks and lists them in their own editor tab', () => {
  const hard = cards.filter((c) => c.look === 'hard');
  expect(hard).toHaveLength(18);
  expect(
    cards
      .filter((c) => c.variant?.group === 'elves')
      .every((c) => c.look === 'hard'),
  ).toBe(true);
  expect(
    cards
      .filter((c) => c.pool?.group === 'spirits')
      .every((c) => c.look === 'hard'),
  ).toBe(true);
  expect(
    listedCards(cards, 'hard')
      .map((c) => c.id)
      .sort(),
  ).toEqual(hard.map((c) => c.id).sort());
  expect(listedCards(cards, 'special').some((c) => c.look === 'hard')).toBe(
    false,
  );
  for (const card of hard) {
    expect(listTab(card)).toBe('hard');
    expect(validateCards([card])).toEqual([]);
    const root = document.createElement('div');
    root.innerHTML = documentMarkup(card);
    expect(root.querySelector('.document.doc-hard')).not.toBeNull();
    expect(root.querySelector('.document-number')?.textContent).toBe(
      system.ui.hardPrefix +
        (system.factions as Record<string, string>)[card.faction],
    );
  }
});

it('round trips and edits every look using the editor select', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.querySelector<HTMLElement>('#form')!;
  initializeForm(root);
  const card = find('special_fricle_pikora');
  fillForm(root, card, cards);
  const select = root.querySelector<HTMLSelectElement>('#f-look')!;
  expect([...select.options].map((o) => o.value)).toEqual([
    '',
    'special',
    'quest',
    'hard',
  ]);
  expect(select.value).toBe('hard');
  expect(root.querySelector('#replan-look, #f-look-special')).toBeNull();
  for (const look of ['', 'special', 'quest', 'hard']) {
    select.value = look;
    const edited = readForm(root, card);
    expect(edited.look).toBe(look || undefined);
    fillForm(root, edited, cards);
    expect(select.value).toBe(look);
    expect(readForm(root, edited)).toEqual(edited);
  }
});

it('keeps the witch names on both direction stamps', () => {
  const witch = find('special_fricle_pikora');
  const root = document.createElement('div');
  root.innerHTML = toolsMarkup(witch, initialState().drowse);
  for (const side of ['reject', 'approve'] as const) {
    const stamp = root.querySelector(`[data-action="${side}"]`)!;
    expect(stamp.getAttribute('aria-label')).toBe(witch[side].label);
    expect(
      stamp.querySelector('.tool-name')?.textContent?.replace(/[←→]/g, ''),
    ).toBe(witch[side].label);
    expect(
      stamp.querySelector(
        `[data-art-slot="ui.stamp${side === 'reject' ? 'Left' : 'Right'}"]`,
      ),
    ).not.toBeNull();
  }
});

it('renders dread during the boss instead of the old late-year window', () => {
  const root = document.createElement('div');
  for (const year of [186, 193, 199, 200]) {
    root.innerHTML = deskMarkup({ ...initialState(), year, current: daily });
    expect(root.querySelector('.desk.dread')).toBeNull();
  }
  for (const done of [0, 4, 9, 10]) {
    root.innerHTML = deskMarkup({
      ...initialState(),
      year: 200,
      current: daily,
      boss: { done, drawn: [] },
    });
    expect(
      root
        .querySelector<HTMLElement>('.desk.dread')
        ?.style.getPropertyValue('--dread'),
    ).toBe(Math.min(1, (done + 1) / 10).toFixed(2));
  }
});

it('uses bandages toward the centre without advancing the game', () => {
  const state = { ...initialState(), current: daily, gauges: { sugar: 5, people: 70, faith: 50, erpin: 90 }, boons: { bandage: 2 } };
  const first = useBandage(state, 'sugar');
  expect(first.gauges.sugar).toBe(35);
  expect(first.boons.bandage).toBe(1);
  expect(useBandage(first, 'people').gauges.people).toBe(50);
  expect(useBandage(first, 'people').boons.bandage).toBeUndefined();
  expect(first.year).toBe(state.year);
  expect(first.statuses).toEqual(state.statuses);
  expect(first.drowse).toEqual(state.drowse);
  expect(useBandage(state, 'faith')).toBe(state);
  for (const change of [{ boons: {} }, { sleep: 1 }, { scene: 'asleep' }, { ending: { id: 'x' } }, { current: null }]) {
    const blocked = { ...state, ...change };
    expect(useBandage(blocked, 'sugar')).toBe(blocked);
  }
});


it('migrates legacy refunds and drops refundable snapshots', () => {
  const state = { ...initialState(), current: daily, boons: { bandage: 2 } };
  saveRun(state);
  const saved = JSON.parse(localStorage.getItem('ner-m1-run')!);
  saved.state.boons = { refund: 3 };
  saved.state.refundable = { obsolete: true };
  localStorage.setItem('ner-m1-run', JSON.stringify(saved));
  const loaded = loadRun([daily])!;
  expect(loaded.boons.bandage).toBe(3);
  expect(loaded).not.toHaveProperty('refundable');
  saveRun(loaded);
  expect(loadRun([daily])!.boons.bandage).toBe(3);
});

it('renders and drags a bandage onto a gauge', async () => {
  const { createInput } = await import('../src/ui/input');
  let state = { ...initialState(), current: daily, gauges: { ...initialState().gauges, sugar: 10 }, boons: { bandage: 1 } };
  const root = document.createElement('div');
  root.innerHTML = deskMarkup(state);
  document.body.append(root);
  const slot = root.querySelector<HTMLElement>('.bandage-slot')!;
  const gauge = root.querySelector<HTMLElement>('[data-gauge="sugar"]')!;
  expect(slot.dataset.tipTitle).toBe(system.boons.bandage.name);
  let captured = false;
  slot.setPointerCapture = () => { captured = true; };
  slot.hasPointerCapture = () => captured;
  slot.releasePointerCapture = () => { captured = false; };
  const oldElements = document.elementsFromPoint;
  document.elementsFromPoint = () => [gauge];
  const input = createInput(root, {
    busy: false, sleep: 0, playing: true, aim: null, menuOpen: false, sceneOpen: false,
    sceneKey() {}, openMenu() {}, menuKey() {}, setAim() {}, canLift: () => true,
    stamp() {}, autoStamp() {}, skip() {},
    useBandage(gauge) { state = useBandage(state, gauge) as typeof state; },
  });
  input.bind();
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
    const event = new MouseEvent(type, { bubbles: true, clientX: 20, clientY: type === 'pointerdown' ? 600 : 20 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    slot.dispatchEvent(event);
  }
  expect(state.gauges.sugar).toBe(40);
  expect(state.boons.bandage).toBeUndefined();
  input.dispose();
  document.elementsFromPoint = oldElements;
});


it('keeps five fixed tray positions and puts held items in their own slots', () => {
  const root = document.createElement('div');
  for (const boons of [{}, { bandage: 1, blindfold: 1, bullet: 2, scope: 3 }]) {
    root.innerHTML = deskMarkup({ ...initialState(), current: daily, boons, blindfold: boons.blindfold ? 'sugar' : undefined });
    const tray = root.querySelector('.tools')!;
    expect([...tray.children].map(el => el.className)).toEqual([
      'tool reject', 'tray-slot sist-slot', 'axe-slot', 'tray-slot xion-slot', 'tool approve',
    ]);
    expect(root.querySelectorAll('.topbar .item-slot')).toHaveLength(0);
    expect(root.querySelectorAll('.axe-pair > .tool')).toHaveLength(1);
    expect(root.querySelector('.axe-pair > .axe')).not.toBeNull();
    expect([...root.querySelectorAll('.sist-slot > button')].map(el => el.className)).toEqual(
      boons.bandage ? ['item-slot tray-item bandage-slot', 'item-slot tray-item blindfold-slot'] : [],
    );
    expect([...root.querySelectorAll('.xion-slot > .tool')].map(el => (el as HTMLElement).dataset.action)).toEqual(
      boons.bullet ? ['bullet', 'scope'] : [],
    );
    expect(root.querySelector('.sist-slot .tool, .sist-slot [data-action], .sist-slot b')).toBeNull();
    expect(!!root.querySelector('.blindfold-slot[data-placed]')).toBe(!!boons.blindfold);
    if (boons.bandage) {
      expect(root.querySelector('.bandage-slot')?.getAttribute('aria-disabled')).toBe('true');
      expect(root.querySelector('.bandage-slot .tool-name')?.textContent).toBe(system.boons.bandage.short);
      expect(root.querySelector('.blindfold-slot')?.getAttribute('aria-label')).toBe(system.boons.blindfold.name + ' ' + system.boons.blindfold.desc);
    }
  }
});

it.each(['bandage', 'blindfold'] as const)('defers Deal II while %s is held, then draws it within the window', (item) => {
  const deal = find('special_sist_deal_late');
  const held = { ...initialState(), year: 120, boons: { [item]: 1 }, blindfold: item === 'blindfold' ? 'sugar' as const : undefined, windowYears: { [deal.id]: 110 } };
  expect(eligible(deal, held)).toBe(false);
  const blocked = nextDocument(held, [deal, daily], () => 0);
  expect(blocked.current?.id).toBe(daily.id);
  expect(blocked.seen).not.toContain(deal.id);
  const released = { ...blocked, current: null, year: 180, boons: { [item]: 0 }, blindfold: undefined };
  expect(eligible(deal, released)).toBe(true);
  expect(nextDocument(released, [deal, daily], () => 0).current?.id).toBe(deal.id);
  const expired = nextDocument({ ...held, year: 181 }, [deal, daily], () => 0);
  expect(expired.current?.id).toBe(daily.id);
  expect(expired.seen).toContain(deal.id);
  expect(nextDocument({ ...expired, current: null, boons: {} }, [deal, daily], () => 0).current?.id).toBe(daily.id);
  expect(nextDocument({ ...released, year: 181 }, [deal, daily], () => 0).current?.id).toBe(daily.id);
  const bishopDeal = bishopDeck([deal]).find(c => c.id === deal.id)!;
  expect(bishopDeal.conditions?.boonsNone).toEqual(['blindfold', 'bandage']);
  expect(eligible(bishopDeal, { ...held, mode: 'bishop' })).toBe(false);
});


it.each(['bandage', 'blindfold'] as const)('selects and drags the tray %s without lifting a stamp', async (kind) => {
  const { createInput } = await import('../src/ui/input');
  const root = document.createElement('div');
  root.innerHTML = deskMarkup({ ...initialState(), current: daily, gauges: { ...initialState().gauges, sugar: 10, people: 40 }, boons: { [kind]: 1 }, blindfold: kind === 'blindfold' ? 'sugar' : undefined });
  document.body.append(root);
  const item = root.querySelector<HTMLElement>(`.sist-slot .${kind}-slot`)!;
  const gauge = root.querySelector<HTMLElement>('[data-gauge="people"]')!;
  const useBandage = vi.fn();
  const placeBlindfold = vi.fn();
  const stamp = vi.fn();
  const setAim = vi.fn();
  const input = createInput(root, {
    busy: false, sleep: 0, playing: true, aim: null, menuOpen: false, sceneOpen: false,
    sceneKey() {}, openMenu() {}, menuKey() {}, setAim, canLift: () => true,
    stamp, autoStamp() {}, skip() {}, useBandage, placeBlindfold,
  });
  input.bind();
  const use = kind === 'bandage' ? useBandage : placeBlindfold;
  item.click();
  gauge.click();
  expect(use).toHaveBeenLastCalledWith('people');
  item.click();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
  expect(use).toHaveBeenLastCalledWith('faith');
  let captured = false;
  const capture = (el: HTMLElement) => {
    el.setPointerCapture = () => { captured = true; };
    el.hasPointerCapture = () => captured;
    el.releasePointerCapture = () => { captured = false; };
  };
  capture(item);
  const oldElements = document.elementsFromPoint;
  document.elementsFromPoint = () => [item, gauge];
  const pointer = (el: HTMLElement, type: string, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 20, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    el.dispatchEvent(event);
  };
  try {
    pointer(item, 'pointerdown', 600);
    pointer(item, 'pointermove', 20);
    expect(root.querySelector<HTMLElement>('.item-carry')?.style.top).toBe('20px');
    expect(root.querySelector('.item-shade')).not.toBeNull();
    expect(gauge.classList.contains('blindfold-target')).toBe(true);
    pointer(item, 'pointerup', 20);
    expect(use).toHaveBeenLastCalledWith('people');
    expect(root.querySelector('.blindfold-target, .dragging, .item-carry, .item-shade')).toBeNull();
    if (kind === 'blindfold') {
      document.elementsFromPoint = () => [item.querySelector('.item-face')!, item.parentElement!];
      const beforeTap = placeBlindfold.mock.calls.length;
      pointer(item, 'pointerdown', 600);
      pointer(item, 'pointerup', 600);
      expect(placeBlindfold).toHaveBeenCalledTimes(beforeTap);
      gauge.click();
      expect(placeBlindfold).toHaveBeenLastCalledWith('people');
      pointer(item, 'pointerdown', 600);
      pointer(item, 'pointermove', 580);
      pointer(item, 'pointerup', 600);
      expect(placeBlindfold).toHaveBeenLastCalledWith();
      const mark = root.querySelector<HTMLElement>('.blindfold-mark')!;
      capture(mark);
      document.elementsFromPoint = () => [item.querySelector('.item-face')!];
      pointer(mark, 'pointerdown', 20);
      pointer(mark, 'pointermove', 600);
      pointer(mark, 'pointerup', 600);
      expect(placeBlindfold).toHaveBeenLastCalledWith();
    }
    expect(stamp).not.toHaveBeenCalled();
    expect(setAim).not.toHaveBeenCalled();
  } finally {
    input.dispose();
    document.elementsFromPoint = oldElements;
    root.remove();
  }
});
