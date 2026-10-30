import { bishopBar, bishopNotice, bishopSheet } from './bishop';
import { answerCard, bishopConfig, bishopCurve, bishopSpecials } from '../core/bishop';
import { loadSettings } from '../save/storage';
import { format, system } from '../i18n';
import rawCards from '../../data/cards/m1.json';
import { canRerollDaily } from '../core/deck';
import type { Card, State } from '../core/state';
import { effectiveEraScale, hasHyean } from '../core/loop';
import { END_YEAR } from '../core/config';
import { art, artUrl, artSlot, escape } from './art';
import { docKindClass, documentMarkup } from './document';
import { gaugesMarkup } from './gauges';
import { toolsMarkup } from './tools';
import { bestYearText } from './screens';

export function sceneMarkup(id: string | null): string {
  const scene = system.scenes[id as keyof typeof system.scenes];
  return scene
    ? `<div class="scene" role="dialog" aria-modal="true" aria-labelledby="scene-title">
        <article class="scene-card">
          <p class="scene-head">${escape(scene.header)}</p>
          <div class="scene-art">${artSlot('ui', scene.art, `<span class="scene-placeholder">${escape(scene.title)}</span>`)}</div>
          <h2 id="scene-title">${escape(scene.title)}</h2>
          <div class="scene-lines">${scene.lines.map((line) => `<p class="scene-line"><b>${escape(line.name)}</b><span>${escape(line.text)}</span></p>`).join('')}</div>
          <button class="scene-next">${escape(scene.button)}</button>
        </article>
      </div>`
    : '';
}

export function rewindMarkup(boss = false): string {
  const prompt = {
    ...system.rewindPrompt,
    ...(boss ? system.rewindPrompt.boss : {}),
  };
  return `<div class="scene rewind" role="dialog" aria-modal="true" aria-labelledby="scene-title"><article class="scene-card"><p class="scene-head">${escape(prompt.header)}</p><div class="scene-art">${artSlot('ui', prompt.art, `<span class="scene-placeholder">${escape(prompt.title)}</span>`)}</div><h2 id="scene-title">${escape(prompt.title)}</h2><div class="scene-lines">${prompt.lines.map((line) => `<p class="scene-line"><b>${escape(line.name)}</b><span>${escape(line.text)}</span></p>`).join('')}</div><div class="scene-actions"><button class="scene-next" data-rewind="yes">${escape(prompt.yes)}</button><button class="scene-alt" data-rewind="no">${escape(prompt.no)}</button></div></article></div>`;
}

function atmosphere(state: State): { dread: number; finale?: number } {
  if (state.mode === 'bishop') return { dread: 0 };
  const card = state.current!;
  const dread = state.boss ? Math.min(1, (state.boss.done + 1) / 10) : 0;
  const finale =
    state.year >= END_YEAR && card.kind === 'story'
      ? card.trigger?.order
      : undefined;
  return { dread, finale };
}
/**
 * How far the hall has drifted toward dusk, 0..1, following the effect
 * multiplier: the story's 50-year steps (×1 → ×1.5) or the bishop's wave.
 */
function eraTint(state: State): number {
  const tint =
    state.mode === 'bishop'
      ? (bishopCurve(state.year, bishopConfig.scale) - 1) / 0.6
      : (effectiveEraScale(state.year, state.mode) - 1) / 0.5;
  return Math.max(0, Math.min(1, tint));
}

function embersMarkup(dread: number, finale?: number): string {
  if (!dread) return '';
  const count = finale ? 26 : Math.round(6 + dread * 14);
  // fixed pseudo-random spread so re-renders don't jump
  const embers = Array.from({ length: count }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const delay = ((i * 53) % 70) / 10;
    const time = 4.5 + ((i * 29) % 30) / 10;
    const size = 2 + ((i * 7) % 3);
    const drift = ((i * 17) % 40) - 20;
    return `<i style="--x:${x}%;--d:-${delay}s;--t:${time}s;--s:${size}px;--drift:${drift}px"></i>`;
  }).join('');
  return `<div class="embers" aria-hidden="true">${embers}</div>`;
}

