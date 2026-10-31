import { system } from '../i18n';
import type { Point } from './fx';

export type ShadeKind = 'bullet' | 'scope' | 'bandage' | 'blindfold';
type TrayKind = 'bandage' | 'blindfold';

interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const isTray = (kind?: string) => kind === 'bandage' || kind === 'blindfold';

function hole(el: Element, pad: number, r: number): Hole {
  const box = el.getBoundingClientRect();
  return {
    x: box.left - pad,
    y: box.top - pad,
    w: box.width + pad * 2,
    h: box.height + pad * 2,
    r,
  };
}

const roundRect = ({ x, y, w, h, r }: Hole) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

/** True when the item would do something on this gauge. */
export function usableGauge(gauge: Element, kind: TrayKind): boolean {
  return (
    kind === 'blindfold' ||
    gauge.querySelector('.resource-icon')?.getAttribute('aria-valuenow') !== '50'
  );
}

function draw(root: HTMLElement, shade: HTMLElement): void {
  const kind = shade.dataset.kind as ShadeKind;
  const paper = !isTray(kind);
  const primary: Hole[] = paper
    ? [...root.querySelectorAll('.document')].slice(0, 1).map((el) => hole(el, 6, 6))
    : [...root.querySelectorAll('.gauge')]
        .filter((el) => usableGauge(el, kind as TrayKind))
        .map((el) => hole(el, 6, 14));
  // dropping the blindfold back on its slot takes it off
  const slot =
    kind === 'blindfold' ? root.querySelector('.blindfold-slot[data-placed]') : null;
  const rings = [...primary, ...(slot ? [hole(slot, 6, 14)] : [])];
  const source = shade.hasAttribute('data-source')
    ? root.querySelector(
        paper ? `.tool[data-action="${kind}"]` : `.tray-item[data-${kind}-item]`,
      )
    : null;
  const holes = [...rings, ...(source ? [hole(source, 2, 10)] : [])];

  const w = window.innerWidth;
  const h = window.innerHeight;
  // no viewBox: one unit stays one CSS pixel, so the holes can't drift when a
  // phone's address bar resizes the box; the margin covers that same change
  shade
    .querySelector('path')!
    .setAttribute('d', `M-50 -50H${w + 50}V${h + 200}H-50Z${holes.map(roundRect).join('')}`);

  shade.querySelectorAll('.item-shade-ring').forEach((el) => el.remove());
  const brief = shade.querySelector<HTMLElement>('.item-brief')!;
  for (const ring of rings) {
    const el = document.createElement('i');
    el.className = 'item-shade-ring';
    el.style.cssText = `left:${ring.x}px;top:${ring.y}px;width:${ring.w}px;height:${ring.h}px;border-radius:${ring.r}px`;
    brief.before(el);
  }

  // the card sits next to the targets: above the paper, under the gauges
  if (!primary.length) return;
  const left = Math.min(...primary.map((p) => p.x));
  const right = Math.max(...primary.map((p) => p.x + p.w));
  const top = Math.min(...primary.map((p) => p.y));
  const bottom = Math.max(...primary.map((p) => p.y + p.h));
  const size = brief.getBoundingClientRect();
  brief.style.left = `${Math.max(8, Math.min((left + right) / 2 - size.width / 2, w - size.width - 8))}px`;
  brief.style.top = `${paper ? Math.max(8, top - 10 - size.height) : Math.max(8, Math.min(bottom + 12, h - size.height - 8))}px`;
}

let shown: { root: HTMLElement; shade: HTMLElement } | null = null;

function redraw(): void {
  if (shown?.shade.isConnected) draw(shown.root, shown.shade);
  else stopWatching();
}

function stopWatching(): void {
  shown = null;
  window.removeEventListener('resize', redraw);
}

/** Darkens the screen except where the item can be used and says what it does. */
export function showItemShade(root: HTMLElement, kind: ShadeKind, source = false): void {
  const desk = root.querySelector('.desk');
  if (!desk) return;
  let shade = root.querySelector<HTMLElement>('.item-shade');
  if (shade?.dataset.kind !== kind) {
    shade?.remove();
    shade = document.createElement('div');
    shade.className = 'item-shade';
    shade.dataset.kind = kind;
    shade.innerHTML =
      '<svg class="item-shade-dim" aria-hidden="true"><path fill-rule="evenodd"/></svg><div class="item-brief" role="status"><b></b><span></span></div>';
    shade.querySelector('b')!.textContent = system.boons[kind].name;
    shade.querySelector('span')!.textContent = system.boons[kind].desc;
    desk.append(shade);
  }
  shade.toggleAttribute('data-source', source);
  draw(root, shade);
  shown = { root, shade };
  window.addEventListener('resize', redraw);
}

/** `only` limits it to the tray items' shade or the aimed tools' shade. */
export function hideItemShade(root: HTMLElement, only?: 'tray' | 'aim'): void {
  const shade = root.querySelector<HTMLElement>('.item-shade');
  if (!shade) return;
  if (only && isTray(shade.dataset.kind) !== (only === 'tray')) return;
  shade.remove();
  stopWatching();
}

const placeItem = (el: HTMLElement, point: Point) => {
  el.style.left = `${point.x}px`;
  el.style.top = `${point.y}px`;
};

/** The tray item in hand: a copy above the shade follows the pointer. */
export function liftItem(root: HTMLElement, kind: TrayKind, point: Point): void {
  dropItem(root);
  const el = document.createElement('span');
  el.className = 'item-carry';
  el.dataset.kind = kind;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="item-face"></i>';
  placeItem(el, point);
  (root.querySelector('.desk') ?? root).append(el);
}

export function moveItem(root: HTMLElement, point: Point): void {
  const el = root.querySelector<HTMLElement>('.item-carry');
  if (el) placeItem(el, point);
}

export function dropItem(root: HTMLElement): void {
  root.querySelectorAll('.item-carry').forEach((el) => el.remove());
}
