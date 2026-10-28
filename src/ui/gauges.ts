import { bishopTotals, arrowCount } from '../core/bishop';
import { playSound, resetDocumentSounds } from './sound';
import { escape } from './art';
import { resultStatus, statusGauges, statusesReplacedBy } from '../core/status';
import { boundary } from '../core/state';
import { choiceEffects, effectiveEraScale, hasHyean, mendEffects } from '../core/loop';
import { system, format } from '../i18n';
import { DANGER_LOW, DANGER_HIGH, END_YEAR, GAUGE_KEYS } from '../core/config';
import type { Document, Gauge, State } from '../core/state';
import type { ToolAction as Action } from './tools';
import { art, artUrl, iconArt } from './art';

export interface Preview {
  gauge: Gauge;
  dir: 'up' | 'down';
  size: number;
  mend?: boolean;
  understudy?: boolean;
}

export function previewFor(
  card: Document,
  choice: Action | null,
  gauges?: State['gauges'],
  year = 0,
  statuses: State['statuses'] = [],
  state?: State,
): Preview[] {
  if (
    !choice ||
    choice === 'axe' ||
    choice === 'bullet' ||
    choice === 'alice' ||
    choice === 'scope'
  )
    return [];
  const exact = state ? hasHyean(state) : false;
  const shown =
    state && !exact
      ? {
          ...state,
          boons: {
            ...state.boons,
            understudy: undefined,
          },
        }
      : state;
  const effects = gauges
    ? choiceEffects(
        card[choice],
        gauges,
        card.kind,
        year,
        statuses,
        shown,
        card,
      )
    : card[choice].effects;
  return GAUGE_KEYS.flatMap((gauge) => {
    const delta = effects[gauge] ?? 0;
    return delta === 0
      ? []
      : [
          {
            gauge,
            ...(gauges && mendEffects(card[choice].mend, gauges)[gauge]
              ? { mend: true }
              : {}),
            ...(state?.boons.understudy &&
            (exact || (state.boons.intuition?.left ?? 0) > 0) &&
            gauges &&
            understudyDamped(card[choice], gauges, card, year, statuses, state, gauge)
              ? { understudy: true }
              : {}),
            dir: delta > 0 ? ('up' as const) : ('down' as const),
            size: Math.abs(delta) as Preview['size'],
          },
        ];
  });
}

// Whether the understudy changes this choice for one gauge (or any gauge).
export function understudyDamped(
  result: Document['reject'],
  gauges: State['gauges'],
  card: Document,
  year: number,
  statuses: State['statuses'],
  state: State,
  only?: Gauge,
): boolean {
  if (!state.boons.understudy) return false;
  const run = (s: State) =>
    choiceEffects(result, gauges, card.kind, year, statuses, s, card);
  const softened = run(state);
  const plain = run({
    ...state,
    boons: { ...state.boons, understudy: undefined },
  });
  return GAUGE_KEYS.some(
    (g) => (!only || g === only) && (softened[g] ?? 0) !== (plain[g] ?? 0),
  );
}

// Resolved against the page: a relative url() in a custom property would
// resolve against the stylesheet instead.
export const maskUrl = (key: Gauge) =>
  new URL(artUrl(art.icons[key]) ?? '', document.baseURI).href;

