// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../data/cards/m1.json';
import system from '../data/system.json';
import { initialState, type Card, type State } from '../src/core/state';
import { processDocument } from '../src/core/loop';
import { validateCards } from '../tools/validate-cards';
import { classifyDeath, playerAction } from '../tools/simulate';
import { toolsMarkup } from '../src/ui/tools';
import { documentMarkup } from '../src/ui/document';
import { boonsMarkup } from '../src/ui/app';
import { dropTool, liftTool, playAction } from '../src/ui/fx';
import { updateAimPreview } from '../src/ui/aim';
import { playSound } from '../src/ui/sound';
import { cardFeatures } from '../src/editor/features';
vi.mock('../src/ui/sound', () => ({ playSound: vi.fn() }));

const cards = raw as Card[];
const target = cards.find((c) => c.id === 'fixed_elena_development')!;
const quiet: Card = {
  ...cards.find((c) => c.kind === 'daily')!,
  id: 'quiet',
  conditions: undefined,
  years: 1,
  reject: { label: 'x', effects: {} },
  approve: { label: 'x', effects: {} },
};
const ready = (bullet = 1): State => ({
  ...initialState(),
  current: target,
  seen: [target.id],
  boons: { bullet },
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('bullet targets', () => {
  it.each([true, 'free', 'bullet'] as const)(
    'spends a shot on axe=%s and applies the axe result',
    (axe) => {
      const before = {
        ...ready(2),
        current: {
          ...quiet,
          axe,
          axeResult: { setFlags: ['caught'], scene: 'speakiCaught' },
        },
      };
      const after = processDocument(before, 'bullet', [quiet], () => 0.5);
      expect(after.boons.bullet).toBe(1);
      expect(before.boons.bullet).toBe(2);
      expect(after.drowse.stack).toBe(0);
      expect(after.flags).toContain('caught');
      expect(after.scene).toBe('speakiCaught');
      expect(after.gauges).toEqual(before.gauges);
    },
  );
  it('spends a charge catching a real Speaki', () => {
    const current = cards.find((c) => c.kind === 'speaki')!;
    const after = processDocument(
      { ...ready(), current },
      'bullet',
      [quiet],
      () => 0.5,
    );
    expect(after.boons.bullet).toBeUndefined();
    expect(after.scene).toBe('speakiCaught');
    expect(after.drowse.stack).toBe(0);
  });
  it.each([0, 1, 2] as const)(
    'axe raises drowse without spending a charge at stack %s',
    (stack) => {
      const before = {
        ...ready(2),
        current: quiet,
        drowse: { stack, left: stack ? 4 : 0 },
      };
      const after = processDocument(before, 'axe', [quiet], () => 0.5);
      expect(after.boons.bullet).toBe(2);
      expect(after.drowse.stack).toBe(stack === 2 ? 0 : stack + 1);
      expect(after.sleep > 0).toBe(stack === 2);
      const locked = { ...before, current: target };
      expect(processDocument(locked, 'axe', [quiet], () => 0.5)).toBe(locked);
    },
  );
  it('rejects shots on forbidden cards', () => {
    const before = { ...ready(), current: { ...quiet, axe: false as const } };
    expect(processDocument(before, 'bullet', [quiet], () => 0.5)).toBe(before);
  });
  it('careful policy chooses the axe first, then a bullet at high drowse', () => {
    const current = {
      ...quiet,
      reject: { label: 'x', effects: { sugar: -50 } },
      approve: { label: 'x', effects: { sugar: -50 } },
    };
    const state = { ...ready(), current };
    expect(playerAction(state, 'careful', () => 0.5)).toBe('axe');
    expect(
      playerAction(
        { ...state, drowse: { stack: 2, left: 4 } },
        'careful',
        () => 0.5,
      ),
    ).toBe('bullet');
    const forbidden = {
      ...state,
      current: { ...current, axe: false as const },
    };
    expect(classifyDeath(forbidden)).toBe('unavoidable');
    expect(
      processDocument(forbidden, 'approve', [quiet], () => 0.5).ending?.cause,
    ).toBe('sugar_low');
  });
  it('spends a charge and consumes the card without effects, flags, grants, schedule or drowse', () => {
    const before = ready(2);
    before.current = {
      ...target,
      approve: {
        label: 'x',
        effects: { sugar: -50 },
        setFlags: ['bad'],
        grant: { boon: 'stitch' },
        schedule: { card: 'bad', years: 1 },
      },
      axeResult: { setFlags: ['caught'], scene: 'speakiCaught' },
    };
    const after = processDocument(before, 'bullet', [quiet], () => 0.5);
    expect(after.boons).toEqual({ bullet: 1 });
    expect(after.gauges).toEqual(before.gauges);
    expect(after.flags).toEqual([...before.flags, 'caught']);
    expect(after.relations).toEqual(before.relations);
    expect(after.scheduled).toEqual(before.scheduled);
    expect(after.drowse).toEqual(before.drowse);
    expect(after.scene).toBe('speakiCaught');
    expect(after.seen).toContain(target.id);
    expect(after.current?.id).toBe('quiet');
  });
  it.each([0, 1])('rejects unavailable shots (sleep %s)', (sleep) => {
    const state = { ...ready(sleep ? 1 : 0), sleep };
    expect(processDocument(state, 'bullet', [quiet], () => 0.5)).toBe(state);
  });
  it('removes the last charge', () => {
    expect(
      processDocument(ready(), 'bullet', [quiet], () => 0.5).boons.bullet,
    ).toBeUndefined();
  });
  const lethal: Card = {
    ...target,
    reject: { label: 'x', effects: { sugar: -50 } },
    approve: { label: 'x', effects: { sugar: -50 } },
  };
  it.each([0, 1])(
    'lethal stamps end the game regardless of available charges (%s)',
    (bullet) => {
      const state = { ...ready(bullet), current: lethal };
      const after = processDocument(state, 'approve', [quiet], () => 0.5);
      expect(after.ending?.cause).toBe('sugar_low');
      expect(classifyDeath(state)).toBe(bullet ? 'avoidable' : 'unavoidable');
      expect(playerAction(state, 'careful', () => 0.5)).toBe(
        bullet ? 'bullet' : 'reject',
      );
    },
  );
  it('marks exactly the hard fixed cards as bullet targets', () => {
    expect(
      cards
        .filter((c) => c.axe === 'bullet')
        .map((c) => c.id)
        .sort(),
    ).toEqual([
      'fixed_amelia_audit',
      'fixed_amelia_registry',
      'fixed_amelia_snack_audit',
      'fixed_elena_development',
      'fixed_elena_palace_garden',
      'fixed_elena_sugar_advance',
      'fixed_rohne_culture_night',
      'fixed_rohne_embassy_dinner',
      'fixed_rohne_visit',
      'special_fricle_pikora',
    ]);
  });
  it('validates fixed bullet targets', () =>
    expect(validateCards([target])).toEqual([]));
  it.each(['daily', 'story', 'special', 'speaki'] as const)(
    'rejects bullet on %s',
    (kind) => {
      expect(validateCards([{ ...target, kind }])).toContain(
        '[0] bullet axe is only allowed on fixed cards',
      );
    },
  );
  it('adds the editor feature badge', () => {
    expect(cardFeatures(target, cards)).toContainEqual(
      expect.objectContaining({ kind: 'bullet', icon: '⦿' }),
    );
  });
});

describe('separate tools and shots', () => {
  it.each([quiet, { ...quiet, kind: 'speaki' as const, axe: 'free' as const }])(
    'shows a separate bullet tool on $kind cards',
    (card) => {
      const root = document.createElement('div');
      root.innerHTML = toolsMarkup(card, initialState().drowse, true);
      expect(root.querySelector('.bullet .bullet-face')).not.toBeNull();
      expect(root.querySelector('.bullet')?.getAttribute('aria-label')).toBe(
        '마탄 사격',
      );
      expect(root.querySelector('.bullet .tool-name')?.textContent).toBe(
        '마탄',
      );
    },
  );
  it.each([false, true])('gates the target tool when armed=%s', (armed) => {
    const root = document.createElement('div');
    root.innerHTML = toolsMarkup(target, initialState().drowse, armed);
    expect(root.querySelector('.axe')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(Boolean(root.querySelector('.tool.bullet'))).toBe(armed);
    if (armed)
      expect(
        root.querySelector('.tool.bullet')?.getAttribute('aria-disabled'),
      ).toBe('false');
  });
  it.each([false, true, 'free', 'bullet'] as const)(
    'disables bullet only for forbidden cards or sleep (%s)',
    (axe) => {
      const root = document.createElement('div');
      root.innerHTML = toolsMarkup(
        { ...quiet, axe },
        initialState().drowse,
        true,
      );
      expect(root.querySelector('.bullet')?.getAttribute('aria-disabled')).toBe(
        String(axe === false),
      );
      expect(root.querySelector('.axe .bullet-face')).toBeNull();
      root.innerHTML = toolsMarkup(
        { ...quiet, axe },
        initialState().drowse,
        true,
        true,
      );
      expect(root.querySelector('.bullet')?.getAttribute('aria-disabled')).toBe(
        'true',
      );
      expect(root.querySelector('.axe')?.getAttribute('aria-disabled')).toBe(
        'true',
      );
    },
  );
  it('keeps axe halves and axe sound while bullets are loaded', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.innerHTML = `<main class="desk">${documentMarkup(quiet)}${toolsMarkup(quiet, initialState().drowse, true)}</main>`;
    document.body.append(root);
    playAction(root, 'axe', null, false);
    expect(root.querySelectorAll('.axe-half')).toHaveLength(2);
    expect(root.querySelector('.shot-shard')).toBeNull();
    vi.advanceTimersByTime(400);
    expect(playSound).toHaveBeenCalledWith('axe');
    root.remove();
  });
  it.each([
    quiet,
    target,
    { ...quiet, kind: 'speaki' as const, axe: 'free' as const },
  ])('shoots $kind without axe halves', (card) => {
    vi.useFakeTimers();
    const animate = vi.fn();
    const previousAnimate = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'animate',
    );
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const root = document.createElement('div');
    root.innerHTML = `<main class="desk">${documentMarkup(card)}${toolsMarkup(card, initialState().drowse, true)}</main>`;
    document.body.append(root);
    const paper = root.querySelector<HTMLElement>('.document')!;
    vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 400,
      height: 500,
    } as DOMRect);
    expect(
      liftTool(root, 'bullet', { x: 100, y: 150 }).querySelector(
        '.bullet-face',
      ),
    ).not.toBeNull();
    expect(playAction(root, 'bullet', { x: 100, y: 150 }, false)).toBe(1270);
    expect(paper.classList.contains('shot')).toBe(true);
    expect(paper.classList.contains('chopped')).toBe(false);
    expect(root.querySelector('.axe-half')).toBeNull();
    expect(root.querySelector('.shot-shard')).toBeNull();
    expect(root.querySelector('.shot-trail')).not.toBeNull();
    expect(root.querySelector('.shot-flash')).not.toBeNull();
    expect(
      paper.querySelector('canvas.shot-burn')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(paper.style.getPropertyValue('--contact')).toBe('150ms');
    expect(paper.style.getPropertyValue('--burnt')).toBe('1150ms');
    const bullet = root.querySelector('.ghost.bullet')!;
    vi.advanceTimersByTime(149);
    expect(playSound).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(playSound).toHaveBeenCalledWith('shot');
    expect(bullet.classList.contains('embedded')).toBe(false);
    vi.advanceTimersByTime(140);
    expect(root.querySelector('.ghost.bullet')).toBeNull();
    expect(
      root.querySelector('.tool.bullet')?.classList.contains('lifted'),
    ).toBe(false);
    if (previousAnimate)
      Object.defineProperty(Element.prototype, 'animate', previousAnimate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    root.remove();
  });
  it('returns a cancelled bullet drag home', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.innerHTML = `<main class="desk">${toolsMarkup(quiet, initialState().drowse, true)}</main>`;
    const bullet = liftTool(root, 'bullet', { x: 100, y: 150 });
    dropTool(root);
    expect(bullet.classList.contains('returning')).toBe(true);
    expect(
      root.querySelector('.tool.bullet')?.classList.contains('lifted'),
    ).toBe(true);
    vi.advanceTimersByTime(240);
    expect(root.querySelector('.ghost')).toBeNull();
    expect(
      root.querySelector('.tool.bullet')?.classList.contains('lifted'),
    ).toBe(false);
  });
  it('uses the bullet aim caption with a fallback', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="choice-caption"></p>';
    updateAimPreview(root, quiet, 'bullet', false, ready());
    expect(root.textContent).toBe(
      (system as typeof system & { bulletLine?: string }).bulletLine ??
        system.axeLine,
    );
    updateAimPreview(root, quiet, 'axe', false, ready());
    expect(root.textContent).toBe(system.axeLine);
  });
  it('adds absolute mask icons to equipped boons', () => {
    const root = document.createElement('div');
    root.innerHTML = boonsMarkup({
      ...initialState(),
      boons: {
        rewind: true,
        bullet: 2,
        stitch: true,
        alice: true,
        hyean: { left: 3 },
      },
    });
    for (const id of ['rewind', 'bullet', 'stitch', 'alice', 'hyean']) {
      const icon = root.querySelector<HTMLElement>(
        `[data-boon="${id}"] .boon-icon`,
      )!;
      expect(icon).not.toBeNull();
      expect(icon.getAttribute('style')).toContain(
        new URL(`/art/boons/${id}.webp`, document.baseURI).href,
      );
    }
    expect(root.querySelector('[data-boon="bullet"] b')?.textContent).toBe('2');
  });
});
