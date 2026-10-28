import '../ui/style.css';
import {
  initialState,
  type Card,
  type Action,
  type State,
  type Mode,
  type Gauge,
} from '../core/state';
import { hesitateAxe, playAction } from '../ui/fx';
import { unlockAudio } from '../ui/sound';
import { fireScopeOnContact } from '../ui/scopeShot';
import { BULLET_CHARGES, GAUGE_KEYS } from '../core/config';
import { axeForbidden } from '../ui/tools';
import { hydrateArt } from '../ui/art';
import { updateAimPreview } from '../ui/aim';
import system from '../../data/system.json';
import { deskMarkup, rewindMarkup } from '../ui/desk';
import { playRewindFx } from '../ui/rewindFx';
import { endingScreen } from '../ui/screens';
import { processDocument, useBandage } from '../core/loop';
import { animateGauges } from '../ui/gauges';
import rawCards from '../../data/cards/m1.json';
import {
  atmospherePreviews,
  specialPreviews,
  type SpecialPreview,
} from './specials';
import './preview.css';
import { openTutorial } from '../ui/preferences';
import type { SystemCopy } from './copy-data';
// The preview frame sits beside the editor's text fields, and the game's scenes,
// tutorial and rewind prompt focus their buttons whenever they render. Inside an
// iframe that pulls the caret out of the field being typed in after one letter,
// so the frame may only move focus while it already has it.
const focusElement = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (options?: FocusOptions) {
  if (document.hasFocus()) focusElement.call(this, options);
};
const savedSystem = structuredClone(system);

export function renderCopyPreview(
  root: HTMLElement,
  copy: SystemCopy,
  section: string,
  step = 0,
): void {
  root
    .querySelectorAll('.preferences-overlay')
    .forEach((el) => el.dispatchEvent(new Event('dispose')));
  document.querySelector<HTMLElement>('.rewind-fx')?.click();
  if (previewKeydown) window.removeEventListener('keydown', previewKeydown);
  previewKeydown = null;
  root.onclick = null;
  root.replaceChildren();
  Object.assign(system, structuredClone(copy));
  if (section === 'tutorial' && system.tutorial.steps.length)
    openTutorial(root, step);
  else if (
    section.startsWith('scenes.') &&
    Object.hasOwn(system.scenes, section.slice(7))
  ) {
    renderPreview(root, sampleCards[0]!, null, {
      type: 'scene',
      scene: section.slice(7),
    });
  } else if (section === 'rewindPrompt') renderSpecialPreview(root, 'rewind');
  else if (section.startsWith('ending.')) {
    const id = section.slice(7);
    if (
      id !== 'true' &&
      !Object.hasOwn(system.gameOvers, id) &&
      !Object.hasOwn(system.extraEndings.items, id)
    )
      return;
    const state = initialState();
    state.year =
      id === 'true' || Object.hasOwn(system.extraEndings.items, id) ? 200 : 186;
    state.ending = { id };
    root.innerHTML = endingScreen(state, {
      bestYear: { apprentice: 0, priest: 200, bishop: 0 },
      endings: [],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    });
    hydrateArt(root);
  }
}

let previewKeydown: ((event: KeyboardEvent) => void) | null = null;

