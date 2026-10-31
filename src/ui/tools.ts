import { bulletForbidden, itemsLocked, type Action, type Choice, type Document, type State } from '../core/state';
import { artSlot, escape, uiArt } from './art';
import { system, format, localizeCard } from '../i18n';

export type ToolAction = Action | 'scope';

// Alice's card sits inside a ring of two chasing arrows so it reads as "reroll".
const rerollRing = `<svg class="reroll-ring" viewBox="0 0 64 64" aria-hidden="true"><path class="reroll-halo" d="M3.4 27A29 29 0 0 1 57.1 17.5M60.6 37A29 29 0 0 1 6.9 46.5"/><path d="M3.4 27A29 29 0 0 1 57.1 17.5M60.6 37A29 29 0 0 1 6.9 46.5"/><path class="reroll-head" d="M59.4 21.4L59.3 13.3L52.4 17.3ZM4.6 42.6L4.7 50.7L11.6 46.7Z"/></svg>`;
const rerollArrows = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>`;

/** Total time from drop to the next document. */
export const ACTION_MS = 820;
/** When the stamp face meets the paper. */
export const CONTACT_MS = 140;

export const STAMP_NAME: Record<Choice, string> = {
  get reject() {
    return system.ui.reject;
  },
  get approve() {
    return system.ui.approve;
  },
};

export function axeForbidden(card: Document): boolean {
  return card.axe === false || card.axe === 'bullet';
}

export function stampArt(
  choice: Choice,
  story = false,
  stamps?: Document['stamps'],
) {
  if (stamps === 'meet') return 'stampMeet';
  return stamps === 'light'
    ? 'stampLight'
    : stamps === 'direction'
      ? choice === 'reject'
        ? 'stampLeft'
        : 'stampRight'
      : choice === 'reject' && !story
        ? 'stampReject'
        : 'stampApprove';
}

export function stampFace(
  choice: Choice,
  story = false,
  stamps?: Document['stamps'],
): string {
  return `<span class="stamp-face">${uiArt(stampArt(choice, story, stamps))}</span>`;
}

export function toolFace(
  action: ToolAction,
  story = false,
  stamps?: Document['stamps'],
): string {
  if (action === 'scope') return `<span class="axe-face scope-face">${uiArt('scope')}</span>`;
  if (action === 'alice')
    return `<span class="alice-face">${rerollRing}<span class="reroll-face">${artSlot('ui', 'aliceToken', rerollArrows)}</span></span>`;
  return action === 'axe' || action === 'bullet'
    ? `<span class="axe-face${action === 'bullet' ? ' bullet-face' : ''}">${uiArt(action)}</span>`
    : stampFace(action, story, stamps);
}

/**
 * The coin on a reward stamp: the item's icon, and a tip with its name and a
 * one-line description (hover on a desk, tap the coin on a phone).
 */
function itemCoin(result: Document['reject']): string {
  const boon = result.grant?.boon;
  const name = boon
    ? system.boons[boon].name
    : result.mend
      ? system.ui.mend
      : '';
  const text = boon
    ? system.boons[boon].desc
    : result.mend
      ? system.ui.mendDesc[result.mend.mode]
      : '';
  return name
    ? `<span class="item-coin" data-tip data-tip-title="${escape(name)}" data-tip-text="${escape(text)}"></span>`
    : '';
}

export function toolsMarkup(
  card: Document,
  { stack, left }: State['drowse'],
  bullet = false,
  asleep = false,
  axeLocked = false,
  statusLeft?: number,
  scope = 0,
  scoped = false,
  sceneOpen = false,
  { boons = {}, blindfold, bandageDisabled = false }: {
    boons?: State['boons'];
    blindfold?: State['blindfold'];
    bandageDisabled?: boolean;
  } = {},
): string {
  card = localizeCard(card);
  if (card.look === 'special') card = { ...card, stamps: 'direction' };
  // the witches' hard event keeps its named stamps (프리클 / 피코라)
  const named =
    !!card.blessings ||
    card.look === 'special' ||
    (card.look === 'hard' && card.stamps === 'direction');
  const tool = (action: ToolAction, label: string, key: string) => `
    <button class="tool ${action}${action === 'axe' && axeLocked ? ' status-locked' : ''}" data-action="${action}"${(action === 'reject' || action === 'approve') && card.look === 'special' ? ` data-item="${card[action].grant?.boon ?? (card[action].mend ? 'mend' : '')}"` : ''} aria-label="${escape(label)}"
      ${action === 'scope' ? `aria-disabled="${asleep || sceneOpen || scoped || itemsLocked(card)}"` : action === 'axe' || action === 'bullet' ? `aria-disabled="${asleep || (action === 'axe' ? axeForbidden(card) || axeLocked : bulletForbidden(card))}"` : ''}>
      <span class="tool-home" aria-hidden="true">${toolFace(action, card.kind === 'story', card.stamps)}${(action === 'reject' || action === 'approve') && card.look === 'special' ? itemCoin(card[action]) : ''}</span>
      ${action === 'axe' && axeLocked && statusLeft !== undefined ? `<span class="status-left" aria-hidden="true">${statusLeft}</span>` : ''}
      <span class="tool-name">${
        // The arrow follows the stamp position.
        action === 'reject'
          ? `${card.stamps === 'meet' ? system.ui.extendHand : named ? escape(label) : label.split(' ')[0]}`
          : `${card.stamps === 'meet' && action === 'approve' ? system.ui.extendHand : action === 'scope' || named ? escape(label) : label.split(' ')[0]}`
      }</span>
    </button>`;
  const sistItem = (id: 'bandage' | 'blindfold') => {
    const { name, desc, short } = system.boons[id];
    return (boons[id] ?? 0) > 0
      ? `<button type="button" class="item-slot tray-item ${id}-slot" data-${id}-item data-tip data-tip-title="${escape(name)}" data-tip-text="${escape(desc)}" aria-label="${escape(name + ' ' + desc)}"${itemsLocked(card) ? ' aria-disabled="true"' : id === 'bandage' ? ` aria-disabled="${bandageDisabled}"` : ''}${id === 'blindfold' && blindfold ? ' data-placed' : ''}><span class="tool-home" aria-hidden="true"><i class="item-face"></i></span><span class="tool-name">${escape(short)}</span></button>`
      : '';
  };
  return `
    <div class="tools">
      ${tool('reject', named ? card.reject.label : card.stamps === 'meet' ? system.ui.handStamp : card.stamps === 'light' ? system.ui.lightStamp : card.stamps === 'direction' ? system.ui.leftStamp : card.kind === 'story' ? system.ui.approveLeftStamp : format(system.ui.stampLabel, { name: STAMP_NAME.reject }), '←')}
      <div class="tray-slot sist-slot">${sistItem('bandage')}${sistItem('blindfold')}</div>
      <div class="axe-slot">
        <div class="axe-pair">${tool('axe', system.ui.axeDiscard, '↓')}</div>
        <span class="drowse" data-stack="${stack}" aria-label="${escape(format(system.ui.drowseLabel, { stack, recovery: stack ? format(system.ui.drowseRecovery, { n: left }) : '' }))}">${[0, 1, 2].map((i) => `<i${i < stack ? ' class="on"' : ''}></i>`).join('')}<small>${stack ? escape(format(system.ui.drowseShort, { stack, n: left })) : ''}</small></span>
      </div>
      <div class="tray-slot xion-slot">${bullet ? tool('bullet', system.ui.bulletFire, '↑') : ''}${scope > 0 ? tool('scope', system.boons.scope.short, 'S') : ''}</div>
      ${tool('approve', named ? card.approve.label : card.stamps === 'meet' ? system.ui.handStamp : card.stamps === 'light' ? system.ui.lightStamp : card.stamps === 'direction' ? system.ui.rightStamp : card.kind === 'story' ? system.ui.approveRightStamp : format(system.ui.stampLabel, { name: STAMP_NAME.approve }), '→')}
    </div>`;
}
