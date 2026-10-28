import { playSound } from './sound';
import type { Document } from '../core/state';
import type { ToolAction as Action } from './tools';
import { hydrateArt, iconArt, uiUrl } from './art';
import { ACTION_MS, CONTACT_MS, stampArt, toolFace } from './tools';

export interface Point {
  x: number;
  y: number;
}

const TRAVEL_MS = 260;
const RETURN_MS = 240;
const LIFTED = 'translate(-50%, -50%) scale(1.12)';

const center = (el: Element): Point => {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const place = (el: HTMLElement, point: Point) => {
  el.style.left = `${point.x}px`;
  el.style.top = `${point.y}px`;
};
const tool = (root: HTMLElement, action: Action) =>
  root.querySelector<HTMLElement>(`.tool[data-action="${action}"]`);

const SHOT_TRAVEL_MS = 150;
/** After the hole, how long the blue fire takes to eat the whole sheet. */
const BURN_MS = 1000;
/** The bullet keeps flying out the far side for this long. */
const EXIT_MS = 140;
/** A shot lingers a little longer than a stamp: the paper burns first. */
const SHOT_EXTRA_MS = 300;
/** The bullet art leans 58° above the horizontal; turn it to its flight. */
function aimBullet(el: HTMLElement, from: Point, to: Point) {
  const face = el.querySelector<HTMLElement>('.bullet-face');
  if (!face || (from.x === to.x && from.y === to.y)) return;
  const heading = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  face.style.setProperty('--aim', `${Math.round(heading + 58)}deg`);
}

/**
 * The 마탄 goes straight through the middle and out the far side, leaving a
 * blue streak. Blue fire spreads from the hole in uneven tongues (five
 * growing circles that cut the sheet away together) until nothing is left.
 */
function burnThrough(
  root: HTMLElement,
  paper: HTMLElement,
  bullet: HTMLElement,
  from: Point,
  contact: number,
) {
  const hit = center(paper);
  const box = paper.getBoundingClientRect();
  // keyboard shots start on the paper itself: fly up from the bullet's home
  const start =
    Math.hypot(hit.x - from.x, hit.y - from.y) > 4
      ? from
      : { x: hit.x, y: hit.y + box.height };
  const angle = Math.atan2(hit.y - start.y, hit.x - start.x);
  const beyond = Math.max(box.width, box.height) * 0.9 + 160;
  const exit = {
    x: hit.x + Math.cos(angle) * beyond,
    y: hit.y + Math.sin(angle) * beyond,
  };
  // on through the paper and away, fading as it goes
  bullet.animate?.(
    [
      { left: `${hit.x}px`, top: `${hit.y}px`, opacity: 1 },
      { left: `${exit.x}px`, top: `${exit.y}px`, opacity: 0 },
    ],
    { duration: EXIT_MS, delay: contact, easing: 'linear', fill: 'forwards' },
  );
  // the streak it leaves behind, from the tool to well past the paper
  const trail = document.createElement('span');
  trail.className = 'shot-trail';
  trail.setAttribute('aria-hidden', 'true');
  trail.style.left = `${start.x}px`;
  trail.style.top = `${start.y}px`;
  trail.style.width = `${Math.hypot(exit.x - start.x, exit.y - start.y)}px`;
  trail.style.setProperty('--angle', `${angle}rad`);
  trail.style.setProperty('--contact', `${contact}ms`);
  root.querySelector('.desk')?.append(trail);

  paper.classList.add('shot');
  paper.style.setProperty('--contact', `${contact}ms`);
  paper.style.setProperty('--burnt', `${contact + BURN_MS}ms`);
  const w = paper.offsetWidth;
  const h = paper.offsetHeight;
  const burn = document.createElement('canvas');
  burn.className = 'shot-burn';
  burn.setAttribute('aria-hidden', 'true');
  paper.append(burn);
  setTimeout(() => burnAway(paper, burn), contact);
  // the blue flash where it punched through
  const flash = document.createElement('span');
  flash.className = 'shot-flash';
  flash.setAttribute('aria-hidden', 'true');
  flash.style.left = `${paper.offsetLeft + w / 2}px`;
  flash.style.top = `${paper.offsetTop + h / 2}px`;
  flash.style.setProperty('--contact', `${contact}ms`);
  paper.after(flash);
  // blue sparks lifting off the burning edge as it moves outward
  for (let i = 0; i < 14; i++) {
    const spark = document.createElement('span');
    spark.className = 'shot-spark';
    spark.setAttribute('aria-hidden', 'true');
    const t = i / 14;
    const a = Math.random() * Math.PI * 2;
    const r = 0.12 + t * 0.8;
    spark.style.left = `${paper.offsetLeft + w / 2 + Math.cos(a) * r * w * 0.5}px`;
    spark.style.top = `${paper.offsetTop + h / 2 + Math.sin(a) * r * h * 0.5}px`;
    spark.style.setProperty(
      '--delay',
      `${(contact + t * BURN_MS * 0.8).toFixed(0)}ms`,
    );
    spark.style.setProperty(
      '--drift',
      `${((Math.random() - 0.5) * 40).toFixed(0)}px`,
    );
    spark.style.setProperty(
      '--rise',
      `${(-50 - Math.random() * 60).toFixed(0)}px`,
    );
    paper.after(spark);
  }
}

/** Smooth value noise in 0..1 on a coarse random grid (cells × cells). */
function valueNoise(cells: number): (u: number, v: number) => number {
  const grid = Array.from({ length: (cells + 1) ** 2 }, () => Math.random());
  const at = (i: number, j: number) => grid[j * (cells + 1) + i]!;
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = Math.min(cells - 1e-6, Math.max(0, u * cells));
    const y = Math.min(cells - 1e-6, Math.max(0, v * cells));
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = ease(x - i);
    const fy = ease(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/**
 * Blue fire eating the sheet from the hole outward. Every point of the paper
 * gets a moment it catches (its distance from the hole, roughened by noise);
 * each frame the burnt part is cut out of the paper with a mask and the
 * band just ahead of the front is painted as a white-blue flame edge, a
 * charred rim and a brown scorch on the canvas laid over the paper.
 */
function burnAway(paper: HTMLElement, canvas: HTMLCanvasElement) {
  if (
    !paper.isConnected ||
    matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return;
  const scale = 0.6;
  const w = Math.max(1, Math.round(paper.offsetWidth * scale));
  const h = Math.max(1, Math.round(paper.offsetHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext?.('2d');
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext?.('2d');
  if (!ctx || !mctx) return;
  const coarse = valueNoise(5);
  const fine = valueNoise(13);
  const catchAt = new Float32Array(w * h);
  const far = Math.hypot(w / 2, h / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      catchAt[y * w + x] =
        (Math.hypot(x - w / 2, y - h / 2) / far) * 0.78 +
        coarse(u, v) * 0.26 +
        fine(u, v) * 0.1;
    }
  const image = ctx.createImageData(w, h);
  const cut = mctx.createImageData(w, h);
  const start = performance.now();
  // how far ahead of the front a point is → its colour: pale blue flame,
  // deep blue, char, brown, a fading scorch
  const stops: [number, number, number, number, number][] = [
    [0, 196, 230, 255, 255],
    [0.014, 96, 164, 255, 255],
    [0.032, 40, 92, 214, 255],
    [0.05, 28, 20, 16, 255],
    [0.08, 44, 30, 22, 245],
    [0.12, 96, 66, 42, 150],
    [0.2, 150, 104, 62, 60],
    [0.26, 150, 104, 62, 0],
  ];
  const colour = (e: number, out: Uint8ClampedArray, o: number) => {
    if (e < 0 || e >= 0.26) {
      out[o + 3] = 0;
      return;
    }
    let k = 1;
    while (stops[k]![0] < e) k++;
    const lo = stops[k - 1]!;
    const hi = stops[k]!;
    const f = (e - lo[0]) / (hi[0] - lo[0]);
    out[o] = lo[1] + (hi[1] - lo[1]) * f;
    out[o + 1] = lo[2] + (hi[2] - lo[2]) * f;
    out[o + 2] = lo[3] + (hi[3] - lo[3]) * f;
    out[o + 3] = lo[4] + (hi[4] - lo[4]) * f;
  };
  const frame = (now: number) => {
    if (!paper.isConnected) return;
    const t = Math.min(1, (now - start) / BURN_MS);
    // a quick bite at the hole, then a steady spread that speeds up a little
    const front = -0.02 + 0.06 * Math.min(1, t / 0.08) + 1.12 * t ** 1.25;
    const flicker = (Math.random() - 0.5) * 0.008;
    const px = image.data;
    const mp = cut.data;
    for (let i = 0; i < catchAt.length; i++) {
      const e = catchAt[i]! - front;
      colour(e + flicker, px, i * 4);
      // soft cut: the last sliver before the front fades out
      mp[i * 4 + 3] = e <= 0 ? 0 : e >= 0.008 ? 255 : (e / 0.008) * 255;
    }
    ctx.putImageData(image, 0, 0);
    mctx.putImageData(cut, 0, 0);
    const url = `url(${mask.toDataURL()})`;
    paper.style.setProperty('-webkit-mask-image', url);
    paper.style.setProperty('mask-image', url);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function ghost(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.ghost');
}

/** Picks a tool up off the desk; the copy follows the pointer. */
export function liftTool(
  root: HTMLElement,
  action: Action,
  point: Point,
  asleep = false,
): HTMLElement {
  root.querySelectorAll('.ghost').forEach((el) => el.remove());
  root
    .querySelectorAll('.lifted')
    .forEach((el) => el.classList.remove('lifted'));
  const home = tool(root, action);
  home?.classList.add('lifted');
  const el = document.createElement('div');
  el.className = `ghost ${action} ${asleep ? 'erpin-ghost' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${toolFace(action, Boolean(root.querySelector('.document.approve-both')), root.querySelector<HTMLElement>('.document')?.dataset.stamps as Document['stamps'])}${asleep ? `<span class="erpin-badge">${iconArt('erpin')}</span>` : ''}`;
  el.style.transform = LIFTED;
  place(el, point);
  root.querySelector('.desk')!.append(el);
  hydrateArt(el);
  return el;
}

export function moveTool(root: HTMLElement, point: Point): void {
  const el = ghost(root);
  if (el) place(el, point);
}

/** Puts a lifted tool back where it was. */
export function dropTool(root: HTMLElement): void {
  const el = ghost(root);
  if (!el) return;
  const action = (
    ['reject', 'approve', 'axe', 'bullet', 'alice', 'scope'] as const
  ).find((a) => el.classList.contains(a))!;
  const home = tool(root, action);
  el.classList.add('returning');
  const done = () => {
    el.remove();
    if (!ghost(root)?.classList.contains(action))
      home?.classList.remove('lifted');
  };
  if (!home) return done();
  const to = center(home);
  const from = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  el.animate?.(
    [
      { left: `${from.x}px`, top: `${from.y}px`, transform: LIFTED },
      {
        left: `${to.x}px`,
        top: `${to.y}px`,
        transform: 'translate(-50%, -50%)',
      },
    ],
    { duration: RETURN_MS, easing: 'cubic-bezier(.3,.7,.4,1)' },
  );
  place(el, to);
  setTimeout(done, RETURN_MS);
}

export function overPaper(root: HTMLElement, point: Point): boolean {
  const paper = root.querySelector('.document');
  if (!paper) return false;
  const box = paper.getBoundingClientRect();
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

export function hesitateAxe(root: HTMLElement, action: Action = 'axe'): void {
  const axe = root.querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (!axe) return;
  axe.classList.remove('hesitating');
  void axe.offsetWidth;
  axe.classList.add('hesitating');
}

/**
 * Brings the tool down on the paper. With no drop point (keyboard, double
 * tap, Erpin's sleep stamping) the tool first travels to the seal spot.
 * Returns how long the whole action takes.
 */
export function playAction(
  root: HTMLElement,
  action: Action,
  drop: Point | null,
  asleep: boolean,
): number {
  const paper = root.querySelector<HTMLElement>('.document')!;
  // Alice's swap runs immediately for 500 ms, without a tool or stamp delay.
  if (action === 'alice') {
    ghost(root)?.remove();
    tool(root, action)?.classList.remove('lifted');
    paper.classList.add('processed-alice');
    return 500;
  }
  const spot = root.querySelector('.seal-spot') ?? paper;
  // The 마탄 always flies straight into the middle of the paper.
  const shot = action === 'bullet';
  const target = shot ? center(paper) : (drop ?? center(spot));
  let el = ghost(root);
  if (el?.classList.contains('returning')) {
    el.remove();
    el = null;
  }
  let travel = 0;
  let shotFrom = target;
  if (!el || !drop || shot) {
    const from = tool(root, action);
    el ??= liftTool(root, action, from ? center(from) : target, asleep);
    travel = shot ? SHOT_TRAVEL_MS : TRAVEL_MS;
    const start = {
      x: parseFloat(el.style.left) || target.x,
      y: parseFloat(el.style.top) || target.y,
    };
    shotFrom = start;
    if (shot) aimBullet(el, start, target);
    el.animate?.(
      [
        {
          left: el.style.left,
          top: el.style.top,
          transform: 'translate(-50%, -50%)',
        },
        { left: `${target.x}px`, top: `${target.y}px`, transform: LIFTED },
      ],
      {
        duration: travel,
        easing: shot
          ? 'cubic-bezier(.55,0,.9,.45)'
          : 'cubic-bezier(.3,.7,.4,1)',
      },
    );
    place(el, target);
  }
  // a shot does not press down: it is through the paper the moment it arrives
  const contact = shot ? travel : travel + CONTACT_MS;
  const desk = root.querySelector<HTMLElement>('.desk')!;
  desk.style.setProperty('--contact', `${contact}ms`);
  el.style.setProperty('--contact', `${contact}ms`);
  el.style.setProperty('--travel', `${travel}ms`);
  el.classList.add('striking');
  if (action === 'scope') {
    setTimeout(() => ghost(root) === el && dropTool(root), contact + 120);
    return contact;
  }
  paper.classList.add(`processed-${action}`);
  desk.classList.add('impact');

  if (shot) burnThrough(root, paper, el, shotFrom, contact);
  else if (action === 'axe') {
    paper.classList.add('chopped');
    for (const side of ['left', 'right']) {
      const half = paper.cloneNode(true) as HTMLElement;
      half
        .querySelectorAll('.paper-alice')
        .forEach((el) => el.remove());
      half.className = `paper document axe-half ${side} ${[...paper.classList].filter((c) => c.startsWith('doc-')).join(' ')}`;
      half.style.left = `${paper.offsetLeft}px`;
      half.style.top = `${paper.offsetTop}px`;
      half.style.width = `${paper.offsetWidth}px`;
      half.style.height = `${paper.offsetHeight}px`;
      half.removeAttribute('tabindex');
      half.setAttribute('aria-hidden', 'true');
      paper.after(half);
    }
  } else {
    const box = paper.getBoundingClientRect();
    const size = Math.min(140, Math.max(84, box.width * 0.36));
    const pad = size * 0.4;
    const x = Math.max(pad, Math.min(box.width - pad, target.x - box.left));
    const y = Math.max(pad, Math.min(box.height - pad, target.y - box.top));
    const ink = document.createElement('span');
    const approveBoth = paper.classList.contains('approve-both');
    ink.className = `ink ${action} ${approveBoth ? 'approve-both' : ''} ${asleep ? 'erpin-ink' : ''}`;
    ink.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;--angle:${Math.round(Math.random() * 28 - 14)}deg`;
    const url = uiUrl(
      stampArt(action, approveBoth, paper.dataset.stamps as Document['stamps']),
    );
    if (url) ink.style.backgroundImage = `url("${url}")`;
    root.querySelector('.imprints')!.append(ink);
  }
  const total = travel + ACTION_MS + (shot ? SHOT_EXTRA_MS : 0);
  const lifted = el;
  setTimeout(() => {
    if (lifted.isConnected && lifted.classList.contains('striking')) {
      playSound(shot ? 'shot' : action === 'axe' ? 'axe' : 'stamp');
      // the fire and the burst that follow the bang
      if (shot) playSound('shatter');
    }
  }, contact);
  if (shot) {
    setTimeout(() => {
      if (ghost(root) !== lifted) return;
      lifted.remove();
      tool(root, 'bullet')?.classList.remove('lifted');
    }, contact + EXIT_MS);
  } else {
    setTimeout(() => ghost(root) === lifted && dropTool(root), contact + 120);
  }
  return total;
}
