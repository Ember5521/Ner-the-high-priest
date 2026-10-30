import { format } from '../src/i18n';
import { END_YEAR, SLEEP_TURNS } from '../src/core/config';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cards from '../data/cards/m1.json';
import system from '../data/system.json';
import {
  initialState,
  type Action,
  type Card,
  type State,
} from '../src/core/state';
import { mount } from '../src/ui/app';
import { createInput, type Input } from '../src/ui/input';
import { dropTool, liftTool, playAction } from '../src/ui/fx';
import { documentMarkup } from '../src/ui/document';
import { toolsMarkup } from '../src/ui/tools';
import { ACTION_MS, CONTACT_MS } from '../src/ui/tools';
import { gaugesMarkup, updateGaugePreview } from '../src/ui/gauges';
import {
  AXE_DECAY_BY_STACK,
  BULLET_CHARGES,
  decayFor,
  SPECIAL_CHANCE,
} from '../src/core/config';
import { art, uiUrl } from '../src/ui/art';
import * as deck from '../src/core/deck';
import * as loop from '../src/core/loop';
import * as sound from '../src/ui/sound';
import * as gauges from '../src/ui/gauges';

const firstMandatory = (cards as Card[])
  .filter(
    (card) =>
      (card.kind === 'story' || card.kind === 'fixed') &&
      card.trigger &&
      (card.trigger.year ?? Infinity) <= initialState().year &&
      (card.conditions?.flagsAll ?? []).length === 0,
  )
  .sort(
    (a, b) =>
      (a.trigger!.year ?? Infinity) - (b.trigger!.year ?? Infinity) ||
      a.trigger!.order - b.trigger!.order,
  )[0]!;
const factionLabel = (card: Card) =>
  (system.factions as Record<string, string>)[card.faction] ?? card.faction;
const showCard = (current: Card) => {
  unmount();
  vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
    ...initialState(),
    current,
  });
  unmount = mount(root);
  startRun();
};

let root: HTMLDivElement;
let unmount: () => void;
const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const expectPips = (stack: 0 | 1 | 2, left: number) => {
  const pips = find('.axe-slot > .drowse');
  expect(pips.previousElementSibling).toBe(find('.axe-pair'));
  expect(pips.dataset.stack).toBe(String(stack));
  expect(pips.querySelectorAll('i')).toHaveLength(3);
  expect(pips.querySelectorAll('i.on')).toHaveLength(stack);
  expect(
    [...pips.querySelectorAll('i')].map((pip) => pip.classList.contains('on')),
  ).toEqual([0, 1, 2].map((i) => i < stack));
  expect(pips.querySelector('small')!.textContent).toBe(
    stack ? format(system.ui.drowseShort, { stack, n: left }) : '',
  );
  expect(pips.getAttribute('aria-label')).toBe(
    `졸음 ${stack}/3${stack ? `, ${left}장 뒤 한 단계 회복` : ''}`,
  );
};
const click = (selector: string, detail = 0) =>
  find(selector).dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail }),
  );
const startRun = () => {
  root
    .querySelector<HTMLButtonElement>('.preferences-overlay [data-close]')
    ?.click();
  click('.mode-option[aria-checked="true"]');
  vi.advanceTimersByTime(620);
};
const key = (key: string, repeat = false) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, repeat, cancelable: true }),
  );
const year = () => find('.topbar .year b')?.textContent;
const pointer = (
  el: HTMLElement,
  type: string,
  x = 30,
  y = 600,
  button = 0,
  id = 1,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  el.dispatchEvent(event);
  return event;
};
const tap = (action: Action) => {
  const tool = find(`[data-action="${action}"]`);
  pointer(tool, 'pointerdown');
  pointer(tool, 'pointerup');
};
const choose = (action: Action) => {
  if (action === 'axe') {
    key('ArrowDown');
    key('ArrowDown');
  } else {
    const arrow = action === 'approve' ? 'ArrowRight' : 'ArrowLeft';
    key(arrow);
    key(arrow);
  }
  key(' ');
};
// Walks past the opening story/fixed events to the first ordinary card that
// the axe may be used on.
const reachAxes = () => {
  for (let i = 0; i < 20; i++) {
    const axeOpen =
      find('[data-action="axe"]').getAttribute('aria-disabled') === 'false';
    if (axeOpen && Number(year()) >= 6) break;
    choose(i % 2 ? 'reject' : 'approve');
  }
  expect(Number(year())).toBeGreaterThanOrEqual(6);
  expect(find('[data-action="axe"]').getAttribute('aria-disabled')).toBe(
    'false',
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(SPECIAL_CHANCE);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app')!;
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => ({})),
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return this.classList.contains('document')
        ? new DOMRect(100, 100, 400, 400)
        : new DOMRect(0, 560, 80, 80);
    },
  );
  unmount = mount(root);
  startRun();
});
afterEach(() => {
  unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('title album', () => {
  beforeEach(() => {
    unmount();
    localStorage.setItem(
      'ner-m1-collection',
      JSON.stringify({ bestYear: 12, endings: ['faith_low'] }),
    );
    unmount = mount(root);
  });

  const card = (id: string) => `.album-card[data-ending="${id}"]`;
  const detail = (id: string) => `.album-detail[data-ending="${id}"]`;
  const visibleDetails = () =>
    root.querySelectorAll('.album-detail:not([hidden])');
  const shiftTab = () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        cancelable: true,
      }),
    );

  it('shows saved records and the discovered ending count', () => {
    expect(find('.records').textContent).toContain('12년');
    // the discovered count rides on the album button, not in the records row
    expect(find('.album-open .album-progress').textContent).toBe('1 / 12');
    expect(find('.album-count').textContent).toBe('1 / 12');
    expect(root.querySelectorAll('.album-card')).toHaveLength(12);
    expect(find('.album').hidden).toBe(true);
  });

  it.each(['button', 'Escape', 'backdrop'])(
    'opens and closes via %s',
    (method) => {
      click('.album-open');
      expect(find('.album').hidden).toBe(false);
      expect(document.activeElement).toBe(find('.album-close'));
      expect(find('.album-open').getAttribute('aria-expanded')).toBe('true');
      click('.album-book');
      expect(find('.album').hidden).toBe(false);
      if (method === 'Escape') key('Escape');
      else {
        click(card('faith_low'));
        click(method === 'button' ? '.album-close' : '.album');
      }
      expect(find('.album').hidden).toBe(true);
      expect(find('.album').classList.contains('reading')).toBe(false);
      expect(visibleDetails()).toHaveLength(0);
      expect(document.activeElement).toBe(find('.album-open'));
      expect(find('.album-open').getAttribute('aria-expanded')).toBe('false');
      click('.album-open');
      expect(find('.album').classList.contains('reading')).toBe(false);
    },
  );

  it('shows found endings and locked hints, and returns focus with back or Escape', () => {
    click('.album-open');
    click(card('faith_low'));
    expect(find('.album').classList.contains('reading')).toBe(true);
    expect(visibleDetails()).toHaveLength(1);
    expect(find(detail('faith_low')).hidden).toBe(false);
    expect(find(`${detail('faith_low')} h3`).textContent).toBe(
      system.gameOvers.faith_low.title,
    );
    expect(document.activeElement).toBe(find('.album-back'));
    click('.album-back');
    expect(find('.album').classList.contains('reading')).toBe(false);
    expect(visibleDetails()).toHaveLength(0);
    expect(document.activeElement).toBe(find(card('faith_low')));

    click(card('faith_high'));
    expect(visibleDetails()).toHaveLength(1);
    expect(find(detail('faith_high')).hidden).toBe(false);
    expect(find(`${detail('faith_high')} .album-text`).textContent).toBe(
      system.endingHints.faith_high,
    );
    key('Escape');
    expect(find('.album').hidden).toBe(false);
    expect(find('.album').classList.contains('reading')).toBe(false);
    expect(visibleDetails()).toHaveLength(0);
    expect(document.activeElement).toBe(find(card('faith_high')));
    key('Escape');
    expect(find('.album').hidden).toBe(true);
  });

  it('traps Tab within the current album page in both directions', () => {
    click('.album-open');
    shiftTab();
    expect(document.activeElement).toBe(find(card('reformed')));
    key('Tab');
    expect(document.activeElement).toBe(find('.album-close'));
    key('Tab');
    expect(document.activeElement).toBe(find('.album-card'));
    click(card('faith_low'));
    // the sheet's buttons: close and back; the picture is not a button
    key('Tab');
    expect(document.activeElement).toBe(find('.album-close'));
    key('Tab');
    expect(document.activeElement).toBe(find('.album-back'));
    shiftTab();
    expect(document.activeElement).toBe(find('.album-close'));
    shiftTab();
    expect(document.activeElement).toBe(find('.album-back'));
  });

  it('shows a found ending picture on its sheet without a zoom control', () => {
    click('.album-open');
    click(card('faith_low'));
    const art = find('.album-detail[data-ending="faith_low"] .album-picture');
    expect(art.tagName).toBe('DIV');
    expect(art.querySelector('img')).not.toBeNull();
    expect(document.querySelector('.album-lightbox, .album-zoom')).toBeNull();
  });

  it('keeps game keys inactive on the title and removes album listeners when play starts', () => {
    key('Escape');
    key('ArrowRight');
    expect(find('.album').hidden).toBe(true);
    click('.album-open');
    key('ArrowRight');
    expect(root.querySelector('.menu,.aimed,.ink')).toBeNull();
    const oldAlbum = find('.album');
    startRun();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    key('ArrowRight');
    expect(root.querySelector('.aimed.approve')).not.toBeNull();
    key('Escape');
    expect(root.querySelector('.aimed')).toBeNull();
    expect(find('.menu').hidden).toBe(true);
    key('Escape');
    expect(find('.menu').hidden).toBe(false);
    expect(oldAlbum.hidden).toBe(false);
  });

  it('removes the album keyboard listener on unmount', () => {
    click('.album-open');
    unmount();
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(find('.album').hidden).toBe(false);
  });
});

