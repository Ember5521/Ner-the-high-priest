import { format, system } from '../i18n';
import { bishopSources, bishopEra, type BishopNotice } from '../core/bishop';
import type { Gauge, State } from '../core/state';
import { escape } from './art';

type Copy = { name: string; desc: string };
const entry = (group: 'omens' | 'blessings' | 'flows', id: string): Copy =>
  (system.bishop[group] as Record<string, Copy>)[id]!;
const number = (n: number) => String(Number(n.toFixed(2)));
const direction = (n: number) => n > 1 ? 'out' : n < 1 ? 'in' : '';
export function bishopBar(state: State): string {
  if (!state.bishop) return '';
  const b = state.bishop;
  const sources = bishopSources(state);
  const n = sources.reduce((v, x) => v + (x.count ?? 1), 0);
  const count = n ? format(system.bishop.multCount, { n }) : system.bishop.multNone;
  const flow = b.flow ? format(system.bishop.flowShort, { name: entry('flows', b.flow.id).name, n: b.flow.until - state.year }) : '';
  return `<button type="button" class="bishop-pill" data-flow="${b.flow?.id ?? ''}"${b.flowNew ? ' data-fresh' : ''} aria-haspopup="dialog" aria-expanded="false" aria-label="${escape([system.bishop.multChip, count, flow].filter(Boolean).join(' '))}"><span class="bishop-pill-text">${escape(system.bishop.multChip)}</span><b class="bishop-pill-count"${n ? '' : ' data-none'}>${escape(count)}</b>${flow ? `<span class="bishop-pill-flow">${escape(flow)}</span>` : ''}</button>`;
}
export function bishopSheet(state: State): string {
  if (!state.bishop) return '';
  const sources = bishopSources(state);
  const factorLine = (source: typeof sources[number]) => `<span class="bishop-factors">${system.gauges.flatMap((g) => (['gain', 'loss'] as const).flatMap((side) => {
    const n = source.factors[g.key as Gauge]?.[side];
    return n === undefined ? [] : [`<i data-gauge="${g.key}" data-side="${side}" data-dir="${direction(n)}">${escape(g.label)} ${side === 'gain' ? '▲' : '▼'}×${number(n)}</i>`];
  })).join('')}</span>`;
  const row = (source: typeof sources[number]) => {
    const copy = source.group === 'status' ? system.statuses[source.id as keyof typeof system.statuses] : entry(source.group === 'omen' ? 'omens' : 'blessings', source.id);
    return `<div class="bishop-entry" data-${source.group}="${escape(source.id)}"><b>${escape(copy.name)}</b>${(source.count ?? 1) > 1 ? `<b class="bishop-repeat">${source.count}</b>` : ''}<p>${escape(copy.desc)}</p>${factorLine(source)}</div>`;
  };
  const flow = sources.find((x) => x.group === 'flow');
  const status = sources.filter((x) => x.group === 'status');
  const baseRow = (copy: {name: string; desc: string}, desc = copy.desc) => `<div class="bishop-entry"><b>${escape(copy.name)}</b><p>${escape(desc)}</p></div>`;
  return `<div class="bishop-sheet" role="dialog" aria-modal="true" aria-label="${escape(system.bishop.flowLabel)}" hidden><article class="bishop-sheet-panel"><button type="button" class="bishop-sheet-close">${escape(system.ui.close)}</button><section class="bishop-flow"><h2>${escape(system.bishop.flowLabel)}</h2>${flow ? `<b>${escape(format(system.bishop.flowLeft, { name: entry('flows', flow.id).name, n: flow.left! }))}</b><p>${escape(entry('flows', flow.id).desc)}</p>${factorLine(flow)}` : `<p>${escape(system.bishop.calm)}</p>`}</section><section class="bishop-omens"><h2>${escape(system.bishop.omenLabel)}</h2>${sources.filter((x) => x.group === 'omen').map(row).join('')}</section><section class="bishop-blessings"><h2>${escape(system.bishop.blessingLabel)}</h2>${sources.filter((x) => x.group === 'blessing').map(row).join('')}</section>${status.length ? `<section class="bishop-statuses"><h2>${escape(system.bishop.statusLabel)}</h2>${status.map(row).join('')}</section>` : ''}<section class="bishop-base">${baseRow(system.bishop.era, format(system.bishop.era.desc, { x: number(bishopEra(state.year)) }))}${baseRow(system.bishop.base)}</section></article></div>`;
}
export function bishopNotice(notice: BishopNotice | undefined): string {
  if (!notice) return '';
  const copy = system.bishop.notice[notice.kind];
  const item = notice.kind === 'omen' ? entry('omens', notice.id) : null;
  const name = item ? item.name : (copy as { title: string }).title;
  const desc = item ? item.desc : (copy as { text: string }).text;
  return `<div class="bishop-notice" data-kind="${notice.kind}" role="dialog" aria-modal="true" aria-labelledby="bishop-notice-title"><article class="scene-card"><p class="scene-head">${escape(copy.header)}</p><h2 id="bishop-notice-title">${escape(name)}</h2><p>${escape(desc)}</p><button class="bishop-notice-next">${escape(copy.button)}</button></article></div>`;
}
export function bishopChoices(ids: string[]): string {
  return ids
    .map((id, i) => {
      const copy = entry('blessings', id);
      return `<div class="bishop-choice" data-side="${i === 0 ? 'reject' : 'approve'}" data-blessing="${id}"><b>${escape(copy.name)}</b><span>${escape(copy.desc)}</span></div>`;
    })
    .join('');
}
