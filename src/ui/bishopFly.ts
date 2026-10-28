import { system } from '../i18n';
import { bishopSources, bishopSpecials } from '../core/bishop';
import type { State } from '../core/state';
import { escape } from './art';

type Arrival = { key: string; tone: string; label: string; name: string; target: string };
type Copy = Record<string, { name: string }>;

// Every effect the player can see in the pill or the right tray, one key each
// (a repeated omen counts again, so its second copy flies in too).
function arrivals(state: State): Arrival[] {
  const b = system.bishop;
  const result: Arrival[] = [];
  for (const source of bishopSources(state)) {
    if (source.group === 'status') continue;
    const [copy, label] = source.group === 'flow' ? [b.flows, b.flowLabel] : source.group === 'omen' ? [b.omens, b.omenLabel] : [b.blessings, b.blessingLabel];
    for (let i = 1; i <= (source.count ?? 1); i++)
      result.push({ key: `${source.group}:${source.id}:${i}`, tone: source.group, label, name: (copy as Copy)[source.id]!.name, target: '.bishop-pill' });
  }
  for (const special of bishopSpecials(state))
    result.push({ key: `special:${special.id}:${special.source?.id ?? ''}`, tone: 'special', label: b.specialsLabel, name: (b.specials as Copy)[special.id]!.name, target: `.bishop-special[data-special="${special.id}"]` });
  return result;
}

function land(root: HTMLElement, selector: string): void {
  const target = root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('.bishop-pill');
  if (!target) return;
  target.classList.remove('bishop-land');
  void target.offsetWidth;
  target.classList.add('bishop-land');
  target.addEventListener('animationend', () => target.classList.remove('bishop-land'), { once: true });
}

// The target's centre; a chip scrolled out of the phone tray aims at the tray.
function aim(root: HTMLElement, selector: string): DOMRect | null {
  const target = root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('.bishop-pill');
  if (!target) return null;
  const box = target.getBoundingClientRect();
  const tray = target.closest('.status-tray')?.getBoundingClientRect();
  return tray && (box.right > tray.right || box.left < tray.left) ? tray : box;
}

/** Flies effects that appeared since `seen` from the desk into their place.
 *  Returns the keys now on screen; `null` (a fresh run) only records them. */
export function flyArrivals(root: HTMLElement, state: State, seen: Set<string> | null): Set<string> {
  const now = arrivals(state);
  const keys = new Set(now.map((a) => a.key));
  if (!seen) return keys;
  const fresh = now.filter((a) => !seen.has(a.key));
  if (!fresh.length) return keys;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const paper = root.querySelector('.document')?.getBoundingClientRect();
  const x = paper ? paper.left + paper.width / 2 : innerWidth / 2;
  const y0 = paper ? paper.top + paper.height * 0.32 : innerHeight * 0.4;
  fresh.forEach((arrival, i) => {
    const to = aim(root, arrival.target);
    if (reduced || !to || typeof document.body.animate !== 'function') {
      land(root, arrival.target);
      return;
    }
    const y = y0 + (i - (fresh.length - 1) / 2) * 52;
    const chip = document.createElement('div');
    chip.className = 'bishop-fly';
    chip.dataset.tone = arrival.tone;
    chip.setAttribute('aria-hidden', 'true');
    chip.innerHTML = `<small>${escape(arrival.label)}</small><span>${escape(arrival.name)}</span>`;
    chip.style.left = `${x}px`;
    chip.style.top = `${y}px`;
    document.body.append(chip);
    const dx = to.left + to.width / 2 - x;
    const dy = to.top + to.height / 2 - y;
    const at = 'translate(-50%, -50%)';
    const flight = chip.animate(
      [
        { transform: `${at} scale(0.3)`, opacity: 0, offset: 0 },
        { transform: `${at} scale(1.12)`, opacity: 1, offset: 0.13, easing: 'ease-out' },
        { transform: `${at} scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `${at} scale(1)`, opacity: 1, offset: 0.58, easing: 'cubic-bezier(0.55, 0, 0.8, 0.2)' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.22)`, opacity: 0.35, offset: 1 },
      ],
      { duration: 1150, delay: i * 160, fill: 'backwards' },
    );
    flight.onfinish = () => {
      chip.remove();
      land(root, arrival.target);
    };
    flight.oncancel = () => chip.remove();
  });
  return keys;
}