describe('document tools', () => {
  it.each(['story', 'fixed'] as const)(
    'uses direction faces, names, ghosts and imprints on %s cards',
    (kind) => {
      const card = {
        ...(cards.find((c) => c.id === 'story_escape_1') as Card),
        kind,
      };
      for (const [action, name, art] of [
        ['reject', '왼쪽', 'stampLeft'],
        ['approve', '오른쪽', 'stampRight'],
      ] as const) {
        showCard(card);
        const tool = find(`[data-action="${action}"]`);
        expect(tool.getAttribute('aria-label')).toBe(`${name} 도장`);
        expect(
          tool.querySelector('.tool-name')!.textContent!.replace(/[←→]/g, ''),
        ).toBe(name);
        expect(tool.querySelector('img')!.getAttribute('src')).toBe(uiUrl(art));
        pointer(tool, 'pointerdown');
        expect(find('.ghost img').getAttribute('src')).toBe(uiUrl(art));
        expect(find('.choice-caption').textContent).toBe(card[action].label);
        pointer(tool, 'pointerup', 200, 200);
        expect(find(`.ink.${action}`).style.backgroundImage).toContain(
          uiUrl(art),
        );
      }
    },
  );

  it.each(['story', 'fixed'] as const)(
    'uses light faces, names, ghosts and imprints on %s cards',
    (kind) => {
      const card = {
        ...(cards.find((c) => c.id === 'story_finale_light') as Card),
        kind,
      };
      for (const [action, name, art] of [
        ['reject', '빛으로', 'stampLight'],
        ['approve', '빛으로', 'stampLight'],
      ] as const) {
        showCard(card);
        const tool = find(`[data-action="${action}"]`);
        expect(tool.getAttribute('aria-label')).toBe(`${name} 가는 도장`);
        expect(
          tool.querySelector('.tool-name')!.textContent!.replace(/[←→]/g, ''),
        ).toBe(name);
        expect(tool.querySelector('img')!.getAttribute('src')).toBe(uiUrl(art));
        pointer(tool, 'pointerdown');
        expect(find('.ghost img').getAttribute('src')).toBe(uiUrl(art));
        expect(find('.choice-caption').textContent).toBe(card[action].label);
        pointer(tool, 'pointerup', 200, 200);
        expect(find(`.ink.${action}`).style.backgroundImage).toContain(
          uiUrl(art),
        );
      }
    },
  );

  it.each(['story', 'fixed'] as const)(
    'uses meet faces, names, ghosts and imprints on %s cards',
    (kind) => {
      const card = {
        ...(cards.find((c) => c.id === 'story_finale_stranger') as Card),
        kind,
      };
      for (const [action, name, art] of [
        ['reject', '손을 내민다', 'stampMeet'],
        ['approve', '손을 내민다', 'stampMeet'],
      ] as const) {
        showCard(card);
        const tool = find(`[data-action="${action}"]`);
        expect(tool.getAttribute('aria-label')).toBe('손을 내미는 도장');
        expect(find('[data-action="axe"] .tool-name').textContent).toBe(
          '도끼',
        );
        expect(
          tool.querySelector('.tool-name')!.textContent!.replace(/[←→]/g, ''),
        ).toBe(name);
        expect(tool.querySelector('img')!.getAttribute('src')).toBe(uiUrl(art));
        pointer(tool, 'pointerdown');
        expect(find('.ghost img').getAttribute('src')).toBe(uiUrl(art));
        expect(find('.choice-caption').textContent).toBe(card[action].label);
        pointer(tool, 'pointerup', 200, 200);
        expect(find(`.ink.${action}`).style.backgroundImage).toContain(
          uiUrl(art),
        );
      }
    },
  );

  it.each([
    ['reject', undefined],
    ['approve', undefined],
    ['reject', 'story_diana_thanks'],
    ['approve', 'story_diana_thanks'],
    ['reject', 'story_diana_thanks_again'],
    ['approve', 'story_diana_thanks_again'],
  ] as const)(
    'presents story %s (%s) as approval while preserving the choice',
    (action, id) => {
      const story = cards.find((card) =>
        id ? card.id === id : card.kind === 'story',
      ) as Card;
      showCard(story);
      for (const selector of ['.desk', '.document']) {
        expect(find(selector).classList.contains('approve-both')).toBe(!id);
        expect(find(selector).classList.contains('doc-special')).toBe(!!id);
        expect(find(selector).classList.contains('doc-story')).toBe(!id);
      }
      expect(find('.document-number').textContent).toBe(
        `${id ? system.ui.specialPrefix : system.ui.chroniclePrefix}${factionLabel(story)}`,
      );
      expect(find('[data-action="axe"]').getAttribute('aria-disabled')).toBe(
        'true',
      );
      for (const [side, label] of [
        ['reject', id ? story.reject.label : system.ui.approveLeftStamp],
        ['approve', id ? story.approve.label : system.ui.approveRightStamp],
      ]) {
        const tool = find(`[data-action="${side}"]`);
        expect(tool.getAttribute('aria-label')).toBe(label);
        // the arrow sits outside the name: "← 승인" on the left, "승인 →" on the right
        expect(
          tool.querySelector('.tool-name')!.textContent!.replace(/[←→]/g, ''),
        ).toBe(
          id ? story[side as 'reject' | 'approve'].label : system.ui.approve,
        );
        expect(tool.querySelector('img')!.getAttribute('src')).toBe(
          uiUrl(
            id
              ? side === 'reject'
                ? 'stampLeft'
                : 'stampRight'
              : 'stampApprove',
          ),
        );
      }
      pointer(find(`[data-action="${action}"]`), 'pointerdown');
      expect(find('.ghost img').getAttribute('src')).toBe(
        uiUrl(
          id
            ? action === 'reject'
              ? 'stampLeft'
              : 'stampRight'
            : 'stampApprove',
        ),
      );
      expect(find('.choice-caption').textContent).toBe(story[action].label);
      pointer(find(`[data-action="${action}"]`), 'pointerup', 200, 200);
      expect(find(`.ink.${action}`).classList.contains('approve-both')).toBe(
        !id,
      );
      expect(find(`.ink.${action}`).style.backgroundImage).toContain(
        uiUrl(
          id
            ? action === 'reject'
              ? 'stampLeft'
              : 'stampRight'
            : 'stampApprove',
        ),
      );
    },
  );

  it('renders special hooks and prefix with normal reject ghost and imprint', () => {
    const special = cards.find((card) => card.kind === 'special') as Card;
    const daily = { ...special, kind: 'daily' as const, tier: 1 as const };
    showCard(special);
    expect(root.querySelector('.desk.doc-special')).not.toBeNull();
    expect(root.querySelector('.document.doc-special')).not.toBeNull();
    expect(toolsMarkup(special, initialState().drowse)).toBe(
      toolsMarkup(daily, initialState().drowse),
    );
    expect(find('.document-number').textContent).toBe(
      `${system.ui.specialPrefix}${factionLabel(special)}`,
    );
    expect(
      root.querySelector('.doc-story,.doc-fixed,.special,.approve-both'),
    ).toBeNull();
    liftTool(root, 'reject', { x: 200, y: 200 });
    expect(find('.ghost img').getAttribute('src')).toBe(uiUrl('stampReject'));
    playAction(root, 'reject', { x: 200, y: 200 }, false);
    expect(find('.ink.reject').style.backgroundImage).toContain(
      uiUrl('stampReject'),
    );
  });

  it.each(['daily', 'speaki'] as const)(
    'renders %s without document kind classes or prefix',
    (kind) => {
      const daily = cards.find((card) => card.kind === 'daily') as Card;
      const card =
        kind === 'speaki'
          ? { ...daily, kind, mimic: daily.id, axe: 'free' as const }
          : daily;
      showCard(card);
      for (const selector of ['.desk', '.document']) {
        expect(
          [...find(selector).classList].filter((c) => c.startsWith('doc-')),
        ).toEqual([]);
      }
      expect(find('.document-number').textContent).toBe(factionLabel(daily));
      // apart from its one faint pumpkin, a forgery looks like the real thing
      expect(
        documentMarkup(card).replace(/<i class="speaki-pumpkin"[\s\S]*?<\/i>/, ''),
      ).toBe(documentMarkup(daily));
    },
  );

  it.each(['story', 'fixed', 'special', 'daily', 'speaki'] as const)(
    'preserves only document kind classes on %s axe halves',
    (kind) => {
      const card = cards.find((card) => card.kind === kind) as Card;
      showCard(card);
      const classes = [...find('.document').classList].filter((c) =>
        c.startsWith('doc-'),
      );
      playAction(root, 'axe', { x: 200, y: 200 }, false);
      expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
      root.querySelectorAll('.axe-half').forEach((half) => {
        expect([...half.classList].filter((c) => c.startsWith('doc-'))).toEqual(
          classes,
        );
        expect(half.classList.contains('processed-axe')).toBe(false);
        expect(half.classList.contains('chopped')).toBe(false);
      });
    },
  );

  it('renders fixed hooks and normal stamps on the desk and document', () => {
    const fixed = cards.find((card) => card.kind === 'fixed') as Card;
    showCard(fixed);
    expect(find('.desk').classList.contains('doc-fixed')).toBe(true);
    expect(find('.document').classList.contains('doc-fixed')).toBe(true);
    expect(find('.document-number').textContent).toBe(
      `중요 공문 · ${system.factions.fairy}`,
    );
    expect(root.querySelector('.doc-story,.special')).toBeNull();
    expect(find('[data-action="reject"] img').getAttribute('src')).toBe(
      uiUrl('stampReject'),
    );
  });

  it('shows the pips and countdown, and hides preview size at stack two', () => {
    expect(find('.desk').dataset.drowse).toBe('0');
    expectPips(0, 0);
    reachAxes();
    choose('axe');
    expectPips(1, AXE_DECAY_BY_STACK[1]);
    choose('axe');
    expect(find('.desk').dataset.drowse).toBe('2');
    expect(root.querySelector('.desk.dim')).toBeNull();
    expectPips(2, AXE_DECAY_BY_STACK[2]);
    tap('approve');
    expect(
      [...root.querySelectorAll<HTMLElement>('.preview-dot')]
        // a lingering-effect ◇ alone has no pips to hide
        .filter((dot) => !dot.hidden && dot.querySelector('.pips'))
        .every((dot) => dot.dataset.pips === '0' && !dot.dataset.dir),
    ).toBe(true);
  });

  it.each(['approve', 'reject'] as const)(
    'captures a %s drag and stamps at the release point',
    (action) => {
      const tool = find(`[data-action="${action}"]`);
      tool.setPointerCapture = vi.fn();
      tool.hasPointerCapture = vi.fn(() => true);
      tool.releasePointerCapture = vi.fn();
      expect(pointer(tool, 'pointerdown').defaultPrevented).toBe(false);
      expect(tool.setPointerCapture).toHaveBeenCalledWith(1);
      pointer(tool, 'pointermove', 200, 200);
      expect(find('.document').classList.contains('target')).toBe(true);
      pointer(tool, 'pointerup', 300, 250);
      expect(tool.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(find('.ghost').style.left).toBe('300px');
      const ink = find(`.imprints .ink.${action}`);
      expect(ink.style.left).toBe('200px');
      expect(ink.style.top).toBe('150px');
      expect(ink.style.backgroundImage).toContain('art/');
      vi.advanceTimersByTime(ACTION_MS - 1);
      expect(year()).toBe('0');
      vi.advanceTimersByTime(1);
      expect(year()).toBe('1');
      expect(root.querySelector('.ghost,.lifted,.target')).toBeNull();
    },
  );

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
    'returns an outside drag on %s without processing',
    (release) => {
      const tool = find('[data-action="approve"]');
      pointer(tool, 'pointerdown');
      pointer(tool, 'pointermove', 600, 600);
      pointer(tool, release, 600, 600);
      expect(root.querySelector('.ghost.returning')).not.toBeNull();
      vi.advanceTimersByTime(1000);
      expect(root.querySelector('.ghost,.lifted,.aimed')).toBeNull();
      expect(year()).toBe('0');
    },
  );

  it('measures release travel even without a pointermove', () => {
    const tool = find('[data-action="approve"]');
    pointer(tool, 'pointerdown');
    pointer(tool, 'pointerup', 600, 600);
    expect(root.querySelector('.aimed,.ink')).toBeNull();
  });

  it('aims on tap with the card caption and signed preview dots, then confirms', () => {
    tap('approve');
    expect(find('.choice-caption').textContent).toBe(
      firstMandatory.approve.label,
    );
    expect(
      [...root.querySelectorAll<HTMLElement>('.preview-dot')].every(
        (dot) => dot.hidden,
      ),
    ).toBe(true);
    expect(find('.preview-dot').textContent).toBe('');
    expect(year()).toBe('0');
    tap('approve');
    expect(root.querySelector('.ink.approve')).not.toBeNull();
    vi.advanceTimersByTime(ACTION_MS + 260);
    expect(year()).toBe('1');
  });

  it('cancels background tap aim but preserves a held ghost and ignores right-clicks', () => {
    tap('reject');
    pointer(find('.document'), 'pointerdown', 200, 200, 2);
    pointer(find('[data-action="approve"]'), 'pointerdown', 30, 600, 2);
    expect(root.querySelector('.aimed.reject')).not.toBeNull();
    pointer(find('.document'), 'pointerdown', 200, 200);
    expect(root.querySelector('.aimed')).toBeNull();
    const tool = find('[data-action="reject"]');
    pointer(tool, 'pointerdown');
    pointer(find('.document'), 'pointerdown', 200, 200, 0, 2);
    expect(root.querySelector('.aimed.reject')).not.toBeNull();
    expect(root.querySelector('.ghost.reject')).not.toBeNull();
    pointer(tool, 'pointercancel');
    expect(year()).toBe('0');
  });

  it('supports keyboard aim, opposite-key cancellation, Escape and same-key confirmation', () => {
    key('ArrowLeft');
    expect(find('.choice-caption').textContent).toBe(
      firstMandatory.reject.label,
    );
    key('ArrowRight');
    expect(root.querySelector('.aimed')).toBeNull();
    key('ArrowRight');
    key('Escape');
    expect(find('.choice-caption').textContent).toBe('');
    expect(
      [...root.querySelectorAll<HTMLElement>('.preview-dot')].every(
        (dot) => dot.hidden,
      ),
    ).toBe(true);
    key('ArrowRight');
    key('ArrowRight', true);
    expect(root.querySelector('.ink')).toBeNull();
    key('ArrowRight');
    expect(root.querySelector('.ink.approve')).not.toBeNull();
    key(' ');
    expect(year()).toBe('1');
  });

  it('uses detail-zero Enter clicks to aim and confirm, ignoring pointer-generated clicks', () => {
    find('[data-action="reject"]').focus();
    click('[data-action="reject"]', 1);
    expect(root.querySelector('.aimed')).toBeNull();
    click('[data-action="reject"]');
    expect(find('.choice-caption').textContent).toBe(
      firstMandatory.reject.label,
    );
    click('[data-action="reject"]');
    expect(root.querySelector('.ink.reject')).not.toBeNull();
    key(' ');
    expect(year()).toBe('1');
  });

  it.each(['space', 'background', 'tool'])(
    'skips an action exactly once with %s',
    (skip) => {
      tap('approve');
      tap('approve');
      if (skip === 'space') key(' ');
      else
        pointer(
          find(skip === 'tool' ? '[data-action="reject"]' : '.document'),
          'pointerdown',
        );
      expect(year()).toBe('1');
      vi.advanceTimersByTime(1200);
      expect(year()).toBe('1');
      expect(root.querySelector('.ghost,.lifted')).toBeNull();
    },
  );

  it('hesitates on a forbidden axe via tap, drag start, keyboard and Enter click', () => {
    for (const activate of [
      () => tap('axe'),
      () => {
        const tool = find('[data-action="axe"]');
        pointer(tool, 'pointerdown');
        expect(root.querySelector('.ghost,.aimed')).toBeNull();
        pointer(tool, 'pointermove', 200, 200);
        pointer(tool, 'pointerup', 200, 200);
      },
      () => key('ArrowDown'),
      () => click('[data-action="axe"]'),
    ]) {
      activate();
      expect(root.querySelector('.axe.hesitating')).not.toBeNull();
      expect(root.querySelector('.ghost,.axe-half,.ink,.aimed')).toBeNull();
      key(' ');
      expect(year()).toBe('0');
    }
  });

  it.each(['ArrowLeft', 'ArrowRight', 'Escape'])(
    'cancels axe aim with %s without processing or opening the menu',
    (cancel) => {
      reachAxes();
      const before = year();
      key('ArrowDown');
      key(cancel);
      expect(root.querySelector('.aimed,.axe-half')).toBeNull();
      expect(find('.choice-caption').textContent).toBe('');
      expect(find('.menu').hidden).toBe(true);
      expect(year()).toBe(before);
      if (cancel === 'Escape') {
        key('Escape');
        expect(find('.menu').hidden).toBe(false);
      }
    },
  );

  it.each(['ArrowLeft', 'ArrowRight'])(
    'cancels stamp aim with ArrowDown after %s',
    (arrow) => {
      reachAxes();
      key(arrow);
      key('ArrowDown');
      expect(root.querySelector('.aimed,.axe-half')).toBeNull();
      expect(find('.choice-caption').textContent).toBe('');
    },
  );

  it.each(['tap', 'Enter'])(
    'aims the axe on the first %s and chops on the second',
    (activation) => {
      reachAxes();
      const before = Number(year());
      const activate = () => {
        if (activation === 'tap') tap('axe');
        else {
          find('[data-action="axe"]').focus();
          click('[data-action="axe"]');
        }
      };
      activate();
      expect(root.querySelector('.tool.axe.aimed')).not.toBeNull();
      expect(find('.choice-caption.axe').textContent).toBe(system.axeLine);
      expect(root.querySelector('.axe-half')).toBeNull();
      vi.advanceTimersByTime(1200);
      expect(Number(year())).toBe(before);
      activate();
      expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
      key(' ');
      expect(Number(year())).toBeGreaterThan(before);
    },
  );

  it('chops immediately when dragging the axe onto the paper', () => {
    reachAxes();
    const before = Number(year());
    const tool = find('[data-action="axe"]');
    pointer(tool, 'pointerdown');
    pointer(tool, 'pointermove', 200, 200);
    pointer(tool, 'pointerup', 300, 250);
    expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
    key(' ');
    expect(Number(year())).toBeGreaterThan(before);
  });

  it('chops into two halves and increases drowsiness', () => {
    reachAxes();
    Object.defineProperties(find('.document'), {
      offsetLeft: { value: 135 },
      offsetTop: { value: 72 },
      offsetWidth: { value: 430 },
      offsetHeight: { value: 510 },
    });
    key('ArrowDown');
    expect(find('.choice-caption.axe').textContent).toBe(system.axeLine);
    expect(root.querySelector('.tool.axe.aimed')).not.toBeNull();
    expect(root.querySelector('.axe-half')).toBeNull();
    expect(
      [...root.querySelectorAll<HTMLElement>('.preview-dot')].every(
        (dot) => dot.hidden,
      ),
    ).toBe(true);
    key('ArrowDown');
    expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
    expect(root.querySelector('.axe-half.left')).not.toBeNull();
    expect(root.querySelector('.axe-half.right')).not.toBeNull();
    root.querySelectorAll<HTMLElement>('.axe-half').forEach((half) => {
      expect(half.style.left).toBe('135px');
      expect(half.style.top).toBe('72px');
      expect(half.style.width).toBe('430px');
      expect(half.style.height).toBe('510px');
    });
    key(' ');
    expect(find('.desk').dataset.drowse).toBe('1');
    expectPips(1, AXE_DECAY_BY_STACK[1]);
    expect(root.querySelector('.axe-half')).toBeNull();
  });

  it('clears an active hold before keyboard confirmation re-renders the DOM', () => {
    pointer(find('[data-action="approve"]'), 'pointerdown');
    key('ArrowRight');
    key(' ');
    expect(year()).toBe('1');
    tap('reject');
    expect(root.querySelector('.aimed.reject')).not.toBeNull();
    vi.advanceTimersByTime(240);
    expect(root.querySelector('.ghost,.lifted')).toBeNull();
  });
});

