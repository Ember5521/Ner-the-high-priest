import { format, system, setLanguage, type Lang } from '../i18n';
import { FLAGS } from './flags';
import {
  loadCollection,
  saveCollection,
  loadSettings,
  saveSettings,
} from '../save/storage';
import { playSound, setSoundEnabled, setSoundVolume } from './sound';
import { setMusicEnabled, setMusicVolume } from './music';

// speaker for the mute buttons; the waves give way to a cross when muted (CSS)
const MUTE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="speaker" d="M4 9h4l5-4v14l-5-4H4z"/><path class="waves" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/><path class="cross" d="m16 9 6 6m0-6-6 6"/></svg>';
import { art, artUrl, escape, hydrateArt } from './art';

// items that help just by being held (the rest are used by hand)
const PASSIVE_ITEMS = new Set(['understudy', 'hyean', 'intuition', 'stitch', 'rewind']);
import { deskMarkup } from './desk';
import { animateGauges, updateGaugePreview } from './gauges';
import { tutorialState } from './title';
import { createInput } from './input';
import { updateAimPreview } from './aim';
import { playAction, type Point } from './fx';
import { choiceEffects, dismissScene } from '../core/loop';
import { advanceDrowse } from '../core/axe';
import { materializeCard } from '../core/deck';
import cards from '../../data/cards/m1.json';
import { decayFor, ERA_SCALE, GAUGE_KEYS, SLEEP_TURNS } from '../core/config';
import type { Action, Card } from '../core/state';

