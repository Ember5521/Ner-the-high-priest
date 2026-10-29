import { GAUGE_KEYS } from '../core/config';
import type { Gauge } from '../core/state';
import type { ToolAction as Action } from './tools';
import { dropTool, liftTool, moveTool, overPaper, type Point } from './fx';

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
  stamp(action: Action, drop?: Point): void;
  placeBlindfold?(gauge?: Gauge): void;
  useBandage?(gauge: Gauge): void;
  autoStamp(): void;
  skip(): void;
}

/** Below this travel a press counts as a tap rather than a drag. */
const TAP_PX = 10;

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
  const paper = () => root.querySelector<HTMLElement>('.document');
  const setTarget = (on: boolean) => paper()?.classList.toggle('target', on);

  function reset(returnHeld = false): void {
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
    bindings.abort();
    bindings = new AbortController();
    reset();
    root
      .querySelectorAll<HTMLElement>('[data-blindfold-item], [data-bandage-item]')
      .forEach((item) => {
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
          },
          { signal: bindings.signal },
        );
        // The item follows the finger and lights the gauge under it.
        item.addEventListener(
          'pointermove',
          (event) => {
            if (!item.hasPointerCapture?.(event.pointerId)) return;
            item.classList.add('dragging');
            item.style.translate = `${event.clientX - start.x}px ${event.clientY - start.y}px`;
            const over = document
              .elementsFromPoint(event.clientX, event.clientY)
              .find((el) => el !== item && !item.contains(el))
              ?.closest<HTMLElement>('[data-gauge]');
            root
              .querySelectorAll('.gauge.blindfold-target')
              .forEach(
                (el) => el !== over && el.classList.remove('blindfold-target'),
              );
            over?.classList.add('blindfold-target');
          },
          { signal: bindings.signal },
        );
        item.addEventListener(
          'pointerup',
          (event) => {
            if (!item.hasPointerCapture?.(event.pointerId)) return;
            event.stopPropagation();
            item.releasePointerCapture(event.pointerId);
            const dragged = item.classList.contains('dragging') || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_PX;
            item.classList.remove('dragging');
            item.style.removeProperty('translate');
            root
              .querySelectorAll('.gauge.blindfold-target')
              .forEach((el) => el.classList.remove('blindfold-target'));
            const targets = document.elementsFromPoint(event.clientX, event.clientY);
            const target = targets.find((el) => el !== item && !item.contains(el));
            const gauge = target?.closest<HTMLElement>('[data-gauge]')?.dataset
              .gauge as Gauge | undefined;
            const kind = item.hasAttribute('data-bandage-item') ? 'bandage' : 'blindfold';
            if (gauge) {
              selectedItem = null;
              if (kind === 'bandage') input.useBandage?.(gauge);
              else input.placeBlindfold?.(gauge);
            } else if (kind === 'blindfold' && dragged && targets.some((el) => el.closest('.blindfold-slot'))) {
              selectedItem = null;
              input.placeBlindfold?.();
            } else selectedItem = kind;
          },
          { signal: bindings.signal },
        );
        item.addEventListener('click', (event) => {
          if (event.detail === 0 && item.getAttribute('aria-disabled') !== 'true')
            selectedItem = item.hasAttribute('data-bandage-item') ? 'bandage' : 'blindfold';
        }, { signal: bindings.signal });
      });
    root.querySelectorAll<HTMLElement>('[data-gauge]').forEach((el) => el.addEventListener('click', () => {
      if (!selectedItem || input.busy || input.sleep || input.menuOpen || input.sceneOpen) return;
      const gauge = el.dataset.gauge as Gauge;
      const kind = selectedItem;
      selectedItem = null;
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
          if (input.aim === action) input.stamp(action);
          else input.setAim(action);
        },
        { signal: bindings.signal },
      );
    });
  }

  const onBackground = (e: PointerEvent) => {
    if (
      e.button !== 0 ||
      !input.playing ||
      input.menuOpen ||
      input.sceneOpen ||
      hold ||
      (e.target as Element).closest(
        '.tool, .menu-button, .menu, [data-tip], .bishop-pill, .bishop-sheet',
      )
    )
      return;
    if (!interrupt() && input.aim) input.setAim(null);
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
      if (!e.repeat && !input.busy && !input.sleep)
        if (selectedItem === 'bandage') { selectedItem = null; input.useBandage?.(GAUGE_KEYS[Number(e.key) - 1]!); }
        else { selectedItem = null; input.placeBlindfold?.(GAUGE_KEYS[Number(e.key) - 1]); }
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