describe('ghost ownership', () => {
  it('does not return a new ghost from an older action timer', () => {
    playAction(root, 'approve', null, false);
    const next = liftTool(root, 'reject', { x: 20, y: 600 });
    vi.advanceTimersByTime(260 + CONTACT_MS + 120);
    expect(next.classList.contains('returning')).toBe(false);
    expect(find('[data-action="reject"]').classList.contains('lifted')).toBe(
      true,
    );
    expect(find('[data-action="approve"]').classList.contains('lifted')).toBe(
      false,
    );
  });

  it('does not clear a newly lifted tool when its previous return finishes', () => {
    liftTool(root, 'approve', { x: 20, y: 600 });
    dropTool(root);
    const next = liftTool(root, 'approve', { x: 40, y: 600 });
    vi.advanceTimersByTime(240);
    expect(next.isConnected).toBe(true);
    expect(find('[data-action="approve"]').classList.contains('lifted')).toBe(
      true,
    );
  });

  it('resets holds when binding replacement DOM after a timer re-render', () => {
    unmount();
    const input: Input = {
      sceneOpen: false,
      sceneKey: vi.fn(),
      menuOpen: false,
      openMenu: vi.fn(),
      menuKey: vi.fn(),
      busy: false,
      sleep: 0,
      playing: true,
      aim: null,
      setAim: vi.fn(),
      canLift: () => true,
      stamp: vi.fn(),
      autoStamp: vi.fn(),
      skip: vi.fn(),
    };
    const controls = createInput(root, input);
    controls.bind();
    const old = find('[data-action="approve"]');
    pointer(old, 'pointerdown');
    root.innerHTML = root.innerHTML;
    controls.bind();
    pointer(old, 'pointerup', 200, 200);
    expect(input.stamp).not.toHaveBeenCalled();
    expect(root.querySelector('.ghost,.lifted')).toBeNull();
    pointer(find('[data-action="reject"]'), 'pointerdown');
    expect(root.querySelector('.ghost.reject')).not.toBeNull();
    controls.dispose();
    expect(root.querySelector('.ghost,.lifted')).toBeNull();
  });
});