export function deskMarkup(
  state: State,
  bestYear = state.bestYear,
  cards: Card[] = rawCards as Card[],
): string {
  const card = state.current!.blessings
    ? answerCard(state.current!.blessings)
    : state.current!;
  const asleep = state.sleep > 0 && !card.blessings;
  const { dread, finale } = atmosphere(state);
  return `<main data-drowse="${state.drowse.stack}" class="desk ${hasHyean(state) ? 'boon-hyean' : ''} ${docKindClass(card)} ${card.kind === 'story' ? 'approve-both' : ''} ${asleep ? 'sleeping' : ''} ${dread ? 'dread' : ''}" style="--dread:${dread.toFixed(2)};--era:${eraTint(state).toFixed(2)}"${finale ? ` data-finale="${finale}"` : ''}>
      <header class="topbar">
        <button class="menu-button" aria-label="${escape(system.ui.menuLabel)}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        ${boonsMarkup(state)}
        ${gaugesMarkup(state)}
        ${bishopBar(state)}
        <p class="year"><span class="year-label">${escape(system.ui.calendar)}</span> ${state.boss ? escape(format(system.ui.bossDay, { year: state.year, day: 1 + 3 * state.boss.done })) : `<b>${state.year}</b>${escape(system.ui.yearSuffix)}`}</p>
      </header>
      <section class="stage" aria-label="${escape(system.ui.documentStage)}">
        ${embersMarkup(dread, finale)}
        ${documentMarkup(card, state.boons.alice, asleep, canRerollDaily(state, cards), !!state.scoped, hasHyean(state) ? 'hyean' : (state.boons.intuition?.left ?? 0) > 0 ? 'intuition' : null, String(state.year))}
        ${toolsMarkup(
          card,
          state.drowse,
          (state.boons.bullet ?? 0) > 0,
          asleep,
          state.statuses.some((s) => s.axeLock),
          state.statuses.find((s) => s.axeLock)?.left,
          state.boons.scope ?? 0,
          !!state.scoped,
          !!state.scene || !!state.bishop?.notices.length,
          {
            boons: state.boons,
            blindfold: state.blindfold,
            bandageDisabled: !!(state.ending || state.scene || state.sleep || state.bishop?.notices.length || Object.values(state.gauges).every(value => value === 50)),
          },
        )}
        <p class="hint${!asleep && loadSettings().stampsSeen >= 5 ? ' hint-done' : ''}">${asleep ? system.ui.sleepHint : system.ui.stampHint}</p>
      </section>
      <div class="menu" role="dialog" aria-modal="true" aria-label="${escape(system.ui.menuLabel)}" hidden>
        <div class="menu-panel">
          <div class="menu-main">
            <p class="menu-title">${escape(system.menu.title)}</p>
            <p class="menu-back-note">${escape(system.menu.backNote)}</p>
            <p class="menu-status">${escape(format(system.title.continueDetail, { mode: system.modes[state.mode].name, year: state.year }))} <small>(${escape(system.menu.autosave)})</small></p>
            <div class="menu-icons">${MENU_ACTIONS.map(([action, label]) => `<button class="menu-item menu-icon" data-menu="${action}" aria-label="${escape(label())}">${MENU_ICONS[action]}<span>${escape(label())}</span></button>`).join('')}</div>
            <p class="menu-note"><span class="best-year">${escape(bestYearText(bestYear, state.mode))}</span><br>${escape(system.ui.recordsPreserved)}</p>
          </div>
          <div class="menu-confirm" hidden>
            <p class="menu-title"></p>
            <p class="menu-note">${escape(system.ui.runLost)}</p>
            <button class="menu-item danger" data-menu="confirm">${escape(system.ui.yes)}</button>
            <button class="menu-item" data-menu="back">${escape(system.ui.no)}</button>
          </div>
        </div>
      </div>
      ${bishopSheet(state)}
      <div class="tip" role="tooltip" hidden><b></b><span></span></div>
      ${state.bishop?.notices.length ? bishopNotice(state.bishop.notices[0]) : sceneMarkup(state.scene)}
    </main>`;
}

// Pause menu: one icon per action; the names sit small under each icon.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const MENU_ICONS = {
  resume: svg(
    '<path d="M6 5v14"/><path class="fill" d="M10 5.5 19 12l-9 6.5z"/>',
  ),
  options: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  restart: svg(
    '<path d="M3 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10"/>',
  ),
  title: svg(
    '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  ),
} as const;
const MENU_ACTIONS: [keyof typeof MENU_ICONS, () => string][] = [
  ['resume', () => system.menu.resume],
  ['options', () => system.title.options],
  ['restart', () => system.ui.restart],
  ['title', () => system.ui.backToTitle],
];
export function boonsMarkup(state: State): string {
  return `<div class="status-tray" role="list" aria-label="${escape(system.ui.kingdomStatus)}">${(
    Object.keys(system.boons) as (keyof typeof system.boons)[]
  )
    .filter(
      (id) =>
        id !== 'blindfold' && id !== 'bandage' &&
        (id === 'hyean' ? hasHyean(state) : state.boons[id]),
    )
    .map((id) => {
      const boon = system.boons[id];
      const path = artUrl((art.boons as Record<string, string>)[id]);
      const icon = path
        ? `<i class="boon-icon" style="--icon:url('${escape(new URL(path, document.baseURI).href)}')" aria-hidden="true"></i>`
        : '';
      const count =
        id === 'hyean' || id === 'intuition'
            ? state.boons[id]!.left
            : id === 'bullet' || id === 'scope'
              ? state.boons[id]
              : undefined;
      return `<button type="button" class="status-icon" role="listitem" data-boon="${id}" data-tip data-tip-title="${escape(boon.name)}" data-tip-text="${escape(boon.desc)}" aria-label="${escape(boon.name + ' ' + boon.desc + (count !== undefined ? ' ' + count : ''))}">${icon}${count !== undefined ? `<b>${count}</b>` : ''}</button>`;
    })
    .join('')}${bishopSpecials(state).map((special) => {
      const copy = (system.bishop.specials as Record<string, {name: string; desc: string}>)[special.id]!;
      const source = special.source ? (system.bishop[special.source.group === 'flow' ? 'flows' : 'blessings'] as Record<string, {name: string}>)[special.source.id]!.name + ' — ' : '';
      return `<button type="button" class="bishop-special" role="listitem" data-special="${escape(special.id)}" data-tip data-tip-title="${escape(copy.name)}" data-tip-text="${escape(source + copy.desc)}" aria-label="${escape(copy.name + '. ' + copy.desc)}"><i aria-hidden="true"></i><span>${escape(copy.name)}</span></button>`;
    }).join('')}</div>`;
}
