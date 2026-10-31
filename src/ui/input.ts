import { GAUGE_KEYS } from '../core/config';
import type { Gauge } from '../core/state';
import type { ToolAction as Action } from './tools';
import { dropTool, liftTool, moveTool, overPaper, type Point } from './fx';
import {
  dropItem,
  hideItemShade,
  liftItem,
  moveItem,
  showItemShade,
  usableGauge,
} from './itemShade';

export interface Input {
  readonly busy: boolean;
  readonly sleep: number;
  readonly playing: boolean;
  readonly aim: Action | null;
  readonly menuOpen: boolean;
  readonly sceneOpen: boolean;
  sceneKey(event: KeyboardEvent): void;
  openMenu(): void;
  menuKey(event: KeyboardEvent): void;
  setAim(value: Action | null): void;
  /** False when the tool may not be picked up (the app shows why). */
  canLift(action: Action): boolean;
  /** True while the wildcard may swap the current document. */
  canWild?(): boolean;
  /** Shows or clears the wildcard's whisper under the paper. */
  wildCaption?(on: boolean): void;
  stamp(action: Action, drop?: Point): void;
  placeBlindfold?(gauge?: Gauge): void;
  useBandage?(gauge: Gauge): void;
  autoStamp(): void;
  skip(): void;
}

/** Below this travel a press counts as a tap rather than a drag. */
const TAP_PX = 10;
/** How far the paper must slide sideways before letting go swaps it. */
const WILD_PX = 80;