describe('drowsiness pips', () => {
  it('counts down in documents without the axe, then clears the pips', () => {
    reachAxes();
    choose('axe');
    expectPips(1, AXE_DECAY_BY_STACK[1]);
    for (let i = 0; i < AXE_DECAY_BY_STACK[1]; i++) {
      const before = Number(year());
      choose(i % 2 ? 'reject' : 'approve');
      expect(Number(year())).toBeGreaterThan(before);
      const left = AXE_DECAY_BY_STACK[1] - i - 1;
      expectPips(left ? 1 : 0, left);
    }
    expectPips(0, 0);
  });
});

describe('axe scenes', () => {
  const speaki = cards.find(
    (card) =>
      card.kind === 'speaki' &&
      !card.mimic &&
      card.axeResult?.scene === 'speakiCaught',
  ) as Card;
  const showScene = (
    sleep = false,
    action: 'axe' | 'reject' | 'approve' = 'axe',
  ) => {
    unmount();
    const current =
      sleep && action === 'axe' ? { ...speaki, axe: true as const } : speaki;
    vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
      ...initialState(),
      current,
      drowse: sleep
        ? { stack: 2, left: AXE_DECAY_BY_STACK[2] }
        : { stack: 0, left: 0 },
    });
    unmount = mount(root);
    startRun();
    const arrow =
      action === 'axe'
        ? 'ArrowDown'
        : action === 'reject'
          ? 'ArrowLeft'
          : 'ArrowRight';
    key(arrow);
    key(arrow);
    expect(root.querySelector('.scene')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(root.querySelector('.scene')).not.toBeNull();
  };

  it('shows the system scene with its picture over the next card and its own Ner line', () => {
    showScene();
    const scene = system.scenes.speakiCaught;
    expect(find('.desk').lastElementChild).toBe(find('.scene'));
    expect(find('.scene').getAttribute('role')).toBe('dialog');
    expect(find('.scene').getAttribute('aria-modal')).toBe('true');
    expect(find('.scene').getAttribute('aria-labelledby')).toBe('scene-title');
    expect(find('.scene-head').textContent).toBe(scene.header);
    expect(find('#scene-title').textContent).toBe(scene.title);
    expect(find('.scene-next').textContent).toBe(scene.button);
    expect(
      [...root.querySelectorAll('.scene-line')].map((line) => ({
        name: line.querySelector('b')!.textContent,
        text: line.querySelector('span')!.textContent,
      })),
    ).toEqual(scene.lines);
    // the placeholder stays until the picture has loaded
    expect(find('.scene-placeholder').textContent).toBe(scene.title);
    expect(find('.scene-art img').getAttribute('src')).toContain(
      'speaki_caught.webp',
    );
    expect(document.activeElement).toBe(find('.scene-next'));
    expect(root.querySelector('.ner-line')).toBeNull();
  });

  it('escapes scene text and hydrates supplied art', () => {
    const text = '<img src=x onerror="alert(1)">&';
    const originalScene = system.scenes.speakiCaught;
    const originalArt = art.ui.speakiCaught;
    system.scenes.speakiCaught = {
      ...system.scenes.speakiCaught,
      header: text,
      title: text,
      lines: [{ name: text, text }],
      button: text,
    };
    art.ui.speakiCaught = 'ui/scene.webp';
    try {
      showScene();
      for (const selector of [
        '.scene-head',
        '#scene-title',
        '.scene-line b',
        '.scene-line span',
        '.scene-next',
        '.scene-placeholder',
      ]) {
        expect(find(selector).textContent).toBe(text);
        expect(find(selector).querySelector('img')).toBeNull();
      }
      const img = find('.scene-art img') as HTMLImageElement;
      img.dispatchEvent(new Event('load'));
      expect(img.hidden).toBe(false);
      expect(find('.scene-art .art-placeholder').hidden).toBe(true);
    } finally {
      system.scenes.speakiCaught = originalScene;
      art.ui.speakiCaught = originalArt!;
    }
  });

  it.each(['button', ' ', 'Enter', 'Escape'])(
    'dismisses via %s and restores game input and focus',
    (method) => {
      showScene();
      const before = year();
      if (method === 'button') click('.scene-next');
      else key(method);
      expect(root.querySelector('.scene')).toBeNull();
      expect(year()).toBe(before);
      expect(document.activeElement).toBe(find('.menu-button'));
      expect(root.querySelector('[inert]')).toBeNull();
      choose('approve');
      expect(Number(year())).toBe(Number(before) + 1);
    },
  );

  it('blocks keys, tools, background taps and the menu, and traps Tab', () => {
    showScene();
    const before = year();
    for (const arrow of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) {
      key(arrow);
      key(arrow);
    }
    key('a');
    key(' ', true);
    key('Escape', true);
    for (const action of ['approve', 'reject', 'axe'] as const) {
      tap(action);
      click(`[data-action="${action}"]`);
    }
    pointer(find('.document'), 'pointerdown');
    click('.menu-button');
    key('Tab');
    expect(document.activeElement).toBe(find('.scene-next'));
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(find('.scene-next'));
    vi.advanceTimersByTime(5000);
    expect(year()).toBe(before);
    expect(find('.menu').hidden).toBe(true);
    expect(root.querySelector('.ink,.aimed,.ghost')).toBeNull();
    expect(root.querySelector('.scene')).not.toBeNull();
  });

  it.each(['axe', 'reject', 'approve'] as const)(
    'pauses sleep auto-stamping until dismissal after %s',
    (action) => {
      showScene(true, action);
      expect(root.querySelector('.sleeping')).not.toBeNull();
      const before = year();
      key('a');
      pointer(find('.document'), 'pointerdown');
      vi.advanceTimersByTime(5000);
      expect(year()).toBe(before);
      expect(root.querySelector('.erpin-ink')).toBeNull();
      click('.scene-next');
      expect(find('#scene-title').textContent).toBe(system.scenes.asleep.title);
      vi.advanceTimersByTime(5000);
      expect(year()).toBe(before);
      expect(root.querySelector('.erpin-ink')).toBeNull();
      click('.scene-next');
      vi.advanceTimersByTime(1299);
      expect(root.querySelector('.erpin-ink')).toBeNull();
      vi.advanceTimersByTime(1);
      expect(root.querySelector('.erpin-ink')).not.toBeNull();
    },
  );
  it.each(['reject', 'approve'] as const)(
    'shows the system fooled scene with its picture after the %s animation',
    (action) => {
      showScene(false, action);
      const scene = system.scenes.speakiFooled;
      expect(find('.scene-head').textContent).toBe(scene.header);
      expect(find('#scene-title').textContent).toBe(scene.title);
      expect(find('.scene-next').textContent).toBe(scene.button);
      expect(
        [...root.querySelectorAll('.scene-line')].map((line) => ({
          name: line.querySelector('b')!.textContent,
          text: line.querySelector('span')!.textContent,
        })),
      ).toEqual(scene.lines);
      expect(
        find('.scene-art [data-art-slot]').getAttribute('data-art-slot'),
      ).toBe('ui.speakiFooled');
      // the title stands in until the picture has loaded
      expect(find('.scene-placeholder').textContent).toBe(scene.title);
      expect(find('.scene-art img').getAttribute('src')).toContain(
        'speaki_fooled.webp',
      );
      expectPips(1, AXE_DECAY_BY_STACK[1]);
      const before = year();
      vi.advanceTimersByTime(5000);
      expect(year()).toBe(before);
      click('.scene-next');
      expect(root.querySelector('.scene')).toBeNull();
    },
  );
});

