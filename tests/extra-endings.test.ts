// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import rawCards from '../data/cards/m1.json';
import system from '../data/system.json';
import {
  initialState,
  earnedExtraEndings,
  type Card,
  type State,
} from '../src/core/state';
import { processDocument, rewind } from '../src/core/loop';
import { endingScreen, titleScreen } from '../src/ui/screens';
import { emptyCollection } from '../src/save/storage';
import { art } from '../src/ui/art';

const daily: Card = {
  ...(rawCards as Card[]).find((card) => card.kind === 'daily')!,
  years: 1,
  tier: 1,
  repeatable: true,
  conditions: undefined,
  axe: true,
  reject: { label: 'safe', effects: {} },
  approve: { label: 'safe', effects: {} },
};

describe('run achievement record', () => {
  it.each(['bullet', 'rewind', 'stitch'] as const)(
    'does not count the real %s offer as insurance',
    (boon) => {
      const current = (rawCards as Card[]).find((card) =>
        ['reject', 'approve'].some(
          (side) => card[side as 'reject' | 'approve']?.grant?.boon === boon,
        ),
      )!;
      const side = current.reject.grant?.boon === boon ? 'reject' : 'approve';
      const other = side === 'reject' ? 'approve' : 'reject';
      const state = {
        ...initialState(),
        year: current.trigger?.year ?? current.trigger?.from ?? 0,
        current,
      };
      expect(
        processDocument(
          state,
          other,
          [daily, ...(rawCards as Card[]).filter((c) => c.boss)],
          () => 0.9,
        ).record.helped,
      ).toBe(false);
      for (const sleep of [0, 2]) {
        expect(
          processDocument(
            { ...state, sleep },
            side,
            [daily, ...(rawCards as Card[]).filter((c) => c.boss)],
            () => (side === 'reject' ? 0.1 : 0.9),
          ).record.helped,
        ).toBe(false);
      }
    },
  );
  it.each(['bullet', 'rewind', 'stitch', 'alice', 'hyean'] as const)(
    'records granted %s, including random approvals while asleep',
    (boon) => {
      const current: Card = {
        ...daily,
        approve: { ...daily.approve, grant: { boon, uses: 5 } },
      };
      for (const sleep of [0, 2]) {
        const before = { ...initialState(), current, sleep };
        const after = processDocument(before, 'approve', [daily], () => 0.9);
        expect(after.record).toEqual({
          helped: false,
          axed: false,
        });
        expect(after.boons[boon]).toBeTruthy();
        expect(before.record).toEqual({ helped: false, axed: false });
      }
    },
  );

  it('does not count gauge adjustment, scope, understudy, or bullet use as insurance', () => {
    const adjusted: Card = { ...daily, approve: { label: 'adjust', effects: { sugar: -20 }, adjust: 10 } };
    const state = { ...initialState(), current: adjusted, gauges: { sugar: 25, people: 50, faith: 50, erpin: 50 } };
    for (const boons of [{}, { scope: 2 }, { understudy: true as const }]) {
      expect(processDocument({ ...state, boons }, 'approve', [daily], () => 0.5).record.helped).toBe(false);
    }
    expect(processDocument({ ...state, boons: { bullet: 1 } }, 'bullet', [daily], () => 0.5).record.helped).toBe(false);
  });

  it('records only a paid axe, keeping flags once earned', () => {
    const state = { ...initialState(), current: daily, boons: { bullet: 3 } };
    expect(processDocument(state, 'axe', [daily], () => 0.5).record.axed).toBe(
      true,
    );
    expect(
      processDocument(
        { ...state, current: { ...daily, axe: 'free' } },
        'axe',
        [daily],
        () => 0.5,
      ).record.axed,
    ).toBe(false);
    expect(
      processDocument(state, 'bullet', [daily], () => 0.5).record.axed,
    ).toBe(false);
    expect(
      processDocument(
        { ...state, current: { ...daily, axe: false } },
        'axe',
        [daily],
        () => 0.5,
      ).record.axed,
    ).toBe(false);
    const record = { helped: true, axed: true };
    expect(
      processDocument({ ...state, record }, 'approve', [daily], () => 0.5)
        .record,
    ).toEqual(record);
  });

  it('preserves the current record across both snapshot and legacy rewinds', () => {
    const { past: _, ...snapshot } = {
      ...initialState(),
      year: 150,
      current: daily,
    };
    const record = { helped: false, axed: true };
    const dead: State = {
      ...initialState(),
      year: 156,
      boons: { rewind: true },
      record,
      ending: { id: 'faith_low' },
    };
    for (const past of [[], [snapshot]]) {
      const restored = rewind({ ...dead, past }, [daily], () => 0.5);
      expect(restored.year).toBeLessThan(dead.year);
      expect(restored.record).toEqual({ ...record, helped: true });
    }
  });

  it.each([
    [false, false, ['purist', 'reformed']],
    [true, false, ['reformed']],
    [false, true, ['purist']],
    [true, true, []],
  ] as const)(
    'selects extras for helped=%s axed=%s',
    (helped, axed, expected) => {
      const state = { ...initialState(), record: { helped, axed } };
      expect(earnedExtraEndings(state)).toEqual([]);
      expect(earnedExtraEndings({ ...state, ending: { id: 'sleep' } })).toEqual(
        [],
      );
      expect(earnedExtraEndings({ ...state, ending: { id: 'true' } })).toEqual(
        expected,
      );
    },
  );
});