export function renderPreview(
  root: HTMLElement,
  card: Card,
  aim: Action | null,
  feature?:
    | { type: 'scene'; scene: string }
    | { type: 'boon'; boon: keyof typeof system.boons },
  armed = false,
  state: State = initialState(),
): void {
  state.current = card;
  if (armed) state.boons.bullet = BULLET_CHARGES;
  if (feature?.type === 'boon') {
    const boon = feature.boon;
    if (boon === 'hyean' || boon === 'intuition') state.boons[boon] = { left: 5 };
    else if (boon === 'bullet') state.boons.bullet = BULLET_CHARGES;
    else if (boon === 'blindfold') state.boons.blindfold = 1;
    else if (boon === 'bandage') state.boons.bandage = 1;
    else if (boon === 'scope') state.boons.scope = 4;
    else state.boons[boon] = true;
  }
  state.scene = feature?.type === 'scene' ? feature.scene : null;
  const scene = state.scene;
  root.innerHTML = deskMarkup(state);
  let busy = false;
  const fire = (action: Action) => {
    if (busy || scene) return;
    // Same rule as the game: the 마탄 only reaches cards it can reach.
    if (
      (action === 'axe' && axeForbidden(card)) ||
      (action === 'bullet' && (card.axe === false || !state.boons.bullet))
    ) {
      hesitateAxe(root, action);
      return;
    }
    busy = true;
    const desk = root.querySelector('.desk');
    const duration = playAction(root, action, null, state.sleep > 0);
    // same as the game: the scope fires the moment the stamp lands
    if (state.scoped && (action === 'approve' || action === 'reject'))
      fireScopeOnContact(root, { ...state, current: card }, action);
    setTimeout(() => {
      if (root.querySelector('.desk') === desk)
        renderPreview(root, card, aim, feature, armed, state);
    }, duration);
  };
  root.onclick = (event) => {
    const tool = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-action]',
    );
    if (tool) fire(tool.dataset.action as Action);
  };
  if (previewKeydown) window.removeEventListener('keydown', previewKeydown);
  previewKeydown = (event) => {
    const action = (
      {
        ArrowLeft: 'reject',
        ArrowDown: 'axe',
        ArrowUp: 'bullet',
        ArrowRight: 'approve',
      } as const
    )[event.key as 'ArrowLeft'];
    if (action) {
      event.preventDefault();
      if (!event.repeat) fire(action);
    }
  };
  window.addEventListener('keydown', previewKeydown);
  hydrateArt(root);
  updateAimPreview(root, card, aim, state.drowse.stack === 2, state);
  if (scene) {
    root
      .querySelectorAll<HTMLElement>('.desk > :not(.scene)')
      .forEach((el) => (el.inert = true));
    const button = root.querySelector<HTMLButtonElement>('.scene-next')!;
    button.addEventListener('click', () =>
      renderPreview(root, card, aim, undefined, armed, {
        ...state,
        scene: null,
      }),
    );
    button.focus();
  }
}
// Use real daily documents so Alice can replace one through the game loop.
const sampleCards = (rawCards as Card[]).filter(
  (card) => card.kind === 'daily',
);
export function renderSpecialPreview(
  root: HTMLElement,
  id: SpecialPreview,
  mode: Mode = 'priest',
): void {
  // Finish a previous rewind before replacing its desk and event handlers.
  document.querySelector<HTMLElement>('.rewind-fx')?.click();
  const state = initialState(mode);
  const atmosphere = atmospherePreviews[id];
  state.year = atmosphere?.year ?? 186;
  if (atmosphere?.boss !== undefined)
    state.boss = { done: atmosphere.boss, drawn: [] };
  const card = atmosphere?.card
    ? (rawCards as Card[]).find((card) => card.id === atmosphere.card)!
    : sampleCards[0]!;
  if (id === 'sleep' || id === 'erpinSave' || id === 'asleep') state.sleep = 3;
  if (id === 'hyean') state.boons.hyean = { left: 5 };
  if (id === 'alice') state.boons.alice = true;
  if (id === 'bullet') state.boons.bullet = BULLET_CHARGES;
  if (id === 'scope') {
    state.boons.scope = 4;
    state.scoped = true;
  }
  if (id === 'rewind') {
    state.boons.rewind = true;
    state.gauges.sugar = 0;
    state.ending = { id: 'sugar_low' };
  }
  const scene = Object.hasOwn(system.scenes, id) ? id : null;
  renderPreview(
    root,
    card,
    id === 'hyean' ? 'approve' : null,
    scene ? { type: 'scene', scene } : undefined,
    false,
    state,
  );
  const replay = () => {
    root.querySelector('.preview-replay')?.remove();
    const button = document.createElement('button');
    button.className = 'preview-replay';
    button.textContent = '다시 재생';
    button.onclick = () => renderSpecialPreview(root, id, mode);
    root.append(button);
  };
  replay();
  if (scene)
    root.querySelector('.scene-next')!.addEventListener('click', replay);
  const desk = root.querySelector('.desk');
  if (id === 'scope')
    setTimeout(() => {
      if (root.querySelector('.desk') === desk)
        root.querySelector<HTMLElement>('[data-action="approve"]')?.click();
    }, 1100);
  if (id === 'rewind') {
    playAction(root, 'approve', null, false);
    desk!.insertAdjacentHTML('beforeend', rewindMarkup());
    desk!
      .querySelectorAll<HTMLElement>(':scope > :not(.scene)')
      .forEach((el) => el.setAttribute('inert', ''));
    hydrateArt(root);
    root.onclick = null;
    if (previewKeydown) window.removeEventListener('keydown', previewKeydown);
    previewKeydown = null;
    let busy = false;
    root
      .querySelectorAll<HTMLButtonElement>('[data-rewind]')
      .forEach((button) => {
        button.onclick = async () => {
          if (busy) return;
          busy = true;
          if (button.dataset.rewind === 'yes') {
            root.setAttribute('inert', '');
            await playRewindFx(186, 181, () => {
              if (root.querySelector('.desk') !== desk) return;
              const restored = initialState(mode);
              restored.year = 181;
              renderPreview(root, card, null, undefined, false, restored);
              replay();
            });
            root.removeAttribute('inert');
          } else {
            root.innerHTML = endingScreen(state, {
              bestYear: {
                apprentice: mode === 'apprentice' ? 186 : 0,
                bishop: 0,
                priest: mode === 'priest' ? 186 : 0,
              },
              endings: [],
              bishopUnlocked: false,
              cleared: { apprentice: false, priest: false },
            });
            hydrateArt(root);
            root
              .querySelector('.return')!
              .addEventListener('click', () =>
                renderSpecialPreview(root, id, mode),
              );
            replay();
          }
        };
      });
    root.querySelector<HTMLButtonElement>('[data-rewind="yes"]')!.focus();
  } else if (id === 'alice' || id === 'bullet' || id === 'axe') {
    root.onclick = null;
    if (previewKeydown) window.removeEventListener('keydown', previewKeydown);
    previewKeydown = null;
    const duration = playAction(root, id, null, false);
    setTimeout(() => {
      if (root.querySelector('.desk') !== desk) return;
      const next = processDocument(state, id, sampleCards, Math.random);
      renderPreview(root, next.current ?? card, null, undefined, false, next);
      replay();
    }, duration);
  }
}