describe('in-game menu', () => {
  const item = (action: string) => `[data-menu="${action}"]`;
  const isOpen = () => !find('.menu').hidden;
  const enterSleep = () => {
    reachAxes();
    for (let level = 0; level < 3; level++) {
      choose('axe');
    }
    click('.scene-next');
    expect(root.querySelector('.sleeping')).not.toBeNull();
  };

  it('shows the year in the top bar with no footer and a hidden menu', () => {
    expect(year()).toBe('0');
    expect(root.querySelector('.bottombar')).toBeNull();
    expect(isOpen()).toBe(false);
    expect(find('.menu').parentElement).toBe(find('.desk'));
  });

  it('opens via button or Escape, resumes, and closes via backdrop', () => {
    click('.menu-button');
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(find(item('resume')));
    click(item('resume'));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(find('.menu-button'));
    key('Escape');
    expect(isOpen()).toBe(true);
    click('.menu-panel');
    expect(isOpen()).toBe(true);
    click('.menu');
    expect(isOpen()).toBe(false);
    key('Escape');
    key('Escape');
    expect(isOpen()).toBe(false);
  });

  it('cancels aim before Escape opens the menu', () => {
    key('ArrowRight');
    key('Escape');
    expect(root.querySelector('.aimed')).toBeNull();
    expect(isOpen()).toBe(false);
    key('Escape');
    expect(isOpen()).toBe(true);
  });

  it('restarts from year zero and the first card, preserving saved records', () => {
    const first = find('.document').textContent;
    choose('approve');
    const saved = localStorage.getItem('ner-m1-collection');
    click('.menu-button');
    click(item('restart'));
    expect(find('.menu-main').hidden).toBe(true);
    expect(find('.menu-confirm').hidden).toBe(false);
    expect(find('.menu-confirm .menu-title').textContent).toBe(
      '처음부터 다시 시작할까요?',
    );
    click(item('confirm'));
    expect(year()).toBe('0');
    expect(find('.document').textContent).toBe(first);
    expect(isOpen()).toBe(false);
    expect(localStorage.getItem('ner-m1-collection')).toBe(saved);
  });

  it('returns from confirmation with back or Escape and confirms the title screen', () => {
    click('.menu-button');
    click(item('restart'));
    click(item('back'));
    expect(find('.menu-main').hidden).toBe(false);
    expect(find('.menu-confirm').hidden).toBe(true);
    expect(document.activeElement).toBe(find(item('resume')));
    click(item('title'));
    key('Escape');
    expect(isOpen()).toBe(true);
    expect(find('.menu-main').hidden).toBe(false);
    click(item('title'));
    expect(find('.menu-confirm .menu-title').textContent).toBe(
      '첫 화면으로 나갈까요?',
    );
    const saved = localStorage.getItem('ner-m1-collection');
    click(item('confirm'));
    expect(root.querySelector('.title-stamp')).not.toBeNull();
    expect(localStorage.getItem('ner-m1-collection')).toBe(saved);
  });

  it('ignores game keys, tool input and background taps while open', () => {
    click('.menu-button');
    key('ArrowRight');
    key('ArrowRight');
    key(' ');
    tap('reject');
    click('[data-action="approve"]');
    pointer(find('.document'), 'pointerdown');
    vi.advanceTimersByTime(5000);
    expect(root.querySelector('.ink,.aimed,.ghost')).toBeNull();
    expect(year()).toBe('0');
    expect(isOpen()).toBe(true);
  });

  it('traps Tab in the visible page and allows Enter on a menu button', () => {
    click('.menu-button');
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(find(item('title')));
    key('Tab');
    expect(document.activeElement).toBe(find(item('resume')));
    click(item('restart'));
    key('Tab');
    expect(document.activeElement).toBe(find(item('back')));
    key('Tab');
    expect(document.activeElement).toBe(find(item('confirm')));
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
    });
    window.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  it.each(['approve', 'axe'] as const)(
    'finishes a running %s before opening without processing twice',
    (action) => {
      if (action === 'axe') reachAxes();
      if (action === 'axe') {
        key('ArrowDown');
        key('ArrowDown');
      } else {
        key('ArrowRight');
        key('ArrowRight');
      }
      pointer(find('.menu-button'), 'pointerdown');
      expect(
        root.querySelector(action === 'axe' ? '.axe-half' : '.ink'),
      ).not.toBeNull();
      click('.menu-button');
      const after = year();
      expect(isOpen()).toBe(true);
      expect(root.querySelector('.ink,.axe-half')).toBeNull();
      if (action === 'approve') expect(after).toBe('1');
      vi.advanceTimersByTime(5000);
      expect(year()).toBe(after);
    },
  );

  it('drops a held tool and clears aim when opened', () => {
    const tool = find('[data-action="approve"]');
    pointer(tool, 'pointerdown');
    pointer(find('.menu-button'), 'pointerdown');
    click('.menu-button');
    expect(root.querySelector('.ghost.returning')).not.toBeNull();
    expect(root.querySelector('.aimed')).toBeNull();
    pointer(tool, 'pointerup', 200, 200);
    vi.advanceTimersByTime(240);
    expect(root.querySelector('.ghost,.lifted,.ink')).toBeNull();
    expect(year()).toBe('0');
  });

  it('pauses sleep auto-stamping and resumes with a fresh 1300ms delay', () => {
    enterSleep();
    vi.advanceTimersByTime(1200);
    const before = year();
    pointer(find('.menu-button'), 'pointerdown');
    expect(root.querySelector('.erpin-ink')).toBeNull();
    click('.menu-button');
    key('a');
    key('ArrowRight');
    pointer(find('.document'), 'pointerdown');
    vi.advanceTimersByTime(5000);
    expect(year()).toBe(before);
    expect(root.querySelector('.erpin-ink')).toBeNull();
    click(item('resume'));
    vi.advanceTimersByTime(1299);
    expect(root.querySelector('.erpin-ink')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(root.querySelector('.erpin-ink')).not.toBeNull();
  });

  it('opens with Escape during sleep without auto-stamping', () => {
    enterSleep();
    key('Escape');
    expect(isOpen()).toBe(true);
    expect(root.querySelector('.erpin-ink')).toBeNull();
  });
});

it('preserves icon meters and hides size and direction in dim previews', () => {
  expect(root.querySelectorAll('.resource-icon[role="meter"]')).toHaveLength(4);
  expect(find('.resource-fill').style.clipPath).toBe('inset(50% 0 0)');
  const panel = document.createElement('div');
  panel.innerHTML = gaugesMarkup(initialState());
  updateGaugePreview(
    panel,
    {
      ...(cards.find((card) => card.kind === 'daily') as Card),
      approve: { label: 'test', effects: { sugar: 10 } },
    },
    'approve',
    true,
  );
  const dot = panel.querySelector<HTMLElement>(
    '[data-gauge="sugar"] .preview-dot',
  )!;
  expect(dot.dataset).toMatchObject({ pips: '0' });
  expect(dot.hasAttribute('data-dir')).toBe(false);
  expect(dot.hasAttribute('data-size')).toBe(false);
  expect(dot.querySelector('.pips.unknown')?.textContent).toBe('?');
  expect(dot.getAttribute('aria-label')).not.toMatch(/증가|감소/);
  expect(dot.textContent).toBe('?');
});

it('stacks drowsiness, auto-stamps every sleep turn and wakes with clear pips', () => {
  reachAxes();
  for (let level = 1; level <= 3; level++) {
    choose('axe');
    expect(find('.desk').dataset.drowse).toBe(String(level % 3));
    expectPips((level % 3) as 0 | 1 | 2, decayFor((level % 3) as 0 | 1 | 2));
  }
  expect(root.querySelector('.sleeping')).not.toBeNull();
  expect(find('#scene-title').textContent).toBe(system.scenes.asleep.title);
  click('.scene-next');
  for (let turn = 0; turn < SLEEP_TURNS; turn++) {
    if (turn === 0) {
      vi.advanceTimersByTime(1299);
      expect(root.querySelector('.erpin-ghost')).toBeNull();
      vi.advanceTimersByTime(1);
    } else if (turn === 1) key('a');
    else pointer(find('.document'), 'pointerdown');
    expect(root.querySelector('.erpin-ghost')).not.toBeNull();
    expect(root.querySelector('.erpin-ink.reject')).not.toBeNull();
    key(' ');
  }
  expect(root.querySelector('.sleeping,.erpin-ghost,.erpin-ink')).toBeNull();
  expectPips(0, 0);
  expect(root.querySelector('.ner-line')).toBeNull();
});

it('wakes at 200 and leaves every finale card waiting for a manual stamp', () => {
  unmount();
  const daily: Card = {
    ...(cards as Card[]).find((card) => card.kind === 'daily')!,
    years: 1,
    reject: { label: 'Safe', effects: {} },
    approve: { label: 'Safe', effects: {} },
  };
  vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
    ...initialState(),
    year: END_YEAR - 1,
    current: daily,
    sleep: SLEEP_TURNS,
    drowse: { stack: 2, left: 1 },
  });
  unmount = mount(root);
  startRun();
  expect(root.querySelector('.sleeping')).not.toBeNull();
  vi.advanceTimersByTime(1300);
  key(' ');
  const process = loop.processDocument;
  const resolve = vi
    .spyOn(loop, 'processDocument')
    .mockImplementation((state, action, deck, rng) =>
      process({ ...state, gauges: initialState().gauges }, action, deck, rng),
    );
  const shown: string[] = [];
  for (let turn = 0; turn < 30; turn++) {
    const state = resolve.mock.results.at(-1)?.value as State | undefined;
    if (state?.ending) break;
    const card =
      state?.current ??
      (cards as Card[]).find((c) => c.id === 'story_avalanche')!;
    shown.push(card.id);
    expect(root.textContent).toContain(card.title);
    expect(root.querySelector('.sleeping,.erpin-ghost,.erpin-ink')).toBeNull();
    expect(find('.desk').dataset.drowse).toBe('0');
    const calls = resolve.mock.calls.length;
    vi.advanceTimersByTime(5000);
    click('.menu-button');
    click('[data-menu="resume"]');
    vi.advanceTimersByTime(5000);
    pointer(find('.document'), 'pointerdown');
    expect(resolve).toHaveBeenCalledTimes(calls);
    expect(root.querySelector('.erpin-ghost,.erpin-ink')).toBeNull();
    choose('approve');
    if (root.querySelector('.scene-next') && !root.querySelector('.rewind'))
      click('.scene-next');
  }
  expect(shown).toContain('fixed_chloe_tailor');
  expect(
    shown.filter((id) => (cards as Card[]).find((c) => c.id === id)?.boss),
  ).toHaveLength(10);
  expect((resolve.mock.results.at(-1)!.value as State).ending).toEqual({
    id: 'true',
  });
  expect(root.querySelector('.end-stamp')).not.toBeNull();
});

