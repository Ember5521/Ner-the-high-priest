// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import system from '../data/system.json';
import { END_YEAR, SLEEP_TURNS } from '../src/core/config';
import { initialState, type Card, type State } from '../src/core/state';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';
import { mount } from '../src/ui/app';
import { specialPreviews } from '../src/editor/specials';
import { renderSpecialPreview } from '../src/editor/preview';
import { validateCards } from '../tools/validate-cards';

const daily: Card = {
  ...(raw.find((card) => card.kind === 'daily') as Card),
  id: 'sleep-test',
  conditions: undefined,
  years: 1,
  reject: { label: 'no', effects: {} },
  approve: { label: 'yes', effects: {}, drowse: 3 },
};
const resolve = (overrides: Partial<State> = {}, card = daily) =>
  loop.processDocument(
    { ...initialState(), current: card, ...overrides },
    'approve',
    [daily, ...(raw as Card[]).filter((c) => c.boss)],
    () => 0.9,
  );

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('shows asleep once on the awake transition and blocks processing until dismissed', () => {
  const asleep = resolve();
  expect(asleep.scene).toBe('asleep');
  expect(asleep.sleep).toBe(SLEEP_TURNS);
  expect(loop.processDocument(asleep, 'approve', [daily], () => 0.9)).toBe(
    asleep,
  );
  const dismissed = loop.dismissScene(asleep);
  const next = loop.processDocument(dismissed, 'approve', [daily], () => 0.9);
  expect(next.scene).toBeNull();
  expect(next.sleep).toBe(SLEEP_TURNS - 1);
  expect(resolve({}, { ...daily, approve: daily.reject }).scene).toBeNull();
});

it.each(['stitch', 'speakiFooled', 'speakiCaught'])(
  'keeps %s first and queues asleep without consuming a sleeping document',
  (scene) => {
    const card: Card =
      scene === 'stitch'
        ? { ...daily, approve: { ...daily.approve, effects: { sugar: -100 } } }
        : {
            ...daily,
            axe: scene === 'speakiCaught' ? true : 'free',
            missed: { scene: 'speakiFooled' },
            axeResult: { scene: 'speakiCaught' },
          };
    const next =
      scene === 'speakiCaught'
        ? loop.processDocument(
            { ...initialState(), current: card, drowse: { stack: 2, left: 4 } },
            'axe',
            [daily],
            () => 0.9,
          )
        : resolve(
            { boons: { stitch: true }, drowse: { stack: 2, left: 4 } },
            card,
          );
    expect(next.scene).toBe(scene);
    expect(next.asleepPending).toBe(true);
    const asleep = loop.dismissScene(next);
    expect(asleep.scene).toBe('asleep');
    expect(asleep.sleep).toBe(SLEEP_TURNS);
    expect(asleep.current).toBe(next.current);
    expect(loop.dismissScene(asleep).scene).toBeNull();
    // The simulator clears scene directly before asking the engine to proceed.
    expect(
      loop.processDocument(
        { ...next, scene: null },
        'approve',
        [daily],
        () => 0.9,
      ).scene,
    ).toBe('asleep');
  },
);

it('preserves Erpin rescue priority during sleep', () => {
  const rescued = resolve(
    { sleep: 3 },
    {
      ...daily,
      approve: { label: 'danger', effects: { sugar: -100 } },
    },
  );
  expect(rescued.scene).toBe('erpinSave');
  expect(rescued.asleepPending).toBe(false);
  expect(loop.dismissScene({ ...rescued, asleepPending: true }).scene).toBe(
    'asleep',
  );
});

it('does not show asleep on death or at the year-200 wake-up', () => {
  expect(
    resolve(
      {},
      { ...daily, approve: { ...daily.approve, effects: { sugar: -100 } } },
    ).scene,
  ).toBeNull();
  for (const year of [END_YEAR - 1, END_YEAR]) {
    const next = resolve({ year });
    expect(next.sleep).toBe(0);
    expect(next.scene).toBeNull();
    expect(next.asleepPending).toBe(false);
  }
  expect(
    deck.nextDocument(
      { ...initialState(), year: END_YEAR, sleep: 3, asleepPending: true },
      [daily, ...(raw as Card[]).filter((c) => c.boss)],
      () => 0.9,
    ).asleepPending,
  ).toBe(false);
});

it.each([null, 'stitch', 'erpinSave'])(
  'waits through %s and asleep, then starts automatic stamping after dismissal',
  (preceding) => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const state = resolve();
    vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
      ...state,
      scene: preceding ?? 'asleep',
      asleepPending: preceding !== null,
    });
    const process = vi.spyOn(loop, 'processDocument');
    const root = document.createElement('div');
    document.body.append(root);
    unmount = mount(root);
    root
      .querySelector<HTMLButtonElement>('.preferences-overlay [data-close]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>('.mode-option[aria-checked="true"]')!
      .click();
    vi.advanceTimersByTime(620);
    vi.advanceTimersByTime(10000);
    expect(process).not.toHaveBeenCalled();
    if (preceding) {
      root.querySelector<HTMLButtonElement>('.scene-next')!.click();
      vi.advanceTimersByTime(10000);
      expect(process).not.toHaveBeenCalled();
    }
    expect(root.querySelector('.scene-head')?.textContent).toBe(
      system.scenes.asleep.header,
    );
    expect(root.querySelector('.desk.sleeping')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.scene-next')!.click();
    expect(root.querySelector('.scene')).toBeNull();
    vi.advanceTimersByTime(1299);
    expect(process).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(process).toHaveBeenCalledTimes(1);
    expect(process.mock.results[0]!.value.sleep).toBe(SLEEP_TURNS - 1);
  },
);

it('offers the asleep editor preview over a sleeping desk', () => {
  expect(specialPreviews.asleep).toBe('네르가 잠들 때');
  const root = document.createElement('div');
  document.body.append(root);
  renderSpecialPreview(root, 'asleep');
  expect(root.querySelector('.desk.sleeping .scene')).not.toBeNull();
  expect(root.querySelector('#scene-title')?.textContent).toBe(
    system.scenes.asleep.title,
  );
});

it('requires asleep copy with an existing UI art key', () => {
  const original = system.scenes.asleep;
  try {
    expect(validateCards(raw)).toEqual([]);
    Object.assign(system.scenes, { asleep: undefined });
    expect(validateCards(raw)).toContain(
      'scenes.asleep must exist and reference an existing ui art key',
    );
    Object.assign(system.scenes, { asleep: { ...original, art: 'missing' } });
    expect(validateCards(raw)).toContain(
      'scenes.asleep must exist and reference an existing ui art key',
    );
  } finally {
    system.scenes.asleep = original;
  }
});