// Keep game input and the underlying screen out of modal keyboard navigation.
function modal(
  root: HTMLElement,
  markup: string,
  closed: () => void = () => {},
  onKey: (event: KeyboardEvent) => void = () => {},
): HTMLElement {
  playSound('click');
  const previous = document.activeElement as HTMLElement | null;
  const children = [...root.children] as HTMLElement[];
  const inert = children.map((child) => child.inert);
  children.forEach((child) => {
    child.inert = true;
  });
  const overlay = document.createElement('div');
  overlay.className = 'preferences-overlay';
  overlay.innerHTML = markup;
  root.append(overlay);
  const close = () => {
    if (overlay.isConnected) playSound('click');
    window.removeEventListener('keydown', key, true);
    overlay.remove();
    children.forEach((child, i) => {
      child.inert = inert[i]!;
    });
    if (previous?.isConnected) previous.focus();
    closed();
  };
  const key = (event: KeyboardEvent) => {
    if ([...root.querySelectorAll('.preferences-overlay')].at(-1) !== overlay)
      return;
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const scope =
        overlay.querySelector('[role="alertdialog"]:not([hidden])') ?? overlay;
      const controls = [
        ...scope.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select',
        ),
      ].filter((el) => !el.closest('[hidden], [inert]'));
      const i = controls.indexOf(document.activeElement as HTMLElement);
      controls[
        (i + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      ]?.focus();
    }
    if (event.key !== 'Escape' && event.key !== 'Tab') onKey(event);
  };
  window.addEventListener('keydown', key, true);
  overlay.addEventListener('click', (event) => {
    if ((event.target as Element).closest('button')) playSound('click');
    if ((event.target as Element).closest('[data-close]')) close();
  });
  overlay.querySelector<HTMLElement>('button, input')?.focus();
  // Also dispose the capture listener when mount is torn down.
  overlay.addEventListener('dispose', close, { once: true });
  return overlay;
}
export function openOptions(
  root: HTMLElement,
  reset: () => void,
  closed: () => void,
  unlock: () => void = () => {
    saveCollection({ ...loadCollection(), bishopUnlocked: true });
  },
  // during a run only the sound levels and fullscreen are shown; language,
  // credits and the record buttons stay on the title screen's options
  inGame = false,
): void {
  const c = system.options;
  const settings = loadSettings();
  const collection = loadCollection();
  const bishopAvailable =
    collection.cleared.apprentice ||
    collection.cleared.priest ||
    collection.bishopUnlocked;
  const overlay = modal(
    root,
    `<section class="paper preferences-card" role="dialog" aria-modal="true" aria-labelledby="options-title">
    <h2 id="options-title">${escape(c.title)}</h2>
    <div class="volume-rows">${(['sfx', 'bgm'] as const).map((kind) => `<label>${escape(c[kind])}<input data-volume="${kind}" type="range" min="0" max="100" value="${settings[kind]}"><output>${settings[kind]}</output><button type="button" class="mute" data-mute="${kind}" aria-pressed="${settings[kind] === 0}" aria-label="${escape(format(settings[kind] === 0 ? c.unmute : c.mute, { name: c[kind] }))}" title="${escape(format(settings[kind] === 0 ? c.unmute : c.mute, { name: c[kind] }))}">${MUTE_ICON}</button></label>`).join('')}</div>
    <small class="bgm-credit">${escape(c.bgmNote)}</small>
    <div class="language-row"><span id="language-label">${escape(c.language)}</span><div class="language-flags" role="radiogroup" aria-labelledby="language-label">${(['ko', 'en', 'ja'] as const).map((lang) => `<span><button type="button" class="flag" data-lang="${lang}" role="radio" aria-checked="${settings.language === lang}" aria-label="${escape(c.languages[lang])}" title="${escape(c.languages[lang])}">${FLAGS[lang]}</button><span class="flag-name">${escape(c.languages[lang])}</span></span>`).join('')}</div></div>
    ${document.fullscreenEnabled ? `<label>${escape(c.fullscreen)}<button type="button" class="fullscreen-toggle"></button></label><small>${escape(c.fullscreenNote)}</small>` : ''}
    <div class="danger-row"><button class="erase-records">${escape(c.erase)}</button><button class="unlock-bishop"${bishopAvailable ? ' disabled' : ''}>${escape(bishopAvailable ? c.unlocked : c.unlock)}</button></div>
    <div class="erase-confirm reset-confirm" data-confirm="erase" role="alertdialog" aria-label="${escape(c.erase)}" hidden><p>${escape(c.eraseConfirm)}</p><button class="erase-yes">${escape(c.eraseYes)}</button><button class="erase-no">${escape(c.eraseNo)}</button></div>
    <div class="unlock-confirm reset-confirm" data-confirm="unlock" role="alertdialog" aria-label="${escape(c.unlock)}" hidden><p>${escape(c.unlockConfirm)}</p><button class="unlock-yes">${escape(c.unlockYes)}</button><button class="unlock-no">${escape(c.unlockNo)}</button></div>
    <p class="reset-status" role="status"></p><button data-close>${escape(c.close)}</button></section>`,
    () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      closed();
    },
  );
  function updateFullscreen(): void {
    const button = overlay.querySelector('.fullscreen-toggle');
    if (button)
      button.textContent = document.fullscreenElement
        ? c.fullscreenExit
        : c.fullscreenEnter;
  }
  if (document.fullscreenEnabled) {
    updateFullscreen();
    document.addEventListener('fullscreenchange', updateFullscreen);
    overlay
      .querySelector('.fullscreen-toggle')!
      .addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else
            await document.documentElement.requestFullscreen({
              navigationUI: 'hide',
            });
        } catch {
          /* Fullscreen may be denied by the browser. */
        }
      });
  }
  // a slider and its mute button always agree: 0 shows as muted
  const syncVolume = (kind: 'sfx' | 'bgm', value: number) => {
    const input = overlay.querySelector<HTMLInputElement>(`[data-volume="${kind}"]`)!;
    input.value = String(value);
    input.nextElementSibling!.textContent = String(value);
    const button = overlay.querySelector(`[data-mute="${kind}"]`)!;
    const label = format(value === 0 ? c.unmute : c.mute, { name: c[kind] });
    button.setAttribute('aria-pressed', String(value === 0));
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };
  overlay.querySelectorAll<HTMLInputElement>('[data-volume]').forEach((input) =>
    input.addEventListener('input', () => {
      if (input.dataset.volume === 'bgm') setMusicVolume(Number(input.value));
      else setSoundVolume(Number(input.value));
      syncVolume(input.dataset.volume as 'sfx' | 'bgm', Number(input.value));
    }),
  );
  overlay.querySelectorAll<HTMLButtonElement>('[data-mute]').forEach((button) =>
    button.addEventListener('click', () => {
      const kind = button.dataset.mute as 'sfx' | 'bgm';
      const on = loadSettings()[kind] === 0;
      if (kind === 'bgm') setMusicEnabled(on);
      else setSoundEnabled(on);
      syncVolume(kind, loadSettings()[kind]);
    }),
  );
  overlay.dataset.dialog = 'options';
  overlay.toggleAttribute('data-in-game', inGame);
  overlay.querySelectorAll<HTMLButtonElement>('.flag').forEach((flag) =>
    flag.addEventListener('click', () => {
      const language = flag.dataset.lang as Lang;
      overlay
        .querySelectorAll('.flag')
        .forEach((el) => el.setAttribute('aria-checked', String(el === flag)));
      saveSettings({ ...loadSettings(), language });
      setLanguage(language);
    }),
  );
  const unlockButton =
    overlay.querySelector<HTMLButtonElement>('.unlock-bishop')!;
  for (const action of ['erase', 'unlock'] as const) {
    const trigger = overlay.querySelector<HTMLButtonElement>(
      action === 'erase' ? '.erase-records' : '.unlock-bishop',
    )!;
    const confirm = overlay.querySelector<HTMLElement>(`.${action}-confirm`)!;
    trigger.addEventListener('click', () => {
      overlay
        .querySelectorAll<HTMLElement>('[role="alertdialog"]')
        .forEach((dialog) => {
          dialog.hidden = dialog !== confirm;
        });
      overlay.querySelector<HTMLButtonElement>(`.${action}-no`)!.focus();
    });
    overlay.querySelector(`.${action}-no`)!.addEventListener('click', () => {
      confirm.hidden = true;
      trigger.focus();
    });
    overlay.querySelector(`.${action}-yes`)!.addEventListener('click', () => {
      if (action === 'erase') reset();
      else unlock();
      unlockButton.disabled = action === 'unlock';
      unlockButton.textContent = action === 'unlock' ? c.unlocked : c.unlock;
      confirm.hidden = true;
      const status = overlay.querySelector<HTMLElement>('.reset-status')!;
      status.dataset.action = action;
      status.textContent = action === 'erase' ? c.eraseDone : c.unlockDone;
      (action === 'unlock'
        ? overlay.querySelector<HTMLButtonElement>('[data-close]')!
        : trigger
      ).focus();
    });
  }
}
export function openTutorial(root: HTMLElement, startStep = 0): void {
  const c = system.tutorial;
  let state = tutorialState();
  let index = Math.max(0, Math.min(startStep, c.steps.length - 1));
  let aim: Action | null = null;
  let busy = false;
  let success = false;
  let timer: ReturnType<typeof setTimeout>;
  let sleepTimer: ReturnType<typeof setTimeout>;
  const kinds = c.steps.map((step) => step.demo);
  const daily = (cards as Card[]).filter((card) => card.kind === 'daily');
  let documentIndex = 0;
  const nextDaily = () => daily[++documentIndex % daily.length]!;
  const live = () =>
    ['stamp', 'axe', 'sleep', 'speaki'].includes(kinds[index]!);
  const forgery = () =>
    materializeCard(
      (cards as Card[]).find(
        (card) => card.kind === 'speaki' && !!card.mimic && card.axe === 'free',
      )!,
      cards as Card[],
    );
  const allowed = (action: Action) =>
    live() &&
    !state.scene &&
    (state.sleep || kinds[index] === 'stamp'
      ? action === 'approve' || action === 'reject'
      : action === 'axe');
  const overlay = modal(
    root,
    `<div class="tutorial-demo"></div><div class="tutorial-shade"></div><section class="paper tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><h2 id="tutorial-title"></h2><p class="tutorial-text"></p><div class="tutorial-items"></div><p class="tutorial-try" role="status"></p><div class="tutorial-toggle" data-toggle="era"></div><div class="card-actions"><button class="tutorial-prev">${escape(c.prev)}</button><button class="tutorial-next"></button><button data-close>${escape(c.skip)}</button></div></section>`,
    () => {
      clearTimeout(timer);
      clearTimeout(sleepTimer);
      input.dispose();
    },
    (event) => {
      if (event.key.startsWith('Arrow')) input.keyDown(event);
    },
  );
  overlay.dataset.dialog = 'tutorial';
  const demo = overlay.querySelector<HTMLElement>('.tutorial-demo')!;
  const input = createInput(demo, {
    get busy() {
      return busy;
    },
    get sleep() {
      return state.sleep;
    },
    get playing() {
      return live() && overlay.isConnected;
    },
    get aim() {
      return aim;
    },
    menuOpen: false,
    get sceneOpen() {
      return !!state.scene;
    },
    sceneKey() {},
    openMenu() {},
    menuKey() {},
    setAim(value) {
      if (
        busy ||
        value === 'scope' ||
        (value && !allowed(value))
      )
        return;
      aim = value;
      updateAimPreview(demo, state.current, aim, false, state);
    },
    canLift: (action) =>
      action !== 'scope' && allowed(action),
    stamp: (action, drop) => {
      if (action !== 'scope') stamp(action, drop);
    },
    autoStamp() {
      if (state.sleep) stamp('approve');
    },
    skip() {},
  });
  function renderDemo(): void {
    clearTimeout(sleepTimer);
    const focused = demo.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.action
      : undefined;
    input.reset();
    demo.innerHTML = deskMarkup(state);
    overlay.querySelector<HTMLElement>('.tutorial-card')!.inert = !!state.scene;
    demo.querySelector('.scene-next')?.addEventListener('click', () => {
      state = dismissScene(state);
      if (kinds[index] === 'speaki') {
        state.current = forgery();
        success = true;
      }
      busy = false;
      renderDemo();
      renderTry();
      demo
        .querySelector<HTMLButtonElement>(
          state.sleep ? '.tool.approve' : '.tool.axe',
        )!
        .focus();
    });
    demo.toggleAttribute('inert', !live());
    if (live()) {
      demo.dataset.live = 'true';
      demo.removeAttribute('aria-hidden');
    } else {
      delete demo.dataset.live;
      demo.setAttribute('aria-hidden', 'true');
    }
    // The static tutorial stylesheet disables pointer input on the demo.
    demo.style.pointerEvents = live() ? 'auto' : '';
    demo.querySelectorAll<HTMLButtonElement>('.tool').forEach((button) => {
      button.disabled =
        !state.sleep && !allowed(button.dataset.action as Action);
    });
    demo.querySelector('.menu-button')!.setAttribute('inert', '');
    hydrateArt(demo);
    input.bind();
    updateGaugePreview(demo, state.current, aim ?? 'approve', false, state);
    demo.querySelector<HTMLButtonElement>('.scene-next')?.focus();
    if (focused && !state.scene)
      demo
        .querySelector<HTMLButtonElement>(`[data-action="${focused}"]`)
        ?.focus();
    if (state.sleep && !state.scene && !busy)
      sleepTimer = setTimeout(() => stamp('approve'), 1300);
    syncFold();
  }
  // The card folds to its title while a tool is held (CSS) and also while an
  // action, a scene or Erpin's sleepy stamping plays out, so it never covers
  // the event; it opens again with the result.
  function syncFold(): void {
    overlay.toggleAttribute('data-playing', busy || state.sleep > 0 || !!state.scene);
  }
  function renderTry(): void {
    const line = overlay.querySelector<HTMLElement>('.tutorial-try')!;
    const step = c.steps[index]!;
    line.hidden = !step.try;
    line.dataset.state = success ? 'success' : 'try';
    line.textContent = (success ? step.success : step.try) ?? '';
  }
  function stamp(action: Action, drop?: Point): void {
    if (busy || !allowed(action)) return;
    if (kinds[index] === 'sleep' && success) {
      state.drowse = { stack: 2, left: decayFor(2) };
      success = false;
      renderDemo();
      renderTry();
    }
    clearTimeout(sleepTimer);
    const asleep = state.sleep > 0;
    if (asleep) action = Math.random() < 0.5 ? 'reject' : 'approve';
    busy = true;
    syncFold();
    const duration = playAction(
      demo,
      action,
      asleep ? null : (drop ?? null),
      asleep,
    );
    timer = setTimeout(() => {
      const oldGauges = state.gauges;
      if (action === 'axe') {
        if (state.current!.axe === true) {
          const fallsAsleep =
            kinds[index] === 'sleep' && state.drowse.stack === 2;
          if (kinds[index] === 'sleep')
            state.drowse = advanceDrowse(state.drowse, true, false);
          else {
            const stack = Math.min(2, state.drowse.stack + 1) as 1 | 2;
            state.drowse = { stack, left: decayFor(stack) };
          }
          if (fallsAsleep) {
            state.sleep = SLEEP_TURNS;
            state.scene = 'asleep';
            state.current = nextDaily();
            playSound('drowse');
          }
        }
        state.scene ??= state.current!.axeResult?.scene ?? null;
        if (state.scene === 'speakiCaught') playSound('speaki');
        if (kinds[index] === 'speaki' && !state.scene)
          state.current = forgery();
      } else if (action === 'approve' || action === 'reject') {
        const effects = choiceEffects(
          state.current![action],
          state.gauges,
          state.current!.kind,
          state.year,
          state.statuses,
          state,
          state.current!,
        );
        state.gauges = { ...state.gauges };
        for (const key of GAUGE_KEYS)
          state.gauges[key] = Math.max(
            1,
            Math.min(99, state.gauges[key] + (effects[key] ?? 0)),
          );
        if (asleep) {
          state.sleep--;
          state.current = nextDaily();
        }
      }
      aim = null;
      renderDemo();
      animateGauges(demo, oldGauges, state.gauges);
      if (state.scene) return;
      timer = setTimeout(
        () => {
          success = !state.sleep;
          renderTry();
          busy = false;
          syncFold();
          if (state.sleep)
            sleepTimer = setTimeout(() => stamp('approve'), 1300);
        },
        action === 'axe' ? 0 : 460,
      );
    }, duration);
  }
  const render = () => {
    clearTimeout(timer);
    clearTimeout(sleepTimer);
    busy = false;
    input.reset();
    state = tutorialState();
    documentIndex = 0;
    if (kinds[index] === 'sleep')
      state.drowse = { stack: 2, left: decayFor(2) };
    if (kinds[index] === 'axe' || kinds[index] === 'speaki')
      state.drowse = { stack: 0, left: 0 };
    if (kinds[index] === 'speaki') state.current = forgery();
    aim = null;
    success = false;
    overlay.dataset.step = String(index);
    const step = c.steps[index]!;
    overlay.dataset.focus = step.focus ?? '';
    overlay.querySelector('#tutorial-title')!.textContent = step.title;
    overlay.querySelector('.tutorial-text')!.textContent = step.text;
    // the items step shows a few real items: held ones help by themselves,
    // the others are dragged out and used
    const shown = (step as { items?: string[] }).items ?? [];
    const items = overlay.querySelector<HTMLElement>('.tutorial-items')!;
    items.hidden = !shown.length;
    items.innerHTML = shown
      .map((id) => {
        const boon = system.boons[id as keyof typeof system.boons];
        const kind = PASSIVE_ITEMS.has(id) ? 'passive' : 'active';
        const glyph = artUrl(art.boons[id] ?? art.boons.mend);
        return `<span class="tutorial-item" data-item="${id}" data-kind="${kind}"><i aria-hidden="true" style="--glyph:url('${glyph ?? ''}')"></i><b>${escape(boon.short)}</b><small>${escape(c.itemKinds[kind])}</small></span>`;
      })
      .join('');
    renderTry();
    overlay
      .querySelectorAll<HTMLElement>('.tutorial-toggle')
      .forEach((toggle) => {
        const labels = kinds[index] === 'era' && step.toggle;
        toggle.hidden = !labels;
        toggle.innerHTML = (labels || [])
          .map(
            (label, i) =>
              `<button type="button" aria-pressed="${i === 0}">${escape(label)}</button>`,
          )
          .join('');
        toggle.querySelectorAll('button').forEach((button, choice) => {
          button.addEventListener('click', () => {
            toggle
              .querySelectorAll('button')
              .forEach((el) =>
                el.setAttribute('aria-pressed', String(el === button)),
              );
            state.year =
                choice === 1
                  ? ERA_SCALE.reduce((peak, entry) =>
                      entry[1] > peak[1] ? entry : peak,
                    )[0]
                  : 0;
            updateGaugePreview(demo, state.current, 'approve', false, state);
          });
        });
      });
    overlay.querySelector<HTMLButtonElement>('.tutorial-prev')!.disabled =
      index === 0;
    overlay.querySelector('.tutorial-next')!.textContent =
      index === c.steps.length - 1 ? c.done : c.next;
    renderDemo();
  };
  overlay.querySelector('.tutorial-prev')!.addEventListener('click', () => {
    if (busy || index === 0) return;
    index--;
    render();
  });
  overlay.querySelector('.tutorial-next')!.addEventListener('click', () => {
    if (busy) return;
    if (index === c.steps.length - 1)
      overlay.querySelector<HTMLButtonElement>('[data-close]')!.click();
    else {
      index++;
      render();
    }
  });
  render();
  overlay.querySelector<HTMLButtonElement>('.tutorial-next')!.focus();
}
/** First visit: music starts muted and the player is asked once. The answer
 *  click is itself a user gesture, so 네 can start the track right away. */
