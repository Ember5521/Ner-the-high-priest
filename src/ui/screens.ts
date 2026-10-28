import { system, format } from '../i18n';
import type { Mode, State } from '../core/state';
import type { Collection } from '../save/storage';
import type { Gauge } from '../core/state';
import { art, artUrl, artSlot, escape, uiArt } from './art';
import { maskUrl } from './gauges';
type EndingEvent = { title: string; text: string };

const endingEvent = (id: string): EndingEvent =>
  id === 'true'
    ? system.trueEnding
    : (system.extraEndings.items[
        id as keyof typeof system.extraEndings.items
      ] ?? system.gameOvers[id as keyof typeof system.gameOvers]);

// Album pages: one per resource (its two extremes), then the special endings.
const albumParts = (): {
  title: string;
  items: { id: string; icon: Gauge; tag: string }[];
}[] => [
  ...system.gauges.map((g) => ({
    title: g.label,
    items: [
      // each resource names its own two extremes (famine / gluttony, unbelief / fanaticism…)
      {
        id: `${g.key}_low`,
        icon: g.key as Gauge,
        tag: system.ui.albumTags[g.key as Gauge].low,
      },
      {
        id: `${g.key}_high`,
        icon: g.key as Gauge,
        tag: system.ui.albumTags[g.key as Gauge].high,
      },
    ],
  })),
  {
    title: system.ui.specialEndings,
    items: [
      { id: 'sleep', icon: 'erpin', tag: system.ui.whileAsleep },
      { id: 'true', icon: 'faith', tag: system.ui.twoHundredYears },
      {
        id: 'purist',
        icon: 'faith',
        tag: system.extraEndings.items.purist.tag,
      },
      {
        id: 'reformed',
        icon: 'erpin',
        tag: system.extraEndings.items.reformed.tag,
      },
    ],
  },
];

function albumMarkup(found: string[], discovered: number, total: number) {
  const card = (
    item: ReturnType<typeof albumParts>[number]['items'][number],
  ) => {
    const open = found.includes(item.id);
    return `
      <button class="album-card ${open ? 'found' : 'locked'}" data-ending="${item.id}">
        <span class="album-icon" style="--icon:url('${maskUrl(item.icon)}')" aria-hidden="true"></span>
        ${open && artUrl(art.endings[item.id]) ? `<span class="album-art">${artSlot('endings', item.id, '')}</span>` : ''}
        <span class="album-tag">${item.tag}</span>
        <span class="album-title">${open ? escape(endingEvent(item.id).title) : '???'}</span>
      </button>`;
  };
  const detail = (
    item: ReturnType<typeof albumParts>[number]['items'][number],
  ) => {
    const open = found.includes(item.id);
    const event = endingEvent(item.id);
    return `
      <article class="album-detail ${open ? 'found' : 'locked'}" data-ending="${item.id}" hidden>
        <span class="album-icon" style="--icon:url('${maskUrl(item.icon)}')" aria-hidden="true"></span>
        ${open && artUrl(art.endings[item.id]) ? `<div class="album-picture">${artSlot('endings', item.id, '')}</div>` : ''}
        <p class="album-tag">${item.tag}</p>
        <h3>${open ? escape(event.title) : system.ui.unseenEnding}</h3>
        <p class="album-text">${escape(open ? event.text : ((system.endingHints as Record<string, string>)[item.id] ?? ''))}</p>
        ${open ? `<span class="album-ink" aria-hidden="true">${uiArt(['true', 'purist', 'reformed'].includes(item.id) ? 'stampApprove' : 'stampReject')}</span>` : ''}
      </article>`;
  };
  return `
    <div class="album" role="dialog" aria-modal="true" aria-label="${escape(system.ui.albumTitle)}" hidden>
      <div class="album-book">
        <header class="album-head">
          <h2>${escape(system.ui.albumTitle)}</h2>
          <span class="album-count">${discovered} / ${total}</span>
          <button class="album-close" aria-label="${escape(system.ui.close)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <div class="album-pages">
          ${albumParts()
            .map(
              (part) => `
            <section class="album-part">
              <h3>${part.title}</h3>
              <div class="album-grid">${part.items.map(card).join('')}</div>
            </section>`,
            )
            .join('')}
        </div>
        <div class="album-details">
          <button class="album-back">${escape(system.ui.albumBack)}</button>
          ${albumParts()
            .flatMap((part) => part.items.map(detail))
            .join('')}
        </div>
      </div>
    </div>`;
}

export function bestYearText(year: number, mode: Mode): string {
  // format(), not replace(): English plurals are written as {year|year|years}
  return format(system.modes.bestYear, { mode: system.modes[mode].name, year });
}