it.each([
  [false, false, ['purist', 'reformed']],
  [true, false, ['reformed']],
  [false, true, ['purist']],
  [true, true, []],
] as const)(
  'shows true ending before extras (helped=%s, axed=%s) and saves them immediately',
  (helped, axed, extras) => {
    vi.spyOn(loop, 'processDocument').mockImplementationOnce((state) => ({
      ...state,
      year: 200,
      record: { helped, axed },
      ending: { id: 'true' },
    }));
    choose('approve');
    expect(find('.ending-paper h1').textContent).toBe(system.trueEnding.title);
    expect(
      JSON.parse(localStorage.getItem('ner-m1-collection')!).endings,
    ).toEqual(['true', ...extras]);
    for (const id of extras) {
      expect(find('.return').textContent).toBe(system.extraEndings.next);
      expect(document.activeElement).toBe(find('.return'));
      click('.return');
      expect(find('.ending-paper h1').textContent).toBe(
        system.extraEndings.items[id].title,
      );
      expect(find('.ending-mode').textContent).toBe(
        system.modes.priest.endingLine,
      );
      expect(find('.ending-paper').textContent).toContain('200');
    }
    expect(find('.return').textContent).toBe('타이틀로 돌아가기');
    expect(document.activeElement).toBe(find('.return'));
    click('.return');
    expect(root.querySelector('.title-screen')).not.toBeNull();
  },
);

it('records an ending and shows records and legal notice on returning to the title', () => {
  for (let i = 0; i < 200 && root.querySelector('.desk'); i++) choose('reject');
  expect(find('.end-stamp').textContent?.trim()).toBe('통치 종료');
  click('.return');
  expect(find('.album-open .album-progress').textContent).toBe('1 / 12');
  expect(find('.legal').textContent).toBe(system.notice);
  expect(find('.legal-note p').textContent).toBe(system.notice);
  const stored = JSON.parse(localStorage.getItem('ner-m1-collection')!);
  expect(stored.bestYear.priest).toBeGreaterThan(0);
  expect(stored.endings).toHaveLength(1);
});

