import { bishopChoices } from './bishop';
import { answerCard } from '../core/bishop';
import { system, localizeCard } from '../i18n';
import type { Document } from '../core/state';
import { escape, portraitArt } from './art';
import { toolFace } from './tools';
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
export function documentMarkup(
  card: Document,
  alice = false,
  asleep = false,
  canReroll = true,
  scoped = false,
  // 혜안 or 직감 held: a forged Speaki document gives itself away
  tell: 'hyean' | 'intuition' | null = null,
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
      ${
        alice
          ? `<button class="tool alice paper-alice" data-action="alice" aria-label="${escape(system.boons.alice.name)}" title="${escape(system.boons.alice.name)} — ${escape(system.boons.alice.desc)}" aria-disabled="${asleep || !canReroll || (card.kind !== 'daily' && card.kind !== 'speaki')}">
        <span class="tool-home" aria-hidden="true">${toolFace('alice')}</span>
        <span class="tool-name">${system.ui.alice}</span>
      </button>`
          : ''
      }
    </article>`;
}
