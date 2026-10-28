import { choiceEffects } from '../core/loop';
import { statusGauges } from '../core/status';
import { GAUGE_KEYS } from '../core/config';
import type { Gauge, State } from '../core/state';
import { playSound } from './sound';

// The gauges the stamped side will move: its effects (already scoped), the
// gauges its lingering effect touches, or every gauge for Fricle's push.
function targets(state: State, side: 'reject' | 'approve'): Gauge[] {
  const card = state.current;
  if (!card) return [];
  const result = card[side];
  const effects = choiceEffects(result, state.gauges, card.kind, state.year, state.statuses, state, card);
  const hit = new Set(GAUGE_KEYS.filter((key) => effects[key]));
  if (result.status) for (const key of statusGauges(result.status)) hit.add(key);
  if (result.witchPress || result.witchDrift) GAUGE_KEYS.forEach((key) => hit.add(key));
  return GAUGE_KEYS.filter((key) => hit.has(key));
}

/** Fires the scope: a blue tracer streaks from the reticle up to every gauge
 *  the stamp will move, and each one flashes as it is hit. Call it before the
 *  reticle is removed so the shots start from its centre. */
export function scopeShot(root: HTMLElement, state: State, side: 'reject' | 'approve'): void {
  const from = (root.querySelector('.scope-reticle') ?? root.querySelector('.document'))?.getBoundingClientRect();
  const icons = targets(state, side)
    .map((key) => root.querySelector<HTMLElement>(`[data-gauge="${key}"] .resource-icon`))
    .filter((el): el is HTMLElement => !!el);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const hit = (icon: HTMLElement) => {
    icon.classList.remove('scope-hit');
    void icon.offsetWidth;
    icon.classList.add('scope-hit');
    icon.addEventListener('animationend', () => icon.classList.remove('scope-hit'), { once: true });
  };
  if (!from || reduced || typeof document.body.animate !== 'function') {
    icons.forEach(hit);
    return;
  }
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  icons.forEach((icon, i) => {
    const to = icon.getBoundingClientRect();
    const dx = to.left + to.width / 2 - x;
    const dy = to.top + to.height / 2 - y;
    const angle = Math.atan2(dy, dx);
    const tracer = document.createElement('div');
    tracer.className = 'scope-tracer';
    tracer.setAttribute('aria-hidden', 'true');
    tracer.style.left = `${x}px`;
    tracer.style.top = `${y}px`;
    document.body.append(tracer);
    const shot = tracer.animate(
      [
        { transform: `translate(-100%, -50%) rotate(${angle}rad)`, opacity: 1, transformOrigin: '100% 50%' },
        { transform: `translate(calc(${dx}px - 100%), calc(${dy}px - 50%)) rotate(${angle}rad)`, opacity: 1, transformOrigin: '100% 50%', offset: 0.85 },
        { transform: `translate(calc(${dx}px - 100%), calc(${dy}px - 50%)) rotate(${angle}rad)`, opacity: 0, transformOrigin: '100% 50%' },
      ],
      { duration: 260, delay: i * 45, easing: 'cubic-bezier(0.3, 0, 0.7, 1)', fill: 'backwards' },
    );
    shot.onfinish = () => {
      tracer.remove();
      hit(icon);
    };
    shot.oncancel = () => tracer.remove();
  });
}

/** Fires the scope when the stamp lands: call it right after playAction(),
 *  which sets the desk's --contact to the moment the stamp meets the paper.
 *  The reticle stays until then; the shot sound and tracers go at contact. */
export function fireScopeOnContact(root: HTMLElement, state: State, side: 'reject' | 'approve'): void {
  const desk = root.querySelector<HTMLElement>('.desk');
  const contact = parseFloat(desk?.style.getPropertyValue('--contact') ?? '') || 0;
  setTimeout(() => {
    playSound('shot');
    scopeShot(root, state, side);
    root.querySelector('.scope-reticle')?.remove();
  }, contact);
}
