import '../ui/style.css';
import {
  initialState,
  bulletForbidden,
  type Card,
  type Action,
  type State,
  type Mode,
} from '../core/state';
import { hesitateAxe, playAction, type Point } from '../ui/fx';
import { unlockAudio } from '../ui/sound';
import { fireScopeOnContact } from '../ui/scopeShot';
import { BULLET_CHARGES } from '../core/config';
import { canRerollDaily } from '../core/deck';
import { axeForbidden, type ToolAction } from '../ui/tools';
import { createInput } from '../ui/input';
import { hideItemShade } from '../ui/itemShade';
import { hydrateArt } from '../ui/art';
import { updateAimPreview } from '../ui/aim';
import system from '../../data/system.json';
import { deskMarkup, rewindMarkup } from '../ui/desk';
import { playRewindFx } from '../ui/rewindFx';
import { endingScreen } from '../ui/screens';
import {
  aimScope,
  placeBlindfold,
  processDocument,
  useBandage,
} from '../core/loop';
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
  session = null;
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

type Feature =
  | { type: 'scene'; scene: string }
  | { type: 'boon'; boon: keyof typeof system.boons };

/** What the desk is showing; null leaves the game's input inert. */
interface Session {
  root: HTMLElement;
  card: Card;
  /** The stamp picked with the editor's buttons. */
  aim: Action | null;
  /** The tool aimed or held on the desk itself. */
  liveAim: ToolAction | null;
  feature?: Feature;
  armed: boolean;
  state: State;
  /** Where a stamp puts the desk back to, so an item can be tried again. */
  base: State;
  scene: string | null;
  busy: boolean;
  finish: (() => void) | null;
}
let session: Session | null = null;
let bound: { root: HTMLElement; input: ReturnType<typeof createInput> } | null =
  null;

function refreshAim(s: Session): void {
  updateAimPreview(
    s.root,
    s.card,
    (s.liveAim ?? s.aim) as Action | null,
    s.state.drowse.stack === 2,
    s.state,
  );
}

const rerender = (s: Session, state: State) =>
  renderPreview(s.root, s.card, s.aim, s.feature, s.armed, state, s.base);

function previewStamp(action: ToolAction, drop?: Point): void {
  const s = session;
  if (!s || s.scene) return;
  if (s.busy) {
    s.finish?.();
    return;
  }
  const { root, card, state } = s;
  // Same rule as the game: the 마탄 only reaches cards it can reach.
  if (
    (action === 'axe' && axeForbidden(card)) ||
    (action === 'bullet' && (bulletForbidden(card) || !state.boons.bullet))
  ) {
    s.liveAim = null;
    refreshAim(s);
    hesitateAxe(root, action);
    return;
  }
  if (action === 'scope') {
    const next = aimScope(state);
    if (next !== state) rerender(s, next);
    return;
  }
  hideItemShade(root);
  s.busy = true;
  const desk = root.querySelector('.desk');
  const duration = playAction(root, action, drop ?? null, state.sleep > 0);
  // same as the game: the scope fires the moment the stamp lands
  if (state.scoped && (action === 'approve' || action === 'reject'))
    fireScopeOnContact(root, { ...state, current: card }, action);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (session === s && root.querySelector('.desk') === desk)
      rerender(s, s.base);
  };
  const timer = setTimeout(finish, duration);
  s.finish = finish;
}

