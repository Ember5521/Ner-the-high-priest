import { bishopChoices } from './bishop';
import { answerCard } from '../core/bishop';
import { system, localizeCard } from '../i18n';
import type { Document } from '../core/state';
import { escape, portraitArt, uiArt } from './art';
const factionLabel = (f: string) =>
  (system.factions as Record<string, string>)[f] ?? f;
export function docKindClass(card: Document): string {
  if (card.look) return `doc-${card.look}`;
  return card.kind === 'story' ||
    card.kind === 'fixed' ||
    card.kind === 'special'
    ? `doc-${card.kind}`
    : '';
}
// Speaki can't help herself: every forged document hides one faint pumpkin,
// placed by the card and the year so it holds still while the paper is up.
const pumpkinSvg = `<svg viewBox="0 0 64 64"><path fill="#5d7a2e" d="M30 14q-1-8 5-11l3 3q-5 3-4 8z"/><ellipse cx="20" cy="38" rx="14" ry="19"/><ellipse cx="44" cy="38" rx="14" ry="19"/><ellipse cx="32" cy="38" rx="13" ry="21"/></svg>`;
function speakiPumpkin(id: string, seed: string): string {
  let hash = 2166136261;
  const key = `${id}:${seed}`;
  for (let i = 0; i < key.length; i++)
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  const pick = (min: number, max: number) => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    return min + (hash % 1000) / 1000 * (max - min);
  };
  return `<i class="speaki-pumpkin" aria-hidden="true" style="left:${pick(6, 82).toFixed(1)}%;top:${pick(12, 84).toFixed(1)}%;--size:${pick(36, 54).toFixed(0)}px;--turn:${pick(-30, 30).toFixed(0)}deg">${pumpkinSvg}</i>`;
}
export function documentMarkup(
  card: Document,
  alice = false,
  asleep = false,
  canReroll = true,
  scoped = false,
  // 혜안 or 직감 held: a forged Speaki document gives itself away
  tell: 'hyean' | 'intuition' | null = null,
  seed = '',
): string {
  card = card.blessings ? answerCard(card.blessings) : localizeCard(card);
  if (card.look === 'special') card = { ...card, stamps: 'direction' };
  const speakerKey = card.speaker;
  const speaker = system.speakers[speakerKey as keyof typeof system.speakers];
  const portraitKey =
    ('portrait' in speaker ? speaker.portrait : undefined) ?? speakerKey;
  return `
    <article data-stamps="${card.stamps ?? ''}" class="paper document ${docKindClass(card)} ${card.kind === 'story' ? 'approve-both' : ''}" tabindex="0" aria-label="${escape(system.ui.documentLabel)}">
      ${scoped ? '<div class="scope-reticle" aria-hidden="true"></div>' : ''}
      <div class="paper-content">
        <p class="document-number">${card.look === 'quest' ? system.ui.questPrefix : card.look === 'hard' ? system.ui.hardPrefix : card.look === 'special' ? system.ui.specialPrefix : card.kind === 'story' ? system.ui.chroniclePrefix : card.kind === 'fixed' ? system.ui.importantPrefix : card.kind === 'special' ? system.ui.specialPrefix : ''}${escape(factionLabel(card.faction))}</p>
        <div class="sender">
          <div class="portrait" style="--speaker:${escape(speaker.color)}">${portraitArt(portraitKey, card.id)}</div>
          <div class="sender-text">
            <h1>${escape(card.title)}</h1>
            <span class="sender-name">${escape(speaker.name)}</span>
          </div>
        </div>
        ${tell && card.kind === 'speaki' ? `<p class="speaki-tell" data-boon="${tell}"><i aria-hidden="true"></i>${escape(system.ui.speakiTell[tell])}</p>` : ''}
        <p class="body-text">${escape(card.text)}</p>
        ${card.blessings ? bishopChoices(card.blessings) : ''}
        <div class="seal-spot" aria-hidden="true"></div>
      </div>
      <div class="scroll-bar" aria-hidden="true" hidden><i></i></div>
      <p class="choice-caption" aria-live="polite"></p>
      <div class="imprints" aria-hidden="true"></div>
      ${card.kind === 'speaki' ? speakiPumpkin(card.id, seed) : ''}
      ${
        // the wildcard rides in the corner as a faint picture; the paper itself
        // is the control (hold and slide it sideways, see input.ts)
        alice
          ? `<span class="paper-alice${asleep || !canReroll || (card.kind !== 'daily' && card.kind !== 'speaki') ? ' spent' : ''}" data-action="alice" aria-hidden="true">${uiArt('aliceToken')}</span>`
          : ''
      }
    </article>`;
}