export function gaugesMarkup(state: State): string {
  return `
    <section class="gauges" aria-label="${escape(system.ui.kingdomStatus)}">
      ${system.gauges
        .map((g) => {
          const key = g.key as Gauge;
          const value = state.gauges[key];
          const totals = state.bishop ? bishopTotals(state)[key] : null;
          const tip = totals ? format(system.bishop.arrowTip, { gauge: g.label, gain: String(Number(totals.gain.toFixed(2))), loss: String(Number(totals.loss.toFixed(2))) }) : '';
          const mult = (side: 'gain' | 'loss') => {
            if (!totals) return '';
            const m = totals[side], n = arrowCount(m);
            return `<span class="mult" data-side="${side}"${n ? ` data-dir="${m > 1 ? 'out' : 'in'}"` : ''} data-n="${n}" title="${escape(tip)}" aria-hidden="true">${'<i></i>'.repeat(n)}</span>`;
          };
          const active = state.statuses.filter((s) =>
            statusGauges(s).includes(key),
          );
          const status = active[0];
          const badge = active
            .map((status) => {
              const copy =
                status &&
                system.statuses[status.id as keyof typeof system.statuses];
              const tick = status?.tick?.[key];
              const delayed = status?.delayed?.[key];
              const shape =
                tick !== undefined
                  ? tick > 0
                    ? 'up'
                    : 'down'
                  : delayed !== undefined
                    ? 'bomb'
                    : status?.freeze === key
                      ? 'freeze'
                      : 'diamond';
              const dir =
                delayed !== undefined && tick === undefined
                  ? ` data-dir="${delayed > 0 ? 'up' : 'down'}"`
                  : '';
              return status && copy
                ? `<span class="status-badge" tabindex="0" data-tip data-tip-title="${escape(copy.name)}" data-tip-text="${escape(copy.desc)}" data-status="${escape(status.id)}" data-shape="${shape}"${dir} title="${escape(copy.name)} — ${escape(copy.desc)}" aria-label="${escape(copy.name)}, ${escape(format(system.ui.documentCount, { n: status.left }))}"><i aria-hidden="true"></i><b aria-hidden="true">${status.left}</b></span>`
                : '';
            })
            .join('');
          return `
          <div class="gauge ${value <= DANGER_LOW || value >= DANGER_HIGH ? 'extreme' : ''}${value <= DANGER_LOW ? ' danger-low' : value >= DANGER_HIGH ? ' danger-high' : ''}${status ? ' has-status' : ''}" data-gauge="${key}"${state.blindfold === key ? ' data-blindfold' : ''} title="${g.label}">
            <span class="preview-dot" hidden></span>
            ${mult('loss')}
            <div class="resource-icon" style="--icon:url('${maskUrl(key)}')" role="meter" aria-label="${escape(g.label + (tip ? ', ' + tip : '') + (value <= DANGER_LOW ? ', ' + format(system.ui.gaugeDangerLow, { gauge: g.label }) : value >= DANGER_HIGH ? ', ' + format(system.ui.gaugeDangerHigh, { gauge: g.label }) : ''))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
              <div class="resource-empty" aria-hidden="true">${iconArt(key)}</div>
              <div class="resource-fill" style="clip-path:inset(${100 - value}% 0 0)" aria-hidden="true">${iconArt(key)}</div>
            </div>
            ${mult('gain')}
            ${state.blindfold === key ? `<span class="blindfold-mark" draggable="true" data-blindfold-item aria-label="${escape(system.boons.blindfold.name)}"></span>` : ''}
            ${badge ? `<span class="status-badges">${badge}</span>` : ''}
            ${hasHyean(state) ? `<span class="gauge-value">${value}</span>` : ''}
            <span class="gauge-label">${g.label}</span>
          </div>`;
        })
        .join('')}
      ${(state.boons.bandage ?? 0) > 0 ? `<button type="button" class="item-slot bandage-slot" draggable="true" data-bandage-item data-tip data-tip-title="${escape(system.boons.bandage.name)}" data-tip-text="${escape(system.boons.bandage.desc)}" aria-label="${escape(system.boons.bandage.name + ' ' + system.boons.bandage.desc)}" aria-disabled="${!!(state.ending || state.scene || state.sleep || state.bishop?.notices.length || GAUGE_KEYS.every(key => state.gauges[key] === 50))}"><span class="item-tag"><i aria-hidden="true"></i><b>${state.boons.bandage}</b></span></button>` : ''}
      ${(state.boons.blindfold ?? 0) > 0 ? `<button type="button" class="item-slot blindfold-slot" draggable="true" data-blindfold-item data-tip data-tip-title="${escape(system.boons.blindfold.name)}" data-tip-text="${escape(system.boons.blindfold.desc)}" aria-label="${escape(system.boons.blindfold.name)}"><span class="item-tag"><i aria-hidden="true"></i><b>${state.boons.blindfold}</b></span></button>` : ''}
    </section>`;
}
export function updateGaugePreview(
  root: HTMLElement,
  card: Document | null,
  aim: Action | null,
  dim = false,
  state?: State,
): void {
  const preview = card
    ? previewFor(card, aim, state?.gauges, state?.year, state?.statuses, state)
    : [];
  const status =
    card && (aim === 'approve' || aim === 'reject')
      ? state
        ? resultStatus(card[aim], state.gauges)
        : card[aim].status
      : undefined;
  root
    .querySelectorAll('.status-ending')
    .forEach((el) => el.classList.remove('status-ending'));
  if (state && card && status && (aim === 'approve' || aim === 'reject')) {
    const effects = choiceEffects(
      card[aim],
      state.gauges,
      card.kind,
      state.year,
      state.statuses,
      state,
      card,
    );
    const gauges = { ...state.gauges };
    if (card.axe !== 'free')
      for (const gauge of GAUGE_KEYS) gauges[gauge] += effects[gauge] ?? 0;
    const ticks =
      (card.kind !== 'story' ||
        (card.years > 0 &&
          card[aim].schedule?.years !== 0 &&
          (state.mode === 'bishop' || state.year < END_YEAR))) &&
      (!boundary(gauges) || Boolean(state.boons.stitch));
    const surviving = ticks
      ? state.statuses.filter((s) => s.left > 1 || s.id === 'sugar_cut')
      : state.statuses;
    const replaced = statusesReplacedBy(surviving, status);
    root.querySelectorAll<HTMLElement>('.status-badge').forEach((el) => {
      el.classList.toggle(
        'status-ending',
        replaced.some((s) => s.id === el.dataset.status),
      );
    });
    root.querySelector('.tool.axe')?.classList.toggle(
      'status-ending',
      replaced.some((s) => s.axeLock),
    );
  }
  root
    .querySelector('.tool.axe')
    ?.classList.toggle('status-lock-preview', Boolean(status?.axeLock));
  const markFor = (gauge: Gauge) => {
    const witch = card && (aim === 'approve' || aim === 'reject') && (card[aim].witchPress || card[aim].witchDrift);
    if (witch) return '<i class="status-mark"></i>';
    if (
      !status ||
      !(
        gauge in (status.tick ?? {}) ||
        gauge in (status.delayed ?? {}) ||
        status.scale?.gauge === gauge ||
        status.freeze === gauge
      )
    )
      return '';
    return `<i class="status-mark"></i>`;
  };
  root.querySelectorAll<HTMLElement>('.gauge').forEach((el) => {
    const dot = el.querySelector<HTMLElement>('.preview-dot')!;
    const change = preview.find((p) => p.gauge === el.dataset.gauge);
    const exact = state ? hasHyean(state) : false;
    dot.toggleAttribute('data-mend', !!change?.mend && (exact || !(state?.boons.intuition?.left)));
    dot.toggleAttribute('data-understudy', !!change?.understudy);
    dot.toggleAttribute('data-intuition', !exact && (state?.boons.intuition?.left ?? 0) > 0);
    dot.classList.toggle('exact', exact);
    dot.textContent =
      exact && change ? `${change.dir === 'up' ? '+' : '−'}${change.size}` : '';
    const mark =
      state?.blindfold === el.dataset.gauge
        ? ''
        : markFor(el.dataset.gauge as Gauge);
    dot.hidden = !change && !mark;
    el.classList.toggle('affected', Boolean(change || mark));
    if (!change) {
      dot.removeAttribute('aria-label');
      dot.removeAttribute('data-rings');
      dot.removeAttribute('data-tier');
      dot.removeAttribute('data-dir');
      dot.removeAttribute('data-size');
      dot.style.removeProperty('--preview-size');
      dot.removeAttribute('data-pips');
      dot.innerHTML = mark;
      return;
    }
    const intuition = !exact && (state?.boons.intuition?.left ?? 0) > 0;
    const hideSize = intuition || dim;
    const coloured = intuition;
    const result =
      card && (aim === 'approve' || aim === 'reject') ? card[aim] : null;
    const scaled =
      state?.mode !== 'bishop' &&
      (card?.kind === 'daily' ||
        card?.kind === 'special' ||
        card?.kind === 'speaki') &&
      !result?.adjust &&
      !result?.mend &&
      !state?.statuses.some((s) => s.scale?.gauge === change.gauge);
    const base = Math.abs(result?.effects[change.gauge] ?? 0);
    const midpoints = [1, 1.4, 1.75, 2.1];
    const multiplier = effectiveEraScale(state?.year ?? 0, state?.mode);
    // One tier per 50-year era (x1.0 / 1.2 / 1.35 / 1.5): calm, a warm rim,
    // smouldering, burning.
    const tier = scaled
      ? multiplier < 1.1
        ? 1
        : multiplier < 1.3
          ? 2
          : multiplier < 1.45
            ? 3
            : 4
      : change.size <= 20
        ? 1
        : change.size <= 28
          ? 2
          : change.size <= 35
            ? 3
            : 4;
    // One pip per 5 of the card's own value (1–4); the era multiplier only
    // changes how hot the pips glow, so the count always stays readable.
    const pips = exact
      ? Math.ceil(change.size / 5)
      : hideSize
        ? 0
        : Math.min(
            4,
            Math.max(
              1,
              Math.ceil(
                scaled ? base / 5 : change.size / (5 * midpoints[tier - 1]!),
              ),
            ),
          );
    const approx = scaled
      ? Math.round((base * multiplier) / 5) * 5
      : change.size;
    if (intuition) dot.removeAttribute('data-pips');
    else dot.dataset.pips = String(pips);
    dot.removeAttribute('data-rings');
    dot.style.removeProperty('--preview-size');
    if (exact) {
      dot.removeAttribute('data-tier');
      dot.dataset.size = String(
        change.size <= 5 ? 5 : change.size <= 10 ? 10 : 20,
      );
      dot.dataset.dir = change.dir;
    } else {
      if (intuition) dot.removeAttribute('data-tier');
      else dot.dataset.tier = String(tier);
      dot.removeAttribute('data-size');
      if (coloured) dot.dataset.dir = change.dir;
      else dot.removeAttribute('data-dir');
      dot.innerHTML = intuition ? '<span class="pips" aria-hidden="true"><i></i></span>' : hideSize
        ? '<span class="pips unknown" aria-hidden="true">?</span>'
        : `<span class="pips" aria-hidden="true">${'<i></i>'.repeat(pips)}</span>`;
    }
    if (change.mend) {
      dot.removeAttribute('data-pips');
      if (!exact && !intuition) dot.innerHTML = '';
    }
    dot.insertAdjacentHTML('beforeend', mark);
    dot.setAttribute(
      'aria-label',
      exact
        ? format(system.ui.exactChange, {
            dir: change.dir === 'up' ? system.ui.increase : system.ui.decrease,
            n: change.size,
          })
        : intuition
          ? (change.dir === 'up' ? system.ui.increase : system.ui.decrease)
          : coloured
          ? format(system.ui.approxChange, {
              dir:
                change.dir === 'up' ? system.ui.increase : system.ui.decrease,
              n: approx,
            })
          : hideSize
            ? system.ui.unknownChange
            : format(system.ui.unknownApproxChange, { n: approx }),
    );
  });
}
export function animateGauges(
  root: HTMLElement,
  oldGauges: State['gauges'],
  newGauges: State['gauges'],
): void {
  resetDocumentSounds();
  const reduce = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let changed = 0;
  GAUGE_KEYS.forEach((key) => {
    const from = oldGauges[key],
      to = newGauges[key];
    if (from === to) return;
    playSound('tick', changed++ * 60, to > from ? 'gain' : 'loss');
    if (reduce) return;
    const gauge = root.querySelector<HTMLElement>(`[data-gauge="${key}"]`);
    gauge?.classList.add(to > from ? 'gain' : 'loss');
    const overshoot = Math.max(0, Math.min(100, to + Math.sign(to - from) * 7));
    gauge
      ?.querySelector('.resource-fill')
      ?.animate(
        [
          { clipPath: `inset(${100 - from}% 0 0)` },
          { clipPath: `inset(${100 - overshoot}% 0 0)`, offset: 0.7 },
          { clipPath: `inset(${100 - to}% 0 0)` },
        ],
        { duration: 460, easing: 'ease-out', fill: 'forwards' },
      );
  });
}