describe('boon UI', () => {
  it('shows stitch as a one-time boon and hides it when absent', () => {
    showState({ boons: { stitch: true } });
    const boon = find('[data-boon="stitch"]');
    expect(boon.className).toBe('status-icon');
    expect(boon.textContent).toBe('');
    expect(boon.dataset.tipTitle).toBe(system.boons.stitch.name);
    expect(boon.dataset.tipText).toBe(system.boons.stitch.desc);
    expect(boon.querySelector('small')).toBeNull();
    showState({ boons: {} });
    expect(root.querySelector('[data-boon="stitch"]')).toBeNull();
  });

  const daily = (cards as Card[]).find((c) => c.kind === 'daily')!;
  const showState = (patch: Partial<State>) => {
    unmount();
    vi.spyOn(deck, 'nextDocument').mockReturnValueOnce({
      ...initialState(),
      current: daily,
      ...patch,
    });
    unmount = mount(root);
    startRun();
  };
  it.each(['stitch', 'erpinSave'] as const)(
    'renders the %s rescue with art and resumes sleep after dismissal',
    (scene) => {
      const content = system.scenes[scene];
      const current: Card = {
        ...daily,
        reject: { label: 'Reject', effects: {} },
        approve: { label: 'Approve', effects: {} },
      };
      showState({ current, sleep: 2, scene });
      expect(find('#scene-title').textContent).toBe(content.title);
      expect(find('.scene-next').textContent).toBe(content.button);
      expect(find('.scene-art img').getAttribute('src')).toContain(
        `art/${art.ui[content.art]}`,
      );
      expect(find('.scene-placeholder').textContent).toBe(content.title);
      expect(find('.scene-art .art-placeholder').hidden).toBe(false);
      const resolve = vi.spyOn(loop, 'processDocument');
      vi.advanceTimersByTime(5000);
      expect(resolve).not.toHaveBeenCalled();
      click('.scene-next');
      expect(root.querySelector('.scene')).toBeNull();
      vi.advanceTimersByTime(1299);
      expect(root.querySelector('.erpin-ink')).toBeNull();
      vi.advanceTimersByTime(1);
      expect(root.querySelector('.erpin-ink')).not.toBeNull();
      key(' ');
      expect(resolve).toHaveBeenCalledTimes(1);
      expect((resolve.mock.results[0]!.value as State).sleep).toBe(1);
    },
  );
  it('aims scope by drag and spends it on a stamp', () => {
    showState({ boons: { scope: 2 } });
    // the count lives in the top bar chip, not on the tool
    expect(root.querySelector('.tool.scope .tool-count')).toBeNull();
    expect(find('[data-boon="scope"]').textContent).toContain('2');
    const tool = find('.tool.scope');
    pointer(tool, 'pointerdown');
    pointer(tool, 'pointermove', 200, 200);
    pointer(tool, 'pointerup', 200, 200);
    expect(root.querySelector('.scope-reticle')).toBeTruthy();
    key('ArrowRight'); key('ArrowRight');
    vi.advanceTimersByTime(1500);
    expect(root.querySelector('.scope-reticle')).toBeNull();
    expect(find('[data-boon="scope"]').textContent).toContain('1');
  });
  it('shows bullet short name and remaining shots, hiding empty charges', () => {
    for (let bullet = BULLET_CHARGES; bullet > 0; bullet--) {
      showState({ boons: { bullet } });
      const boon = find('[data-boon="bullet"]');
      expect(boon.textContent).toBe(String(bullet));
      expect(boon.querySelector('b')!.textContent).toBe(String(bullet));
      expect(boon.dataset.tipTitle).toBe(system.boons.bullet.name);
      expect(boon.dataset.tipText).toBe(system.boons.bullet.desc);
    }
    for (const boons of [{ bullet: 0 }, {}]) {
      showState({ boons });
      expect(root.querySelector('[data-boon="bullet"]')).toBeNull();
      expect(root.querySelector('.tool.bullet')).toBeNull();
    }
  });
  it('aims a bullet with up and fires on the second press while r and R confirm Alice', () => {
    showState({ boons: { bullet: 2, alice: true } });
    const resolve = vi.spyOn(loop, 'processDocument');
    key('ArrowUp');
    expect(find('.tool.bullet').classList.contains('aimed')).toBe(true);
    expect(root.querySelector('.preview-dot:not([hidden])')).toBeNull();
    expect(root.querySelector('.shot-shard')).toBeNull();
    key('ArrowUp', true);
    expect(root.querySelector('.shot-shard')).toBeNull();
    key('ArrowUp');
    expect(root.querySelector('.shot-trail')).not.toBeNull();
    expect(root.querySelector('.shot-flash')).not.toBeNull();
    key(' ');
    expect(resolve).toHaveBeenCalledWith(
      expect.anything(),
      'bullet',
      expect.anything(),
      expect.anything(),
    );
    expect((resolve.mock.results[0]!.value as State).boons.bullet).toBe(1);
    showState({ boons: { alice: true, bullet: 1 } });
    key('r');
    expect(find('.choice-caption.alice').textContent).toBe(system.aliceLine);
    key('R');
    expect(find('.document').classList.contains('processed-alice')).toBe(true);
  });
  it('drags the bullet anywhere on the paper and hesitates on a forbidden card', () => {
    showState({ boons: { bullet: 1 } });
    const button = find('.tool.bullet');
    pointer(button, 'pointerdown');
    expect(root.querySelector('.ghost.bullet .bullet-face')).not.toBeNull();
    pointer(button, 'pointermove', 110, 110);
    pointer(button, 'pointerup', 110, 110);
    expect(root.querySelector('.shot-trail')).not.toBeNull();
    expect(find('.ghost.bullet').style.left).toBe('300px');
    key(' ');
    showState({ boons: { bullet: 1 }, current: { ...daily, axe: false } });
    expect(find('.tool.bullet').getAttribute('aria-disabled')).toBe('true');
    key('ArrowUp');
    expect(find('.tool.bullet').classList.contains('hesitating')).toBe(true);
    expect(root.querySelector('.shot-shard')).toBeNull();
  });
  it.each([
    ['reject', 0],
    ['approve', 0],
    ['reject', 1],
    ['approve', 1],
  ] as const)(
    'keeps forged %s gauges and flags unchanged with sleep %i',
    (action, sleep) => {
      const fake: Card = {
        ...(cards as Card[]).find((card) => card.axe === 'free')!,
        [action]: {
          label: 'test',
          effects: { sugar: -100, people: 100, faith: -100, erpin: 100 },
          setFlags: ['fake-choice'],
        },
      };
      const before = initialState().gauges;
      showState({
        current: fake,
        seen: [fake.id],
        sleep,
        boons: { hyean: { left: 5 }, rewind: true },
      });
      const resolve = vi.spyOn(loop, 'processDocument');
      const animate = vi.spyOn(gauges, 'animateGauges');
      vi.mocked(Math.random).mockReturnValue(action === 'reject' ? 0 : 0.99);
      if (sleep) {
        vi.advanceTimersByTime(1300);
        expect(root.querySelector(`.erpin-ink.${action}`)).not.toBeNull();
      } else {
        const arrow = action === 'reject' ? 'ArrowLeft' : 'ArrowRight';
        key(arrow);
        expect(find('.choice-caption').textContent).toBe(fake[action].label);
        for (const [gauge, delta] of Object.entries(fake[action].effects)) {
          const dot = find(`[data-gauge="${gauge}"] .preview-dot`);
          expect(dot.hidden).toBe(false);
          expect(dot.dataset.size).toBe(
            String(Math.abs(delta) <= 5 ? 5 : Math.abs(delta) <= 10 ? 10 : 20),
          );
          expect(dot.dataset.dir).toBe(delta > 0 ? 'up' : 'down');
          expect(dot.classList.contains('exact')).toBe(true);
          expect(dot.textContent).toBe(
            `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
          );
        }
        key(arrow);
      }
      key(' ');
      expect(resolve).toHaveBeenCalledTimes(1);
      const after = resolve.mock.results[0]!.value as State;
      expect(after.gauges).toEqual(before);
      expect(after.flags).toEqual([]);
      expect(after.flagYears).toEqual({});
      expect(after.seen).toContain(fake.id);
      expect(after.year).toBe(1);
      expect(after.sleep).toBe(0);
      expect(after.scene).toBe(sleep ? null : 'speakiFooled');
      expect(after.ending).toBeNull();
      expectPips(sleep ? 0 : 1, sleep ? 0 : AXE_DECAY_BY_STACK[1]);
      expect(animate).not.toHaveBeenCalled();
      expect(
        root.querySelector('.gauge.gain,.gauge.loss,.rewind,.ending-screen'),
      ).toBeNull();
      for (const [gauge, value] of Object.entries(before)) {
        expect(
          find(`[data-gauge="${gauge}"] [role="meter"]`).getAttribute(
            'aria-valuenow',
          ),
        ).toBe(String(value));
      }
    },
  );
  it('shows exact gauges, signed dots and boon names even at drowse stack two', () => {
    showState({
      year: 50,
      boons: { hyean: { left: 5 }, rewind: true, alice: true },
      drowse: { stack: 2, left: 4 },
    });
    expect(find('.desk').classList.contains('boon-hyean')).toBe(true);
    expect(
      [...root.querySelectorAll('.gauge-value')].map((el) => el.textContent),
    ).toEqual(['50', '50', '50', '50']);
    expect(root.querySelectorAll('.status-icon')).toHaveLength(3);
    expect(find('[data-boon="hyean"] b').textContent).toBe('5');
    expect(find('[data-boon="alice"]').dataset.tipTitle).toBe(
      system.boons.alice.name,
    );
    key('ArrowRight');
    for (const [gauge, delta] of Object.entries(
      loop.choiceEffects(daily.approve, initialState().gauges, daily.kind, 50),
    )) {
      const dot = find(`[data-gauge="${gauge}"] .preview-dot`);
      expect(dot.classList.contains('exact')).toBe(true);
      expect(dot.textContent).toBe(
        `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
      );
      expect(dot.dataset.dir).toBe(delta > 0 ? 'up' : 'down');
    }
    showState({ year: 55, boons: { hyean: { left: 0 } } });
    expect(root.querySelector('.gauge-value')).toBeNull();
    expect(find('.status-tray').children).toHaveLength(0);
  });
  it('records the fatal document year 197 on the ending screen and in the collection', () => {
    const fatal: Card = {
      ...daily,
      years: 3,
      approve: { label: 'x', effects: { sugar: -100 } },
    };
    showState({ current: fatal, year: 197, bestYear: 197 });
    const resolve = vi.spyOn(loop, 'processDocument');
    choose('approve');
    const death = resolve.mock.results.at(-1)!.value as State;
    expect(death.year).toBe(197);
    expect(death.bestYear).toBe(197);
    expect(find('.ending-paper').textContent).toContain(
      '에르피엔력 197년 · 최장 재임 (사제장) 197년',
    );
    expect(
      JSON.parse(localStorage.getItem('ner-m1-collection')!).bestYear.priest,
    ).toBe(197);
  });

  it.each(['yes', 'no'])(
    'shows the rewind prompt and handles %s without recording an ending prematurely',
    async (answer) => {
      const { past: _past, ...snapshot } = {
        ...initialState(),
        year: 181,
        current: daily,
        gauges: { sugar: 35, people: 65, faith: 45, erpin: 55 },
        boons: { rewind: true as const, stitch: true as const },
      };
      const failing: Card = {
        ...daily,
        years: 1,
        approve: { label: 'x', effects: { sugar: -10 } },
      };
      showState({
        current: failing,
        past: [snapshot],
        year: 186,
        gauges: { ...initialState().gauges, sugar: 5 },
        boons: { rewind: true },
      });
      const desk = find('.desk');
      const animate = vi.spyOn(gauges, 'animateGauges');
      choose('approve');
      expect(find('.desk')).toBe(desk);
      expect(find('.document').classList.contains('processed-approve')).toBe(
        true,
      );
      expect(find('.stage').hasAttribute('inert')).toBe(true);
      expect(animate).toHaveBeenLastCalledWith(
        root,
        expect.anything(),
        expect.objectContaining({ sugar: 0 }),
      );
      expect(find('[data-rewind="yes"]').textContent).toBe(
        system.rewindPrompt.yes,
      );
      expect(find('[data-rewind="no"]').textContent).toBe(
        system.rewindPrompt.no,
      );
      key('Tab');
      expect(document.activeElement).toBe(find('[data-rewind="no"]'));
      key('Tab');
      expect(document.activeElement).toBe(find('[data-rewind="yes"]'));
      expect(find('.rewind').getAttribute('role')).toBe('dialog');
      expect(find('#scene-title').textContent).toBe(system.rewindPrompt.title);
      const sceneArt = find('.rewind .scene-art');
      expect(sceneArt.previousElementSibling).toBe(find('.rewind .scene-head'));
      expect(sceneArt.nextElementSibling).toBe(find('#scene-title'));
      const img = find('.rewind .scene-art img') as HTMLImageElement;
      expect(img.getAttribute('src')).toContain('art/ui/linua_rewind.webp');
      img.dispatchEvent(new Event('load'));
      expect(img.hidden).toBe(false);
      expect(find('.rewind .art-placeholder').hidden).toBe(true);
      expect(find('.scene-line span').textContent).toBe(
        system.rewindPrompt.lines[0]!.text,
      );
      expect(root.querySelector('.ending-screen')).toBeNull();
      expect(
        JSON.parse(localStorage.getItem('ner-m1-collection')!).endings,
      ).toEqual([]);
      click(`[data-rewind="${answer}"]`);
      const saved = JSON.parse(localStorage.getItem('ner-m1-collection')!);
      expect(saved.bestYear).toEqual({ apprentice: 0, priest: 186, bishop: 0 });
      if (answer === 'yes') {
        expect(document.querySelector('.rewind-fx')).not.toBeNull();
        expect(
          document.querySelector('.rewind-fx')!.getAttribute('aria-label'),
        ).toBe('186년에서 181년으로 되돌아갑니다');
        expect(root.hasAttribute('inert')).toBe(true);
        click('[data-rewind="no"]');
        expect(root.querySelector('.ending-screen')).toBeNull();
        document.querySelector<HTMLElement>('.rewind-fx')!.click();
        await Promise.resolve();
        expect(document.querySelector('.rewind-fx')).toBeNull();
        expect(root.hasAttribute('inert')).toBe(false);
        expect(year()).toBe('181');
        expect(find('.document h1').textContent).toBe(daily.title);
        expect(find('[data-boon="stitch"]')).not.toBeNull();
        expect(document.activeElement).toBe(find('.menu-button'));
        expect(root.querySelector('[data-boon="rewind"]')).toBeNull();
        expect(saved.endings).toEqual([]);
      } else {
        expect(root.querySelector('.ending-screen')).not.toBeNull();
        expect(saved.endings).toEqual(['sugar_low']);
      }
    },
  );
  // slide the paper sideways past the wildcard threshold and let go
  const slide = (dx = 120) => {
    const paper = find('.document');
    pointer(paper, 'pointerdown', 200, 300);
    pointer(paper, 'pointermove', 200 + dx / 2, 300);
    pointer(paper, 'pointermove', 200 + dx, 300);
    pointer(paper, 'pointerup', 200 + dx, 300);
  };
  it('aims Alice with r, cancels with other arrows, confirms and consumes without time passing', () => {
    showState({ year: 50, boons: { alice: true } });
    const card = find('.paper-alice');
    expect(card.parentElement).toBe(find('.document'));
    expect(card.classList.contains('tool')).toBe(false);
    expect(card.classList.contains('spent')).toBe(false);
    expect(root.querySelector('.axe-pair .tool.alice')).toBeNull();
    key('r');
    expect(find('.choice-caption.alice').textContent).toBe(system.aliceLine);
    expect(find('.document').classList.contains('wild-hold')).toBe(true);
    key('ArrowLeft');
    expect(find('.choice-caption').textContent).toBe('');
    key('r');
    key('Escape');
    expect(find('.choice-caption').textContent).toBe('');
    key('r');
    key('r');
    expect(find('.document').classList.contains('processed-alice')).toBe(true);
    key(' ');
    expect(year()).toBe('50');
    expect(root.querySelector('.paper-alice')).toBeNull();
    expect(find('.document h1').textContent).not.toBe(daily.title);
  });
  it('renders the wildcard only while Alice is held, never in preview markup', () => {
    showState({ boons: {} });
    expect(root.querySelector('.paper-alice')).toBeNull();
    expect(documentMarkup(daily)).not.toContain('paper-alice');
    showState({ boons: { alice: true } });
    expect(root.querySelectorAll('.paper-alice')).toHaveLength(1);
  });
  it('swaps when the paper is held and slid sideways', () => {
    showState({ year: 50, boons: { alice: true } });
    const paper = find('.document');
    pointer(paper, 'pointerdown', 200, 300);
    expect(paper.classList.contains('wild-hold')).toBe(true);
    expect(find('.choice-caption.alice').textContent).toBe(system.aliceLine);
    pointer(paper, 'pointermove', 320, 300);
    expect(paper.classList.contains('wild-ready')).toBe(true);
    pointer(paper, 'pointerup', 320, 300);
    expect(paper.classList.contains('processed-alice')).toBe(true);
    expect(root.querySelector('.ghost,.ink')).toBeNull();
    vi.advanceTimersByTime(500);
    expect(year()).toBe('50');
    expect(root.querySelector('.paper-alice')).toBeNull();
    expect(find('.document').classList.contains('wild-arrive')).toBe(true);
    expect(find('.document h1').textContent).not.toBe(daily.title);
  });
  it.each([
    'ArrowLeft',
    'ArrowRight',
    'ArrowDown',
    'Escape',
    'paper',
    'background',
  ])('cancels Alice aim with %s', (cancel) => {
    showState({ boons: { alice: true } });
    key('r');
    if (cancel === 'paper') {
      pointer(find('.document'), 'pointerdown');
      pointer(find('.document'), 'pointerup');
    } else if (cancel === 'background') pointer(find('.desk'), 'pointerdown');
    else key(cancel);
    expect(root.querySelector('.aimed,.processed-alice,.wild-hold')).toBeNull();
    expect(find('.choice-caption').textContent).toBe('');
  });
  it('keeps the document when the slide stops short', () => {
    showState({ year: 9, boons: { alice: true } });
    slide(50);
    expect(root.querySelector('.processed-alice,.wild-hold')).toBeNull();
    vi.advanceTimersByTime(500);
    expect(find('.document h1').textContent).toBe(daily.title);
    expect(root.querySelector('.paper-alice')).not.toBeNull();
  });
  it('keeps Alice out of axe halves', () => {
    showState({ year: 9, boons: { alice: true } });
    key('ArrowDown');
    key('ArrowDown');
    expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
    expect(root.querySelector('.axe-half .paper-alice')).toBeNull();
    expect(root.querySelectorAll('.paper-alice')).toHaveLength(1);
  });
  it('finishes the Alice swap after two spaced r presses without skipping the animation', async () => {
    const current = (cards as Card[]).find(
      (card) => card.id === 'daily_kyarot_cane',
    )!;
    showState({ current, year: 9, boons: { alice: true } });
    vi.useRealTimers();
    key('r');
    expect(find('.choice-caption.alice').textContent).toBe(system.aliceLine);
    await new Promise((resolve) => setTimeout(resolve, 200));
    key('r');
    expect(root.querySelector('.processed-alice')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(find('.document h1').textContent).not.toBe(current.title);
    expect(root.querySelector('[data-boon="alice"]')).toBeNull();
    expect(root.querySelector('.paper-alice')).toBeNull();
    expect(year()).toBe('9');
    key('ArrowRight');
    expect(find('[data-action="approve"]').classList.contains('aimed')).toBe(
      true,
    );
  });
  it('finishes a slide swap using its 500 ms animation timer', () => {
    showState({ year: 9, boons: { alice: true } });
    slide();
    vi.advanceTimersByTime(500);
    expect(find('.document h1').textContent).not.toBe(daily.title);
    expect(root.querySelector('[data-boon="alice"]')).toBeNull();
    expect(year()).toBe('9');
  });
  it.each(['keyboard', 'slide'])(
    'hesitates via %s when no replacement daily exists and keeps the charge',
    (mode) => {
      vi.spyOn(deck, 'canRerollDaily').mockReturnValue(false);
      showState({ year: 9, boons: { alice: true } });
      expect(find('.paper-alice').classList.contains('spent')).toBe(true);
      if (mode === 'keyboard') {
        key('r');
        expect(find('.paper-alice').classList.contains('hesitating')).toBe(true);
      } else {
        slide();
        expect(root.querySelector('.wild-hold')).toBeNull();
      }
      expect(root.querySelector('.processed-alice')).toBeNull();
      vi.advanceTimersByTime(1200);
      expect(find('.document h1').textContent).toBe(daily.title);
      expect(root.querySelector('[data-boon="alice"]')).not.toBeNull();
      expect(year()).toBe('9');
    },
  );
  it.each(['story', 'fixed', 'special'] as const)(
    'hesitates on %s and keeps the charge',
    (kind) => {
      showState({ current: { ...daily, kind }, boons: { alice: true } });
      expect(find('.paper-alice').classList.contains('spent')).toBe(true);
      key('r');
      expect(find('.paper-alice').classList.contains('hesitating')).toBe(true);
      expect(find('.choice-caption').textContent).toBe('');
      expect(root.querySelector('.processed-alice')).toBeNull();
      slide();
      expect(root.querySelector('.processed-alice,.wild-hold')).toBeNull();
    },
  );
});

describe('contact sounds', () => {
  it.each(['approve', 'reject', 'axe'] as const)(
    'plays %s once at contact for keyboard, focused button, tap and drag',
    (action) => {
      const card = (cards as Card[]).find(
        (c) => c.kind === 'daily' && c.axe !== false,
      )!;
      const play = vi.spyOn(sound, 'playSound');
      for (const path of ['keyboard', 'button', 'tap', 'drag']) {
        showCard(card);
        play.mockClear();
        const selector = `[data-action="${action}"]`;
        if (path === 'keyboard') {
          const arrow =
            action === 'axe'
              ? 'ArrowDown'
              : action === 'reject'
                ? 'ArrowLeft'
                : 'ArrowRight';
          key(arrow);
          expect(play).not.toHaveBeenCalled();
          key(arrow);
        } else if (path === 'button') {
          click(selector);
          expect(play).not.toHaveBeenCalled();
          click(selector);
        } else if (path === 'tap') {
          tap(action);
          expect(play).not.toHaveBeenCalled();
          tap(action);
        } else {
          pointer(find(selector), 'pointerdown');
          pointer(find(selector), 'pointermove', 200, 200);
          pointer(find(selector), 'pointerup', 200, 200);
        }
        const contact = CONTACT_MS + (path === 'drag' ? 0 : 260);
        vi.advanceTimersByTime(contact - 1);
        expect(play).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(play).toHaveBeenCalledExactlyOnceWith(
          action === 'axe' ? 'axe' : 'stamp',
        );
        key(' ');
        vi.advanceTimersByTime(1200);
        expect(
          play.mock.calls.filter(
            ([name]) => name === 'stamp' || name === 'axe',
          ),
        ).toHaveLength(1);
      }
    },
  );

  it('silences skipped strikes before contact and removed animations', () => {
    const play = vi.spyOn(sound, 'playSound');
    key('ArrowRight');
    key('ArrowRight');
    key(' ');
    vi.advanceTimersByTime(1200);
    expect(
      play.mock.calls.filter(([name]) => name === 'stamp' || name === 'axe'),
    ).toHaveLength(0);
    key('ArrowLeft');
    key('ArrowLeft');
    unmount();
    root.replaceChildren();
    vi.advanceTimersByTime(1200);
    expect(
      play.mock.calls.filter(([name]) => name === 'stamp' || name === 'axe'),
    ).toHaveLength(0);
  });

  it('does not sound for hesitation, cancelled aim or Alice reroll', () => {
    const play = vi.spyOn(sound, 'playSound');
    key('ArrowDown');
    key('ArrowRight');
    key('Escape');
    pointer(find('[data-action="approve"]'), 'pointerdown');
    pointer(find('[data-action="approve"]'), 'pointercancel', 600, 600);
    playAction(root, 'alice', null, false);
    vi.advanceTimersByTime(1200);
    expect(play).not.toHaveBeenCalled();
  });

  it('sounds at contact for story cards and all sleep activation paths', () => {
    const play = vi.spyOn(sound, 'playSound');
    key('ArrowLeft');
    key('ArrowLeft');
    vi.advanceTimersByTime(260 + CONTACT_MS);
    expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
    key(' ');
    reachAxes();
    for (let level = 0; level < 3; level++) choose('axe');
    click('.scene-next');
    for (const path of ['timer', 'keyboard', 'pointer']) {
      play.mockClear();
      if (path === 'timer') vi.advanceTimersByTime(1300);
      else if (path === 'keyboard') key('a');
      else pointer(find('.document'), 'pointerdown');
      vi.advanceTimersByTime(260 + CONTACT_MS - 1);
      expect(play).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(play).toHaveBeenCalledExactlyOnceWith('stamp');
      key(' ');
    }
  });

  it('unlocks on title pointerdown and any keydown', () => {
    unmount();
    const unlock = vi.spyOn(sound, 'unlockAudio');
    unmount = mount(root);
    pointer(find('.title-stamp'), 'pointerdown');
    expect(unlock).toHaveBeenCalledTimes(1);
    key('Enter');
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('keeps sound settings in options instead of the game menu', () => {
    click('.menu-button');
    expect(root.querySelector('[data-menu="sound"]')).toBeNull();
    expect(
      [...root.querySelectorAll<HTMLElement>('.menu-main .menu-item')].map(
        (b) => b.dataset.menu,
      ),
    ).toEqual(['resume', 'options', 'restart', 'title']);
    expect(find('.menu-main .menu-title').textContent).toBe('잠시 마카롱 타임');
    expect(find('[data-menu="resume"]').textContent).toBe('계속하기');
  });
});