it('renders extra documents and all twelve album entries with hints and approve ink', () => {
  const root = document.createElement('div');
  const collection = emptyCollection();
  collection.bestYear.priest = 200;
  for (const id of ['purist', 'reformed'] as const) {
    const item = system.extraEndings.items[id];
    root.innerHTML = endingScreen(
      { ...initialState(), year: 200, ending: { id } },
      collection,
      true,
    );
    expect(root.querySelector('.document-number')!.textContent).toBe(
      system.extraEndings.document,
    );
    expect(root.querySelector('h1')!.textContent).toBe(item.title);
    expect(root.querySelector('.ending-paper')!.textContent).toContain(
      item.text,
    );
    expect(root.querySelector('.end-stamp.approve b')!.textContent).toBe(
      system.extraEndings.stamp,
    );
    // the art block follows the manifest: shown only when the slot has a file
    expect(Boolean(root.querySelector('.ending-art'))).toBe(
      Boolean(art.endings[id]),
    );
    expect(root.querySelector('.return')!.textContent).toBe(
      system.extraEndings.next,
    );
    root.innerHTML = titleScreen(collection);
    expect(
      root.querySelector(`.album-detail[data-ending="${id}"] .album-text`)!
        .textContent,
    ).toBe(system.endingHints[id]);
  }
  collection.endings = ['true', 'purist', 'reformed'];
  root.innerHTML = titleScreen(collection);
  expect(root.querySelector('.album-count')!.textContent).toBe('3 / 12');
  expect(root.querySelectorAll('.album-card')).toHaveLength(12);
  expect(
    [...root.querySelectorAll('.album-part:last-child .album-card')].map(
      (el) => (el as HTMLElement).dataset.ending,
    ),
  ).toEqual(['sleep', 'true', 'purist', 'reformed']);
  for (const id of ['purist', 'reformed'] as const) {
    const detail = root.querySelector(`.album-detail[data-ending="${id}"]`)!;
    expect(detail.textContent).toContain(system.extraEndings.items[id].text);
    expect(
      detail.querySelector('[data-art-slot="ui.stampApprove"]'),
    ).not.toBeNull();
    expect(
      root.querySelector(`.album-card[data-ending="${id}"] .album-tag`)!
        .textContent,
    ).toBe(system.extraEndings.items[id].tag);
  }
});
