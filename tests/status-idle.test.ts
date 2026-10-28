// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import rawCards from '../data/cards/m1.json';
import { initialState, type ActiveStatus, type Card } from '../src/core/state';
import * as deck from '../src/core/deck';
import { mount } from '../src/ui/app';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';

const card: Card = {
  ...(rawCards as Card[]).find((c) => c.kind === 'daily')!,
  approve: { label: 'yes', effects: { sugar: 5 } },
};
const active = (effect: Partial<ActiveStatus>): ActiveStatus => ({
  id: 'ember',
  source: card.id,
  left: 2,
  ...effect,
});
const render = (
  statuses: ActiveStatus[],
  mode: 'apprentice' | 'priest' = 'apprentice',
) => {
  const state = { ...initialState(mode), current: card, statuses };
  const root = document.createElement('div');
  root.innerHTML = gaugesMarkup(state);
  return { root, state };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

it.each([
  ['apprentice', -2, 'down'],
  ['apprentice', 2, 'up'],
  ['priest', -2, 'down'],
  ['priest', 2, 'up'],
] as const)('shows %s tick %i as %s below the icon', (mode, tick, shape) => {
  const { root, state } = render([active({ tick: { sugar: tick } })], mode);
  const gauge = root.querySelector('[data-gauge="sugar"]')!;
  const mark = gauge.querySelector('.status-badge')!;
  expect(mark.getAttribute('data-shape')).toBe(shape);
  expect(mark.getAttribute('data-status')).toBe('ember');
  expect(gauge.classList.contains('has-status')).toBe(true);
  expect(gauge.querySelector('.resource-icon')!.nextElementSibling).toBe(
    mark.parentElement,
  );
  updateGaugePreview(root, card, 'approve', false, state);
  updateGaugePreview(root, card, null, false, state);
  expect(gauge.querySelector('.status-badge')).toBe(mark);
});

it.each(['apprentice', 'priest'] as const)(
  'shows %s freeze, scale and bomb shapes, leaving other gauges unmarked',
  (mode) => {
    const { root } = render(
      [
        active({
          freeze: 'sugar',
          scale: { gauge: 'people', factor: 1.5 },
          delayed: { faith: -5 },
        }),
      ],
      mode,
    );
    expect(root.querySelectorAll('.status-badge')).toHaveLength(3);
    for (const [key, shape] of [
      ['sugar', 'freeze'],
      ['people', 'diamond'],
      ['faith', 'bomb'],
    ]) {
      expect(
        root
          .querySelector(`[data-gauge="${key}"] .status-badge`)!
          .getAttribute('data-shape'),
      ).toBe(shape);
    }
    expect(
      root
        .querySelector('[data-gauge="faith"] .status-badge')!
        .getAttribute('data-dir'),
    ).toBe('down');
    expect(root.querySelector('[data-gauge="erpin"].has-status')).toBeNull();
    expect(root.querySelector('.status-idle')).toBeNull();
  },
);
it.each([5, -5])(
  'shows bomb direction for delayed %i in every mode',
  (delta) => {
    for (const mode of ['apprentice', 'priest'] as const) {
      const { root } = render(
        [
          active({
            delayed: { faith: delta },
            freeze: 'people',
            tick: { sugar: 2 },
          }),
        ],
        mode,
      );
      const badges = root.querySelectorAll<HTMLElement>('.status-badge');
      expect(badges).toHaveLength(3);
      for (const [key, shape, dir] of [
        ['faith', 'bomb', delta > 0 ? 'up' : 'down'],
        ['people', 'freeze', undefined],
        ['sugar', 'up', undefined],
      ] as const) {
        const badge = root.querySelector<HTMLElement>(
          `[data-gauge="${key}"] .status-badge`,
        )!;
        expect(badge.dataset.shape).toBe(shape);
        expect(badge.dataset.dir).toBe(dir);
      }
    }
  },
);
it('renders both badges for overlapping statuses', () => {
  const { root } = render([
    active({ freeze: 'sugar' }),
    active({ tick: { sugar: -2 } }),
  ]);
  expect(root.querySelectorAll('.status-badge')).toHaveLength(2);
});

it('refreshes badges when a document resolves and an old status expires', () => {
  vi.useFakeTimers();
  localStorage.clear();
  const state = {
    ...initialState('apprentice'),
    current: {
      ...card,
      approve: {
        ...card.approve,
        status: { id: 'ember', turns: 2, tick: { sugar: -2 } },
      },
    },
    statuses: [{ ...active({ freeze: 'people' }), id: 'strike', left: 1 }],
  };
  vi.spyOn(deck, 'nextDocument').mockReturnValueOnce(state);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const animate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => ({})),
  });
  const root = document.createElement('div');
  document.body.append(root);
  const unmount = mount(root);
  try {
    root
      .querySelector<HTMLButtonElement>('.preferences-overlay [data-close]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>('.mode-option[aria-checked="true"]')!
      .click();
    vi.advanceTimersByTime(620);
    expect(
      root.querySelector('[data-gauge="people"].has-status'),
    ).not.toBeNull();
    expect(root.querySelector('[data-gauge="sugar"] .status-badge')).toBeNull();
    for (const key of ['ArrowRight', 'ArrowRight', ' '])
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, cancelable: true }),
      );
    vi.advanceTimersByTime(3000);
    expect(root.querySelector('[data-gauge="people"].has-status')).toBeNull();
    expect(
      root.querySelector('[data-gauge="people"] .status-badge'),
    ).toBeNull();
    expect(
      root
        .querySelector('[data-gauge="sugar"].has-status .status-badge')
        ?.getAttribute('data-shape'),
    ).toBe('down');
  } finally {
    unmount();
    root.remove();
    vi.clearAllTimers();
    if (animate) Object.defineProperty(Element.prototype, 'animate', animate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
  }
});