export function offerMusic(root: HTMLElement, then: () => void = () => {}): void {
  const c = system.options.musicAsk;
  let answered = false;
  const answer = (on: boolean) => {
    if (answered) return;
    answered = true;
    saveSettings({ ...loadSettings(), musicAsked: true });
    setMusicEnabled(on);
  };
  const overlay = modal(
    root,
    `<section class="paper preferences-card music-ask" role="dialog" aria-modal="true" aria-label="${escape(c.title)}"><h2>${escape(c.title)}</h2><p>${escape(c.text)}</p><div class="card-actions"><button class="music-yes">${escape(c.yes)}</button><button data-close>${escape(c.no)}</button></div></section>`,
    () => {
      answer(false);
      then();
    },
  );
  overlay.dataset.dialog = 'music';
  overlay.querySelector('.music-yes')!.addEventListener('click', () => {
    answer(true);
    overlay.querySelector<HTMLButtonElement>('[data-close]')!.click();
  });
  overlay.querySelector<HTMLButtonElement>('.music-yes')!.focus();
}
export function offerTutorial(root: HTMLElement): void {
  const c = system.tutorial;
  const overlay = modal(
    root,
    `<section class="paper preferences-card" role="dialog" aria-modal="true" aria-label="${escape(c.title)}"><h2>${escape(c.title)}</h2><p>${escape(c.offer)}</p><div class="card-actions"><button class="tutorial-accept">${escape(c.offerAccept)}</button><button data-close>${escape(c.offerSkip)}</button></div></section>`,
  );
  overlay.dataset.dialog = 'offer';
  overlay.querySelector('.tutorial-accept')!.addEventListener('click', () => {
    overlay.querySelector<HTMLButtonElement>('[data-close]')!.click();
    openTutorial(root);
  });
}