// The game's own input, so the desk's tools and items are held and dragged here too.
function inputFor(root: HTMLElement): ReturnType<typeof createInput> {
  if (bound?.root === root) return bound.input;
  bound?.input.dispose();
  const input = createInput(root, {
    get busy() {
      return !!session?.busy;
    },
    get sleep() {
      const state = session?.state;
      return state && !state.current?.blessings ? state.sleep : 0;
    },
    get playing() {
      return session?.root === root;
    },
    get aim() {
      return session?.liveAim ?? null;
    },
    menuOpen: false,
    get sceneOpen() {
      return !!session?.scene;
    },
    sceneKey() {},
    openMenu() {},
    menuKey() {},
    setAim(value) {
      const s = session;
      if (!s) return;
      if (value === 'scope' && aimScope(s.state) === s.state) return;
      if (value === 'bullet' && !(s.state.boons.bullet! > 0)) return;
      if (value === 'alice' && !s.state.boons.alice) return;
      if (
        (value === 'axe' && axeForbidden(s.card)) ||
        (value === 'bullet' && bulletForbidden(s.card))
      ) {
        previewStamp(value);
        return;
      }
      s.liveAim = value;
      refreshAim(s);
    },
    canLift(action) {
      const s = session;
      if (!s) return false;
      if (action === 'scope' && aimScope(s.state) === s.state) return false;
      if (
        (action === 'axe' && axeForbidden(s.card)) ||
        (action === 'bullet' &&
          (bulletForbidden(s.card) || !(s.state.boons.bullet! > 0)))
      ) {
        previewStamp(action);
        return false;
      }
      return true;
    },
    canWild() {
      return !!session && canRerollDaily(session.state, sampleCards);
    },
    wildCaption(on) {
      if (!session) return;
      if (!on) return refreshAim(session);
      const caption = root.querySelector<HTMLElement>('.choice-caption');
      if (!caption) return;
      caption.textContent = system.aliceLine;
      caption.className = 'choice-caption alice';
    },
    stamp: previewStamp,
    placeBlindfold(gauge) {
      const s = session;
      if (!s) return;
      const next = placeBlindfold(s.state, gauge);
      if (next !== s.state) rerender(s, next);
    },
    useBandage(gauge) {
      const s = session;
      if (!s) return;
      const previous = s.state;
      const next = useBandage(previous, gauge);
      if (next === previous) return;
      rerender(s, next);
      animateGauges(root, previous.gauges, next.gauges);
    },
    autoStamp() {
      if (session?.state.sleep && !session.busy) previewStamp('approve');
    },
    skip() {
      session?.finish?.();
    },
  });
  bound = { root, input };
  return input;
}

export function renderPreview(
  root: HTMLElement,
  card: Card,
  aim: Action | null,
  feature?: Feature,
  armed = false,
  state: State = initialState(),
  base: State = state,
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
  session = {
    root,
    card,
    aim,
    liveAim: aim,
    feature,
    armed,
    state,
    base,
    scene,
    busy: false,
    finish: null,
  };
  inputFor(root).bind();
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
    // not a tap on the desk: asleep, that would stamp the paper
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.onclick = () => renderSpecialPreview(root, id, mode);
    root.append(button);
  };
  replay();
  if (scene)
    root.querySelector('.scene-next')!.addEventListener('click', replay);
  const desk = root.querySelector('.desk');
  if (id === 'scope')
    setTimeout(() => {
      if (root.querySelector('.desk') === desk) previewStamp('approve');
    }, 1100);
  if (id === 'rewind') {
    playAction(root, 'approve', null, false);
    desk!.insertAdjacentHTML('beforeend', rewindMarkup());
    desk!
      .querySelectorAll<HTMLElement>(':scope > :not(.scene)')
      .forEach((el) => el.setAttribute('inert', ''));
    hydrateArt(root);
    session = null;
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
    session = null;
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
let currentXion: '' | 'bullet' | 'scope' = '';
let currentSist: '' | 'blindfold' | 'bandage' = '';
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
// Puts the items picked in the editor on the preview desk, as if they were held.
function equip(state: State): State {
  const boons = { ...state.boons };
  for (const id of currentItems)
    if (id === 'hyean' || id === 'intuition') boons[id] = { left: 5 };
    else if (id === 'bandage') boons.bandage = 1;
    else if (id === 'scope') boons.scope = 4;
    else boons[id as 'understudy' | 'rewind' | 'stitch' | 'alice'] = true;
  if (currentXion === 'scope') boons.scope = 4;
  if (currentSist === 'blindfold') boons.blindfold = 1;
  const gauges = { ...state.gauges };
  // the bandage only works off-centre: two gauges to use it on, two it must skip
  if (currentSist === 'bandage') {
    boons.bandage = 1;
    gauges.people = 25;
    gauges.faith = 75;
  }
  return { ...state, boons, gauges };
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
    currentXion =
      message.xion === 'bullet' || message.xion === 'scope' ? message.xion : '';
    currentSist =
      message.sist === 'blindfold' || message.sist === 'bandage'
        ? message.sist
        : '';
    currentItems = Array.isArray(message.items)
      ? message.items.filter((id: unknown) =>
          PREVIEW_ITEMS.includes(id as string),
        )
      : [];
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
      session = null;
    } else {
      renderPreview(
        root,
        current,
        currentAim,
        undefined,
        currentXion === 'bullet',
        equip({ ...initialState(currentMode), year: currentYear }),
      );
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
      currentXion === 'bullet',
      equip({ ...initialState(currentMode), year: currentYear }),
    );
  }
});
