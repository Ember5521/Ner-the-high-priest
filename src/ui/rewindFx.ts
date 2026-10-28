import { playSound } from './sound';
import { escape } from './art';
import { system, format } from '../i18n';
import { uiUrl } from './art';

// Linua's rewind: clock hands spin backwards while the priests' stamped
// documents swirl away. onSwap fires behind the opaque overlay so the
// rewound state can render underneath; tap or any key skips ahead.
export function playRewindFx(
  from: number,
  to: number,
  onSwap: () => void,
): Promise<void> {
  playSound('rewind');
  const reduce =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const T = reduce
    ? { spin: 0, clockOut: 0.6, flash: 0.5, out: 0.9, end: 1400 }
    : { spin: 2.3, clockOut: 2.75, flash: 2.7, out: 3.05, end: 3600 };
  const size = Math.round(
    Math.min(window.innerWidth * 0.6, window.innerHeight * 0.34, 260),
  );
  const stamps = [uiUrl('stampApprove'), uiUrl('stampReject')];
  const fx = document.createElement('div');
  fx.className = 'rewind-fx';
  fx.setAttribute('role', 'status');
  fx.setAttribute(
    'aria-label',
    format(system.ui.rewindAnnouncement, { from, to }),
  );
  fx.style.cssText = `--size:${size}px;--spin:${T.spin}s;--clock-out:${T.clockOut}s;--flash:${T.flash}s;--out:${T.out}s;--m0:${(from * 37) % 360}deg;--h0:${(from * 13) % 360}deg`;

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    return `<line x1="100" y1="${major ? 14 : 15}" x2="100" y2="${major ? 26 : 20}" stroke-width="${major ? 3.2 : 1.2}" transform="rotate(${i * 6} 100 100)"/>`;
  }).join('');
  const hand = (cls: string, len: number, width: number) =>
    `<g class="fx-hand ${cls}"><line x1="100" y1="${100 + width * 4}" x2="100" y2="${100 - len}" stroke-width="${width}"/></g>`;
  const span = (a: number, b: number) => a + Math.random() * (b - a);
  const reach = Math.max(window.innerWidth, window.innerHeight);
  const sheets = Array.from({ length: 18 }, (_, i) => {
    const stamp = stamps[i % 2];
    return `<div class="fx-swirl" style="--delay:${(0.3 + i * 0.075 + span(-0.03, 0.03)).toFixed(2)}s;--t:${span(1.25, 1.65).toFixed(2)}s;--s0:${span(-70, 70).toFixed(0)}deg;--turn:${span(260, 420).toFixed(0)}deg"><div class="fx-sheet" style="--r0:${(size * 0.62 + span(10, 60)).toFixed(0)}px;--r1:${(reach * span(0.62, 0.8)).toFixed(0)}px;--a0:${span(-12, 12).toFixed(0)}deg;--a1:${span(-260, -140).toFixed(0)}deg;--sr:${span(-25, 25).toFixed(0)}deg">${stamp ? `<img src="${stamp}" alt="" />` : ''}</div></div>`;
  }).join('');

  fx.innerHTML = `<div class="fx-ring" style="--d:0s"></div><div class="fx-ring" style="--d:0.45s"></div><div class="fx-ring" style="--d:0.9s"></div>
    <div class="fx-center">${sheets}<div class="fx-clock"><svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="fx-face" cx="100" cy="100" r="96"/>
      <circle class="fx-rim" cx="100" cy="100" r="88"/>
      <g class="fx-ticks">${ticks}</g>
      <g class="fx-ghost g2">${hand('fx-minute', 72, 3)}</g>
      <g class="fx-ghost g1">${hand('fx-minute', 72, 3)}</g>
      ${hand('fx-hour', 46, 6)}${hand('fx-minute', 72, 3)}
      <circle class="fx-pin" cx="100" cy="100" r="7"/>
    </svg></div></div>
    <p class="fx-head">${escape(system.ui.rewindHeader)}</p>
    <p class="fx-year"><b>${from}</b><small>${escape(system.ui.yearSuffix)}</small></p>
    <div class="fx-flash"></div>`;
  document.body.append(fx);

  // the year counts down while the hands spin
  const year = fx.querySelector<HTMLElement>('.fx-year b')!;
  const steps = Math.max(0, from - to);
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (let k = 1; k <= steps; k++) {
    const at = reduce ? 300 : 350 + T.spin * 1000 * (0.25 + (0.7 * k) / steps);
    timers.push(
      setTimeout(() => {
        year.textContent = String(from - k);
        year.classList.remove('tick');
        void year.offsetWidth;
        year.classList.add('tick');
      }, at),
    );
  }
  return new Promise((resolve) => {
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      onSwap();
    };
    const finish = () => {
      timers.forEach(clearTimeout);
      swap();
      fx.remove();
      removeEventListener('keydown', key, true);
      resolve();
    };
    const key = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };
    timers.push(
      setTimeout(swap, T.flash * 1000 + 120),
      setTimeout(finish, T.end),
    );
    fx.addEventListener('click', finish);
    addEventListener('keydown', key, true);
  });
}