export function titleScreen(
  collection: Collection,
  mode: Mode = 'priest',
  saved: State | null = null,
): string {
  const bishopLocked =
    !collection.cleared.apprentice &&
    !collection.cleared.priest &&
    !collection.bishopUnlocked;
  const endings = [
    ...Object.entries(system.gameOvers),
    ['true', system.trueEnding] as const,
    ...Object.entries(system.extraEndings.items),
  ];
  const discovered = collection.endings.filter((id) =>
    endings.some(([key]) => key === id),
  ).length;
  return `
    <main class="title-screen">
      <button class="options-open title-options" aria-label="${escape(system.title.options)}" title="${escape(system.title.options)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <section class="title-copy">
        <div class="title-head">
          <h1><small>${escape(system.ui.highPriest)}</small>${escape(system.ui.ner)}</h1>
          <button class="tutorial-open title-tutorial"><span aria-hidden="true">?</span>${escape(system.title.tutorial)}</button>
        </div>
        <p class="subtitle">${escape(system.ui.titlePrayerFirst)}<br>${escape(system.ui.titlePrayerSecond)}</p>
        ${saved ? `<button type="button" class="title-continue paper"><span class="continue-name">${escape(system.title.continue)}</span><span class="continue-detail">${escape(format(system.title.continueDetail, { mode: system.modes[saved.mode].name, year: saved.year }))}</span></button><p class="continue-note">${escape(system.title.continueNote)}</p>` : ''}
        <div class="mode-picker mode-fan" role="radiogroup" aria-label="${escape(system.modes.label)}">
          ${(['apprentice', 'priest', 'bishop'] as const).map((id, i) => `<button type="button" class="mode-option paper" style="--i:${i}" role="radio" data-mode="${id}"${id === 'bishop' && bishopLocked ? ` aria-disabled="true" data-tip data-tip-title="${escape(system.modes.bishop.name)}" data-tip-text="${escape(system.modes.bishop.lockedHint)}"` : ''} aria-checked="${mode === id}" tabindex="${mode === id ? 0 : -1}"><span class="mode-ribbon"><span class="mode-name">${escape(system.modes[id].name)}</span><span class="mode-tier">[${escape(system.modes[id].tier)}]</span></span><span class="mode-desc">${escape(system.modes[id].desc)}</span>${id === 'bishop' && bishopLocked ? `<span class="mode-lock">${escape(system.modes.bishop.locked)}</span>` : id !== 'bishop' && collection.cleared[id] ? `<span class="clear-seal" role="img" aria-label="${escape(system.clear[id])}" title="${escape(system.clear[id])}" style="--icon:url('${new URL(artUrl(art.ui.stampApprove) ?? '', document.baseURI).href}')"></span>` : ''}</button>`).join('')}
        </div>
      </section>
      <div class="title-stage">
        <div class="intro-art" aria-hidden="true">${collection.cleared.apprentice ? artSlot('ui', 'titleErpin', '') : ''}${uiArt('nerIntro')}${collection.cleared.priest ? artSlot('ui', 'titlePlate', '') + artSlot('ui', 'titlePat', '') : ''}</div>
        <div class="title-stamp-home"><button class="title-stamp" aria-label="${escape(system.title.pick)}">${uiArt('stampApprove')}</button><p>${escape(system.title.pick)}</p></div>
      </div>
      <footer class="title-desk">
        <div class="records">
          <span>${escape(system.title.records)}</span>
          ${(['apprentice', 'priest', 'bishop'] as const).map((id) => `<span class="title-record" data-record="${id}">${escape(system.modes[id].name)} <b>${escape(collection.bestYear[id] ? format(system.title.yearUnit, { year: collection.bestYear[id] }) : system.title.noRecord)}</b></span>`).join('')}
        </div>
        <button class="album-open" aria-label="${escape(`${system.ui.albumOpen} (${system.ui.albumTitle} ${discovered} / ${endings.length})`)}"><span aria-hidden="true">${escape(system.ui.albumOpen)}</span><b class="album-progress" aria-hidden="true">${discovered} / ${endings.length}</b></button>
        <p class="legal">${escape(system.notice)}</p>
        <details class="legal-note"><summary><span aria-hidden="true">i</span>${escape(system.ui.noticeOpen)}</summary><p>${escape(system.notice)}</p></details>
      </footer>
      ${albumMarkup(collection.endings, discovered, endings.length)}
    </main>`;
}
export function endingScreen(
  state: State,
  collection: Collection,
  hasNext = false,
): string {
  const id = state.ending!.id;
  const event = endingEvent(id);
  const extra = Object.hasOwn(system.extraEndings.items, id);
  const approved = id === 'true' || extra;
  const cause = state.ending!.cause;
  const gauge = system.gauges.find((g) => cause?.startsWith(g.key));
  const causeLine =
    id === 'sleep' && gauge
      ? `<p class="cause">${escape(format(system.ui.endingCause, { gauge: gauge.label, dir: cause!.endsWith('low') ? system.ui.depleted : system.ui.excess }))}</p>`
      : '';
  return `
    <main class="ending-screen">
      <p class="eyebrow">${escape(system.ui.endingEyebrow)}</p>
      <article class="paper ending-paper">
        <p class="document-number">${extra ? escape(system.extraEndings.document) : system.ui.finalDocument}</p>
        <h1>${escape(event.title)}</h1>
        ${artUrl(art.endings[id]) ? `<div class="ending-art">${artSlot('endings', id, '')}</div>` : ''}
        <p>${escape(event.text)}</p>
        ${causeLine}
        <div class="end-stamp ${approved ? 'approve' : 'reject'}"><span class="end-ink" aria-hidden="true">${uiArt(approved ? 'stampApprove' : 'stampReject')}</span><b>${extra ? escape(system.extraEndings.stamp) : id === 'true' ? system.ui.twoHundredRecord : system.ui.reignEnded}</b></div>
        <p>${state.mode === 'bishop' ? escape(format(system.bishop.reign, { year: state.year })) : `${escape(system.ui.calendar)} <b>${state.year}${escape(system.ui.yearSuffix)}</b>`} · ${escape(bestYearText(collection.bestYear[state.mode], state.mode))}</p>
        <small class="ending-mode">${escape(system.modes[state.mode].endingLine)}</small>
      </article>
      <button class="return">${hasNext ? escape(system.extraEndings.next) : system.ui.returnToTitle}</button>
    </main>`;
}