const unlockPreviewAudio = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', unlockPreviewAudio, true);
  window.removeEventListener('keydown', unlockPreviewAudio, true);
};
window.addEventListener('pointerdown', unlockPreviewAudio, true);
window.addEventListener('keydown', unlockPreviewAudio, true);
let currentYear = 0;
let currentMode: Mode = 'priest';
let currentArmed = false;
let current: Card | null = null;
let currentAim: Action | null = null;
const PREVIEW_ITEMS = [
  'hyean',
  'intuition',
  'scope',
  'understudy',
  'rewind',
  'stitch',
  'alice',
  'bandage',
];
let currentItems: string[] = [];
let currentBlindfold = '';
let currentScope = '';
let currentBandage = '';
let bandageTimer: ReturnType<typeof setTimeout> | undefined;
// Puts the items picked in the editor on the preview desk, as if they were held.
function equip(state: State): State {
  const boons = { ...state.boons };
  for (const id of currentItems)
    if (id === 'hyean' || id === 'intuition') boons[id] = { left: 5 };
    else if (id === 'bandage') boons.bandage = 1;
    else if (id === 'scope') boons.scope = 4;
    else boons[id as 'understudy' | 'rewind' | 'stitch' | 'alice'] = true;
  if (currentBlindfold) boons.blindfold = 1;
  if (currentScope) boons.scope = 4;
  // the bandage is only usable off-centre, so lower the gauge it will be used on
  const gauges = { ...state.gauges };
  if (currentBandage) {
    boons.bandage = 1;
    gauges[GAUGE_KEYS.includes(currentBandage as Gauge) ? (currentBandage as Gauge) : 'people'] = 25;
  }
  return {
    ...state,
    boons,
    gauges,
    ...(currentScope === 'aimed' ? { scoped: true as const } : {}),
    ...(GAUGE_KEYS.includes(currentBlindfold as Gauge)
      ? { blindfold: currentBlindfold as Gauge }
      : {}),
  };
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent)
    return;
  const root = document.getElementById('app')!;
  const message = event.data;
  if (message?.type === 'copy') {
    renderCopyPreview(root, message.system, message.section, message.step);
    return;
  }
  if (message?.type === 'card' || message?.type === 'special') {
    root
      .querySelectorAll('.preferences-overlay')
      .forEach((el) => el.dispatchEvent(new Event('dispose')));
    Object.assign(system, structuredClone(savedSystem));
  }
  if (
    message?.type === 'special' &&
    Object.hasOwn(specialPreviews, message.special)
  ) {
    renderSpecialPreview(root, message.special, currentMode);
  } else if (message?.type === 'card') {
    document.querySelector<HTMLElement>('.rewind-fx')?.click();
    currentYear =
      typeof message.year === 'number' && Number.isFinite(message.year)
        ? Math.max(0, Math.min(200, message.year))
        : 0;
    currentArmed = message.armed === true;
    currentItems = Array.isArray(message.items)
      ? message.items.filter((id: unknown) =>
          PREVIEW_ITEMS.includes(id as string),
        )
      : [];
    currentBlindfold =
      message.blindfold === 'held' ||
      GAUGE_KEYS.includes(message.blindfold as Gauge)
        ? message.blindfold
        : '';
    currentScope =
      message.scope === 'held' || message.scope === 'aimed' ? message.scope : '';
    currentBandage =
      message.bandage === 'held' || GAUGE_KEYS.includes(message.bandage as Gauge)
        ? message.bandage
        : '';
    currentMode =
      message.mode === 'bishop'
        ? 'bishop'
        : message.mode === 'apprentice'
          ? 'apprentice'
          : 'priest';
    current = message.card;
    currentAim = message.aim === 'none' ? null : message.aim;
    if (!current) {
      root.replaceChildren();
      if (previewKeydown) window.removeEventListener('keydown', previewKeydown);
      previewKeydown = null;
    } else {
      const prepared = equip({ ...initialState(currentMode), year: currentYear });
      renderPreview(root, current, currentAim, undefined, currentArmed, prepared);
      // "반창고 → gauge": show it being used a moment later
      if (GAUGE_KEYS.includes(currentBandage as Gauge)) {
        const card = current;
        const desk = root.querySelector('.desk');
        clearTimeout(bandageTimer);
        bandageTimer = setTimeout(() => {
          if (root.querySelector('.desk') !== desk || current !== card) return;
          const used = useBandage(prepared, currentBandage as Gauge);
          renderPreview(root, card, currentAim, undefined, currentArmed, used);
          animateGauges(root, prepared.gauges, used.gauges);
        }, 700);
      }
    }
  } else if (
    current &&
    ((message?.type === 'scene' &&
      Object.hasOwn(system.scenes, message.scene)) ||
      (message?.type === 'boon' && Object.hasOwn(system.boons, message.boon)))
  ) {
    renderPreview(
      root,
      current,
      currentAim,
      message,
      currentArmed,
      equip({ ...initialState(currentMode), year: currentYear }),
    );
  }
});