export function createInput(root: HTMLElement, input: Input) {
  let bindings = new AbortController();
  let hold: {
    id: number;
    action: Action;
    start: Point;
    moved: boolean;
    wasAimed: boolean;
    button: HTMLButtonElement;
  } | null = null;

  let selectedItem: 'blindfold' | 'bandage' | null = null;
  // the wildcard gesture: hold the paper, slide it sideways past WILD_PX
  let wild: { id: number; start: Point; sliding: boolean; ready: boolean } | null = null;
  const paper = () => root.querySelector<HTMLElement>('.document');
  const setTarget = (on: boolean) => paper()?.classList.toggle('target', on);

  /** Puts a held or selected tray item away and lifts its shade. */
  function clearItem(): void {
    selectedItem = null;
    dropItem(root);
    hideItemShade(root, 'tray');
    root
      .querySelectorAll('.tray-item.lifted, .blindfold-mark.lifted')
      .forEach((el) => el.classList.remove('lifted'));
  }

  function reset(returnHeld = false): void {
    wild = null;
    clearItem();
    const held = hold;
    hold = null;
    if (held?.button.hasPointerCapture?.(held.id))
      held.button.releasePointerCapture(held.id);
    setTarget(false);
    if (returnHeld) {
      dropTool(root);
      return;
    }
    root.querySelectorAll('.ghost').forEach((el) => el.remove());
    root
      .querySelectorAll('.lifted')
      .forEach((el) => el.classList.remove('lifted'));
  }

  function interrupt(): boolean {
    if (input.busy) {
      input.skip();
      return true;
    }
    if (input.sleep) {
      input.autoStamp();
      return true;
    }
    return false;
  }

  function bind(): void {
    let start = { x: 0, y: 0 };
    let moved = false;
    let wasSelected = false;
    bindings.abort();
    bindings = new AbortController();
    reset();
    root
      .querySelectorAll<HTMLElement>('[data-blindfold-item], [data-bandage-item]')
      .forEach((item) => {
        const kind = item.hasAttribute('data-bandage-item') ? 'bandage' : 'blindfold';
        item.addEventListener(
          'pointerdown',
          (event) => {
            if (
              item.getAttribute('aria-disabled') === 'true' ||
              input.busy ||
              input.sleep ||
              !input.playing ||
              input.menuOpen ||
              input.sceneOpen
            )
              return;
            event.stopPropagation();
            event.preventDefault();
            item.setPointerCapture?.(event.pointerId);
            start = { x: event.clientX, y: event.clientY };
            moved = false;
            wasSelected = selectedItem === kind;
            if (input.aim) input.setAim(null);
            selectedItem = null;
            item.classList.add('lifted');
            liftItem(root, kind, start);
            showItemShade(root, kind);
          },
          { signal: bindings.signal },
        );
        // The item follows the finger and lights the gauge under it.
        item.addEventListener(
          'pointermove',
          (event) => {
            if (!item.hasPointerCapture?.(event.pointerId)) return;
            item.classList.add('dragging');
            moveItem(root, { x: event.clientX, y: event.clientY });
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_PX)
              moved = true;
            const over = document
              .elementsFromPoint(event.clientX, event.clientY)
              .find((el) => el !== item && !item.contains(el))
              ?.closest<HTMLElement>('[data-gauge]');
            root
              .querySelectorAll('.gauge.blindfold-target')
              .forEach(
                (el) => el !== over && el.classList.remove('blindfold-target'),
              );
            if (over && usableGauge(over, kind)) over.classList.add('blindfold-target');
          },
          { signal: bindings.signal },
        );
        item.addEventListener(
          'pointerup',
          (event) => {
            if (!item.hasPointerCapture?.(event.pointerId)) return;
            event.stopPropagation();
            item.releasePointerCapture(event.pointerId);
            const dragged = moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_PX;
            item.classList.remove('dragging', 'lifted');
            dropItem(root);
            root
              .querySelectorAll('.gauge.blindfold-target')
              .forEach((el) => el.classList.remove('blindfold-target'));
            const targets = document.elementsFromPoint(event.clientX, event.clientY);
            const target = targets.find((el) => el !== item && !item.contains(el));
            const gauge = target?.closest<HTMLElement>('[data-gauge]')?.dataset
              .gauge as Gauge | undefined;
            if (gauge) {
              clearItem();
              if (kind === 'bandage') input.useBandage?.(gauge);
              else input.placeBlindfold?.(gauge);
            } else if (kind === 'blindfold' && dragged && targets.some((el) => el.closest('.blindfold-slot'))) {
              clearItem();
              input.placeBlindfold?.();
            } else if (dragged || wasSelected) {
              // let go over nothing, or a second tap: the item goes back
              clearItem();
            } else {
              // a tap keeps the shade up; the next tap on a gauge uses the item
              selectedItem = kind;
              showItemShade(root, kind, true);
            }
          },
          { signal: bindings.signal },
        );
        item.addEventListener(
          'pointercancel',
          () => {
            item.classList.remove('dragging');
            root
              .querySelectorAll('.gauge.blindfold-target')
              .forEach((el) => el.classList.remove('blindfold-target'));
            clearItem();
          },
          { signal: bindings.signal },
        );
        item.addEventListener('click', (event) => {
          if (event.detail === 0 && item.getAttribute('aria-disabled') !== 'true') {
            selectedItem = kind;
            showItemShade(root, kind, true);
          }
        }, { signal: bindings.signal });
      });
    root.querySelectorAll<HTMLElement>('[data-gauge]').forEach((el) => el.addEventListener('click', () => {
      if (!selectedItem || input.busy || input.sleep || input.menuOpen || input.sceneOpen) return;
      const gauge = el.dataset.gauge as Gauge;
      const kind = selectedItem;
      clearItem();
      if (kind === 'bandage') input.useBandage?.(gauge);
      else input.placeBlindfold?.(gauge);
    }, { signal: bindings.signal }));
    root.querySelectorAll<HTMLButtonElement>('.tool').forEach((button) => {
      const action = button.dataset.action as Action;
      button.addEventListener(
        'pointerdown',
        (e) => {
          // the item coin on a reward stamp opens its tip instead of lifting
          if ((e.target as Element).closest?.('.item-coin')) return;
          if (action === 'alice') e.stopPropagation();
          if (
            e.button !== 0 ||
            hold ||
            !input.playing ||
            input.menuOpen ||
            input.sceneOpen
          )
            return;
          if (interrupt() || !input.canLift(action)) return;
          clearItem();
          const point = { x: e.clientX, y: e.clientY };
          hold = {
            id: e.pointerId,
            action,
            start: point,
            moved: false,
            wasAimed: input.aim === action,
            button,
          };
          button.setPointerCapture?.(e.pointerId);
          liftTool(root, action, point);
          input.setAim(action);
        },
        { signal: bindings.signal },
      );
      button.addEventListener(
        'pointermove',
        (e) => {
          if (action === 'alice') e.stopPropagation();
          if (!hold || hold.button !== button || hold.id !== e.pointerId)
            return;
          const point = { x: e.clientX, y: e.clientY };
          if (
            Math.hypot(point.x - hold.start.x, point.y - hold.start.y) > TAP_PX
          )
            hold.moved = true;
          moveTool(root, point);
          setTarget(overPaper(root, point));
        },
        { signal: bindings.signal },
      );
      const release = (e: PointerEvent) => {
        if (action === 'alice') e.stopPropagation();
        if (!hold || hold.button !== button || hold.id !== e.pointerId) return;
        const { start, wasAimed } = hold;
        const moved =
          hold.moved ||
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_PX;
        hold = null;
        if (button.hasPointerCapture?.(e.pointerId))
          button.releasePointerCapture(e.pointerId);
        setTarget(false);
        const point = { x: e.clientX, y: e.clientY };
        if (
          e.type === 'pointerup' &&
          overPaper(root, point) &&
          ((action !== 'alice') || moved)
        ) {
          moveTool(root, point);
          input.stamp(action, point);
          return;
        }
        dropTool(root);
        // A tap keeps the preview up; tapping the same tool again confirms.
        if (e.type === 'pointerup' && !moved) {
          if (wasAimed) input.stamp(action);
          // the tool is going back home, so its spot lights up for the second tap
          else if ((action === 'bullet' || action === 'scope') && input.aim === action)
            showItemShade(root, action, true);
          return;
        }
        input.setAim(null);
      };
      button.addEventListener('pointerup', release, {
        signal: bindings.signal,
      });
      button.addEventListener('pointercancel', release, {
        signal: bindings.signal,
      });
      button.addEventListener('lostpointercapture', release, {
        signal: bindings.signal,
      });
      // Keyboard activation (Enter / Space on a focused tool).
      button.addEventListener(
        'click',
        (e) => {
          if (action === 'alice') e.stopPropagation();
          if (
            e.detail !== 0 ||
            !input.playing ||
            input.menuOpen ||
            input.sceneOpen ||
            hold ||
            interrupt()
          )
            return;
          clearItem();
          if (input.aim === action) input.stamp(action);
          else input.setAim(action);
        },
        { signal: bindings.signal },
      );
    });
    bindWild();
  }

  function endWild(swap: boolean): void {
    const held = wild;
    wild = null;
    const sheet = paper();
    if (!held || !sheet) return;
    if (sheet.hasPointerCapture?.(held.id)) sheet.releasePointerCapture(held.id);
    sheet.classList.remove('wild-hold', 'wild-ready', 'wild-sliding');
    input.wildCaption?.(false);
    if (swap) {
      input.stamp('alice');
      return;
    }
    if (!held.sliding) return;
    sheet.classList.add('wild-return');
    sheet.style.removeProperty('translate');
    sheet.style.removeProperty('rotate');
    setTimeout(() => sheet.classList.remove('wild-return'), 220);
  }

  function bindWild(): void {
    const sheet = paper();
    if (!sheet) return;
    const on = (type: string, fn: (e: PointerEvent) => void) =>
      sheet.addEventListener(type, fn as EventListener, { signal: bindings.signal });
    on('pointerdown', (e) => {
      if (
        e.button !== 0 ||
        wild ||
        hold ||
        !input.playing ||
        input.busy ||
        input.sleep ||
        input.menuOpen ||
        input.sceneOpen ||
        !input.canWild?.() ||
        (e.target as Element).closest('.tool, [data-tip], .bishop-pill, .bishop-sheet')
      )
        return;
      wild = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, sliding: false, ready: false };
      if (input.aim) input.setAim(null);
      clearItem();
      sheet.classList.add('wild-hold');
      input.wildCaption?.(true);
    });
    on('pointermove', (e) => {
      if (!wild || wild.id !== e.pointerId) return;
      const dx = e.clientX - wild.start.x;
      const dy = e.clientY - wild.start.y;
      if (!wild.sliding) {
        // an upward or downward drag is the letter scrolling, not a swap
        if (Math.abs(dy) > TAP_PX && Math.abs(dy) > Math.abs(dx)) {
          endWild(false);
          return;
        }
        if (Math.abs(dx) <= TAP_PX) return;
        wild.sliding = true;
        sheet.setPointerCapture?.(e.pointerId);
        sheet.classList.add('wild-sliding');
      }
      wild.ready = Math.abs(dx) >= WILD_PX;
      sheet.classList.toggle('wild-ready', wild.ready);
      sheet.style.setProperty('--wild-dir', dx < 0 ? '-1' : '1');
      sheet.style.translate = `${dx * 0.85}px 0`;
      sheet.style.rotate = `${dx * 0.03}deg`;
    });
    on('pointerup', (e) => {
      if (wild?.id === e.pointerId) endWild(wild.ready);
    });
    on('pointercancel', (e) => {
      if (wild?.id === e.pointerId) endWild(false);
    });
  }

  const onBackground = (e: PointerEvent) => {
    if (
      e.button !== 0 ||
      !input.playing ||
      input.menuOpen ||
      input.sceneOpen ||
      hold ||
      wild ||
      (e.target as Element).closest(
        '.tool, .menu-button, .menu, [data-tip], .bishop-pill, .bishop-sheet',
      )
    )
      return;
    if (interrupt()) return;
    if (input.aim) input.setAim(null);
    // a tap on a gauge is the selected item's target (its click comes next)
    if (selectedItem && !(e.target as Element).closest('[data-gauge]')) clearItem();
  };
  root.addEventListener('pointerdown', onBackground);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!input.playing) return;
    if (input.sceneOpen) {
      input.sceneKey(e);
      return;
    }
    if (input.menuOpen) {
      input.menuKey(e);
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      if (!e.repeat && !input.busy && !input.sleep) {
        const kind = selectedItem;
        clearItem();
        if (kind === 'bandage') input.useBandage?.(GAUGE_KEYS[Number(e.key) - 1]!);
        else input.placeBlindfold?.(GAUGE_KEYS[Number(e.key) - 1]);
      }
      return;
    }
    if (e.key === 'Escape' && selectedItem) {
      e.preventDefault();
      if (!e.repeat) clearItem();
      return;
    }
    if ((e.target as Element).closest?.('[data-tip]')) return;
    if (
      ['Enter', ' '].includes(e.key) &&
      (e.target as Element).closest?.('.bishop-pill')
    )
      return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (input.aim) {
        reset();
        input.setAim(null);
      } else if (!input.busy) input.openMenu();
      return;
    }
    if (e.key === 'Enter' && (e.target as Element).closest?.('.menu-button'))
      return;
    if (
      ['Enter', ' '].includes(e.key) &&
      (e.target as Element).closest?.('.tool.alice')
    ) {
      if (e.repeat) e.preventDefault();
      return;
    }
    if (input.sleep && !input.busy && !e.repeat) {
      e.preventDefault();
      reset();
      input.autoStamp();
      return;
    }
    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowDown',
        'ArrowUp',
        'r',
        'R',
        's',
        'S',
        ' ',
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    if (e.repeat) return;
    if (input.busy) {
      if (e.key === ' ') input.skip();
      return;
    }
    clearItem();
    if (hold) reset();
    if (e.key === ' ') input.skip();
    else {
      const choice =
        e.key === 's' || e.key === 'S'
            ? 'scope'
            : e.key === 'r' || e.key === 'R'
              ? 'alice'
              : e.key === 'ArrowUp'
                ? 'bullet'
                : e.key === 'ArrowDown'
                  ? 'axe'
                  : e.key === 'ArrowLeft'
                    ? 'reject'
                    : 'approve';
      if (input.aim === choice) input.stamp(choice);
      else if (input.aim) input.setAim(null);
      else input.setAim(choice);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return {
    bind,
    reset,
    keyDown: onKeyDown,
    dispose() {
      bindings.abort();
      reset();
      window.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('pointerdown', onBackground);
    },
  };
}
