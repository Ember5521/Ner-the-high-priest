import {
  placeBlindfold,
  aimScope,
  useBandage,
} from '../core/loop';
import { deckForMode } from '../core/bishop';
import { bindTitle } from './title';
import { openOptions, openTutorial, offerMusic, offerTutorial } from './preferences';
import {
  soundEnabled,
  setSoundEnabled,
  unlockAudio,
  playSound,
  suspendAudio,
} from './sound';
import { startMusic, pauseMusic, resumeMusic } from './music';
import { updateAimPreview } from './aim';
import rawCards from '../../data/cards/m1.json';
import { system, setLanguage } from '../i18n';
import { hydrateArt } from './art';
import { deskMarkup, rewindMarkup } from './desk';
import { titleScreen, endingScreen, bestYearText } from './screens';
import { animateGauges, understudyDamped } from './gauges';
import { axeForbidden, type ToolAction } from './tools';
import { playAction, hesitateAxe, type Point } from './fx';
import { playRewindFx } from './rewindFx';
import { createInput } from './input';
import { bindTooltips } from './tooltip';
import { bindAlbum } from './album';
import { flyArrivals } from './bishopFly';
import { fireScopeOnContact } from './scopeShot';
import { bindScrollBar } from './scrollBar';
import { canRerollDaily, nextDocument } from '../core/deck';
import {
  processDocument,
  sleepCoin,
  canRewind,
  declineRewind,
  rewind,
  dismissScene as advanceScene,
} from '../core/loop';
import {
  initialState,
  earnedExtraEndings,
  type Card,
  type State,
} from '../core/state';
import {
  loadRun,
  saveRun,
  clearRun,
  loadCollection,
  saveCollection,
  loadMode,
  saveMode,
  emptyCollection,
  loadSettings,
  saveSettings,
} from '../save/storage';

const cards = rawCards as Card[];
export function mount(root: HTMLDivElement): () => void {
  setLanguage(loadSettings().language);
  const tips = bindTooltips(root);
  let sheetOpen = false;
  // 주교: effects already shown in the pill/tray, so only new ones fly in
  let seenEffects: Set<string> | null = null;
  let refreshingLanguage = false;
  let refreshEnding: (() => void) | undefined;
  const unlockGameAudio = () => { unlockAudio(); startMusic(); };
  root.addEventListener('pointerdown', unlockGameAudio, true);
  const clickSound = (event: MouseEvent) => {
    if (
      !refreshingLanguage &&
      (event.target as Element).closest(
        '[data-menu], [data-rewind], .return, .options-open, .tutorial-open',
      )
    )
      playSound('click');
  };
  root.addEventListener('click', clickSound, true);
  window.addEventListener('keydown', unlockGameAudio, true);
  let state: State = initialState();
  let mode = loadMode();
  let collection = loadCollection();
  let runCards = cards;
  let screen: 'title' | 'game' | 'ending' = 'title';
  let aim: ToolAction | null = null;
  let busy = false;
  let menuOpen = false;
  let runDiscarded = false;
  let menuAction: 'restart' | 'title' | null = null;
  let removingHistoryGuard = false;
  function pushHistoryGuard(): void {
    if (!removingHistoryGuard && !history.state?.nerGuard)
      history.pushState({ nerGuard: true }, '');
  }
  function removeHistoryGuard(): void {
    if (removingHistoryGuard || !history.state?.nerGuard) return;
    removingHistoryGuard = true;
    history.back();
  }
  function onPopState(): void {
    if (removingHistoryGuard) {
      removingHistoryGuard = false;
      // A restart must wait for the old entry to be popped before pushing again.
      if (screen === 'game') pushHistoryGuard();
      return;
    }
    if (screen !== 'game') return;
    if (!menuOpen && !state.scene && !canRewind(state) && !state.ending)
      openMenu();
  }
  let animationTimer: ReturnType<typeof setTimeout> | undefined;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  let finish: (() => void) | null = null;
  let disposeTitle: (() => void) | undefined;
  let disposeAlbum: (() => void) | undefined;
  const cancelTimers = () => {
    clearTimeout(animationTimer);
    clearTimeout(sleepTimer);
    finish = null;
    busy = false;
  };
  function title(): void {
    tips.close();
    sheetOpen = false;
    disposeTitle?.();
    disposeAlbum?.();
    cancelTimers();
    input.reset();
    menuOpen = false;
    if (screen === 'game') removeHistoryGuard();
    screen = 'title';
    aim = null;
    if (
      mode === 'bishop' &&
      !collection.cleared.apprentice &&
      !collection.cleared.priest &&
      !collection.bishopUnlocked
    )
      mode = 'priest';
    const saved = loadRun(cards);
    root.innerHTML = titleScreen(collection, mode, saved);
    root.querySelector('.title-continue')?.addEventListener('click', () => {
      if (saved) start(saved);
    });
    disposeTitle = bindTitle(
      root,
      mode,
      (selected) => {
        mode = selected;
        saveMode(mode);
      },
      () => start(),
      {
        resume: saved ? () => start(saved) : undefined,
        tutorial: () => openTutorial(root),
      },
    );
    root.querySelector('.options-open')!.addEventListener('click', options);
    root
      .querySelector('.tutorial-open')!
      .addEventListener('click', () => openTutorial(root));
    hydrateArt(root);
    disposeAlbum = bindAlbum(root);
  }
  function start(saved?: State): void {
    runDiscarded = false;
    seenEffects = null;
    clearRun();
    if (screen === 'game') removeHistoryGuard();
    disposeTitle?.();
    disposeAlbum?.();
    disposeAlbum = undefined;
    cancelTimers();
    menuOpen = false;
    aim = null;
    runCards = deckForMode(cards, saved?.mode ?? mode);
    state = nextDocument(saved ?? initialState(mode), runCards, Math.random);
    mode = state.mode;
    saveMode(mode);
    screen = 'game';
    pushHistoryGuard();
    if (!saved) arrivalSounds();
    render();
  }
  function ending(): void {
    tips.close();
    sheetOpen = false;
    cancelTimers();
    input.reset();
    clearRun();
    screen = 'ending';
    removeHistoryGuard();
    const id = state.ending!.id;
    const extras = earnedExtraEndings(state);
    const newEndings = new Set(
      [id, ...extras].filter((key) => !collection.endings.includes(key)),
    );
    collection = {
      ...collection,
      bestYear: {
        ...collection.bestYear,
        [state.mode]: Math.max(
          collection.bestYear[state.mode],
          state.year,
          state.bestYear,
        ),
      },
      endings: [...new Set([...collection.endings, id, ...extras])],
      cleared: {
        ...collection.cleared,
        ...(state.mode === 'bishop'
          ? {}
          : { [state.mode]: collection.cleared[state.mode] || id === 'true' }),
      },
    };
    saveCollection(collection);
    const sequence = [id, ...extras];
    function showEnding(index: number): void {
      refreshEnding = () => showEnding(index);
      if (
        !refreshingLanguage &&
        (sequence[index] === 'true' || newEndings.has(sequence[index]!))
      )
        playSound('unlock');
      const hasNext = index < sequence.length - 1;
      root.innerHTML = endingScreen(
        { ...state, ending: { ...state.ending!, id: sequence[index]! } },
        collection,
        hasNext,
      );
      hydrateArt(root);
      root.querySelector('.return')!.addEventListener('click', () => {
        if (hasNext) showEnding(index + 1);
        else title();
      });
      root.querySelector<HTMLButtonElement>('.return')!.focus();
    }
    showEnding(0);
  }
  function options(): void {
    openOptions(
      root,
      () => {
        clearRun();
        runDiscarded = true;
        collection = emptyCollection();
        saveCollection(collection);
      },
      () => {
        if (refreshingLanguage) return;
        if (screen === 'title' || runDiscarded) title();
        else {
          const button = root.querySelector('[data-menu="sound"]');
          button?.setAttribute('aria-pressed', String(soundEnabled()));
          if (button)
            button.textContent = soundEnabled()
              ? system.ui.soundOn
              : system.ui.soundOff;
          const record = root.querySelector('.menu-note .best-year');
          if (record)
            record.textContent = bestYearText(
              collection.bestYear[state.mode],
              state.mode,
            );
        }
      },
      () => {
        collection = { ...collection, bishopUnlocked: true };
        saveCollection(collection);
        const bishop = root.querySelector('[data-mode="bishop"]');
        tips.close();
        bishop?.removeAttribute('aria-disabled');
        bishop?.removeAttribute('data-tip');
        bishop?.removeAttribute('data-tip-title');
        bishop?.removeAttribute('data-tip-text');
        bishop?.querySelector('.mode-lock')?.remove();
      },
      screen === 'game',
    );
  }
  function render(): void {
    tips.close();
    sheetOpen = false;
    clearTimeout(sleepTimer);
    input.reset();
    if (!runDiscarded && (!state.ending || canRewind(state))) saveRun(state);
    if (canRewind(state)) {
      renderRewind();
      return;
    }
    if (state.ending) {
      ending();
      return;
    }
    const scene = state.scene;
    root.innerHTML = deskMarkup(
      state,
      collection.bestYear[state.mode],
      runCards,
    );
    hydrateArt(root);
    bindScrollBar(root);
    input.bind();
    root
      .querySelector('.bishop-pill')
      ?.addEventListener('pointerdown', (event) => event.stopPropagation());
    root.querySelector('.bishop-pill')?.addEventListener('click', openSheet);
    root
      .querySelector('.bishop-sheet-close')
      ?.addEventListener('click', closeSheet);
    root.querySelector('.bishop-sheet')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeSheet();
    });
    root.querySelector('.menu-button')!.addEventListener('click', openMenu);
    root.querySelector('.menu')!.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeMenu();
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-menu]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          if (!menuOpen) return;
          const action = button.dataset.menu;
          if (action === 'sound') {
            const on = !soundEnabled();
            setSoundEnabled(on);
            button.setAttribute('aria-pressed', String(on));
            button.textContent = on ? system.ui.soundOn : system.ui.soundOff;
          } else if (action === 'options') options();
          else if (action === 'resume') closeMenu();
          else if (action === 'back') showMenuPage(null);
          else if (action === 'restart' || action === 'title')
            showMenuPage(action);
          else if (action === 'confirm') {
            if (menuAction === 'restart') start();
            else if (menuAction === 'title') title();
          }
        });
      });
    updateAim();
    if (state.bishop?.notices.length) {
      root
        .querySelectorAll('.desk > :not(.bishop-notice)')
        .forEach((el) => el.setAttribute('inert', ''));
      const button = root.querySelector<HTMLButtonElement>(
        '.bishop-notice-next',
      )!;
      button.addEventListener('click', dismissNotice);
      button.focus();
    } else if (scene) {
      root
        .querySelectorAll('.desk > :not(.scene)')
        .forEach((element) => element.setAttribute('inert', ''));
      const button = root.querySelector<HTMLButtonElement>('.scene-next')!;
      button.addEventListener('click', dismissScene);
      button.focus();
    } else if (state.sleep && !state.current?.blessings)
      sleepTimer = setTimeout(() => autoStamp(true), 1300);
    // wait until the omen card or the blessing choice is out of the way
    if (state.bishop && !state.bishop.notices.length && !scene && !state.current?.blessings)
      seenEffects = flyArrivals(root, state, seenEffects);
  }
  function renderRewind(): void {
    const markup = rewindMarkup(!!state.boss);
    if (!root.querySelector('.desk:not(.title-screen)'))
      root.innerHTML = deskMarkup(
        {
          ...state,
          current:
            state.current ??
            state.past.at(-1)?.current ??
            runCards.find((c) => c.kind === 'daily')!,
        },
        collection.bestYear[state.mode],
        runCards,
      );
    const desk = root.querySelector('.desk');
    if (desk) {
      desk.querySelector('.scene')?.remove();
      [...desk.children].forEach((element) =>
        element.setAttribute('inert', ''),
      );
      desk.insertAdjacentHTML('beforeend', markup);
    } else root.innerHTML = markup;
    hydrateArt(root);
    root
      .querySelectorAll<HTMLButtonElement>('[data-rewind]')
      .forEach((button) =>
        button.addEventListener('click', async () => {
          if (busy) return;
          if (button.dataset.rewind === 'yes') {
            const from = state.year;
            const next = rewind(state, runCards, Math.random);
            busy = true;
            root.setAttribute('inert', '');
            await playRewindFx(from, next.year, () => {
              state = next;
              render();
            });
            root.removeAttribute('inert');
            busy = false;
            root
              .querySelector<HTMLButtonElement>('.scene-next, .menu-button')
              ?.focus();
          } else {
            const next = declineRewind(state, runCards, Math.random);
            if (next === state) ending();
            else {
              state = next;
              render();
            }
          }
        }),
      );
    root.querySelector<HTMLButtonElement>('[data-rewind="yes"]')!.focus();
  }
  function arrivalSounds(previous?: State): void {
    if (state.ending) {
      if (!previous?.ending && state.ending.id !== 'true')
        playSound('gameover');
      return;
    }
    if (state.current && state.current !== previous?.current) {
      playSound('paper');
      if (state.current.speaker === 'worldtree') playSound('drowse');
    }
    if (state.scene !== previous?.scene) {
      if (state.scene === 'asleep') playSound('drowse');
      if (state.scene === 'speakiCaught' || state.scene === 'speakiFooled')
        playSound('speaki');
      if (state.scene === 'erpinSave' || state.scene === 'stitch' || state.scene === 'kickout')
        playSound('boon');
    }
  }
  function dismissScene(): void {
    if (!state.scene) return;
    playSound('click');
    const previous = state;
    state = advanceScene(state);
    arrivalSounds(previous);
    render();
    root.querySelector<HTMLButtonElement>('.scene-next, .menu-button')!.focus();
  }
  function dismissNotice(): void {
    if (!state.bishop?.notices.length) return;
    state = {
      ...state,
      bishop: { ...state.bishop, notices: state.bishop.notices.slice(1) },
    };
    render();
    root
      .querySelector<HTMLButtonElement>(
        '.bishop-notice-next, .scene-next, .menu-button',
      )
      ?.focus();
  }
  function openSheet(): void {
    if (
      sheetOpen ||
      menuOpen ||
      busy ||
      state.scene ||
      state.ending ||
      state.bishop?.notices.length ||
      canRewind(state)
    )
      return;
    tips.close();
    clearTimeout(sleepTimer);
    input.reset(true);
    setAim(null);
    sheetOpen = true;
    updateAim();
    const sheet = root.querySelector<HTMLElement>('.bishop-sheet')!;
    // on a phone the sheet drops from under the top bar, beside the pill
    const bar = root.querySelector('.topbar')?.getBoundingClientRect();
    const desk = sheet.parentElement!.getBoundingClientRect();
    sheet.style.setProperty('--sheet-top', `${Math.max(0, (bar?.bottom ?? desk.top) - desk.top)}px`);
    sheet.hidden = false;
    root.querySelector('.bishop-pill')!.setAttribute('aria-expanded', 'true');
    root
      .querySelectorAll('.desk > :not(.bishop-sheet)')
      .forEach((el) => el.setAttribute('inert', ''));
    root.querySelector<HTMLButtonElement>('.bishop-sheet-close')!.focus();
  }
  function closeSheet(): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    updateAim();
    root.querySelector<HTMLElement>('.bishop-sheet')!.hidden = true;
    root
      .querySelectorAll('.desk > [inert]')
      .forEach((el) => el.removeAttribute('inert'));
    const pill = root.querySelector<HTMLButtonElement>('.bishop-pill')!;
    pill.setAttribute('aria-expanded', 'false');
    pill.focus();
    if (state.sleep && !state.current?.blessings)
      sleepTimer = setTimeout(() => autoStamp(true), 1300);
  }
  function sceneKey(event: KeyboardEvent): void {
    if (sheetOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!event.repeat) closeSheet();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        root.querySelector<HTMLButtonElement>('.bishop-sheet-close')!.focus();
      } else if (
        !['Enter', ' '].includes(event.key) ||
        !(event.target instanceof Node) ||
        !root.querySelector('.bishop-sheet')!.contains(event.target)
      )
        event.preventDefault();
      return;
    }
    if (!state.ending && state.bishop?.notices.length) {
      event.preventDefault();
      if (event.key === 'Tab')
        root.querySelector<HTMLButtonElement>('.bishop-notice-next')?.focus();
      else if (!event.repeat && ['Enter', ' '].includes(event.key))
        dismissNotice();
      return;
    }
    if (busy) return;
    if (canRewind(state)) {
      if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = [
          ...root.querySelectorAll<HTMLButtonElement>('[data-rewind]'),
        ];
        buttons[
          (buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % 2
        ]!.focus();
      } else if (!event.repeat && event.key === 'Escape') {
        event.preventDefault();
        ending();
      }
      return;
    }
    event.preventDefault();
    if (event.key === 'Tab')
      root.querySelector<HTMLButtonElement>('.scene-next')!.focus();
    else if (!event.repeat && [' ', 'Enter', 'Escape'].includes(event.key))
      dismissScene();
  }
  function showMenuPage(action: 'restart' | 'title' | null): void {
    menuAction = action;
    root.querySelector<HTMLElement>('.menu-main')!.hidden = action !== null;
    root.querySelector<HTMLElement>('.menu-confirm')!.hidden = action === null;
    root.querySelector('.menu-confirm .menu-title')!.textContent =
      action === 'restart'
        ? system.ui.restartConfirm
        : action === 'title'
          ? system.ui.titleConfirm
          : '';
    root
      .querySelector<HTMLButtonElement>(
        action ? '[data-menu="confirm"]' : '[data-menu="resume"]',
      )!
      .focus();
  }
  function openMenu(): void {
    if (sheetOpen) return;
    tips.close();
    finish?.();
    if (
      screen !== 'game' ||
      menuOpen ||
      state.scene ||
      state.bishop?.notices.length ||
      busy ||
      state.ending
    )
      return;
    clearTimeout(sleepTimer);
    input.reset(true);
    setAim(null);
    if (!refreshingLanguage) playSound('click');
    menuOpen = true;
    updateAim();
    root.querySelector<HTMLElement>('.menu')!.hidden = false;
    showMenuPage(null);
  }
  function closeMenu(): void {
    playSound('click');
    pushHistoryGuard();
    menuOpen = false;
    updateAim();
    root.querySelector<HTMLElement>('.menu')!.hidden = true;
    root.querySelector<HTMLButtonElement>('.menu-button')!.focus();
    if (state.sleep && !state.current?.blessings)
      sleepTimer = setTimeout(() => autoStamp(true), 1300);
  }
  function menuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (event.repeat) return;
      if (menuAction) showMenuPage(null);
      else closeMenu();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = [
        ...root.querySelectorAll<HTMLButtonElement>(
          menuAction ? '.menu-confirm button' : '.menu-main button',
        ),
      ];
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      buttons[
        (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
      ]!.focus();
    } else if (
      event.key !== 'Enter' ||
      !root.querySelector('.menu')!.contains(document.activeElement)
    ) {
      event.preventDefault();
    }
  }
  function updateAim(): void {
    root.querySelector('.bandage-slot')?.setAttribute('aria-disabled', String(menuOpen || sheetOpen || !!state.ending || !!state.scene || !!state.sleep || !!state.bishop?.notices.length || Object.values(state.gauges).every(value => value === 50)));
    updateAimPreview(root, state.current, aim, state.drowse.stack === 2, state);
  }

  function setAim(value: ToolAction | null): void {
    if (value === 'scope' && aimScope(state) === state) return;
    if (value === 'bullet' && !(state.boons.bullet! > 0)) return;
    if (value === 'alice' && !state.boons.alice) return;
    if (
      state.current &&
      ((value === 'axe' && axeForbidden(state.current)) ||
        (value === 'bullet' && state.current.axe === false) ||
        (value === 'alice' && !canRerollDaily(state, runCards)))
    ) {
      stamp(value!);
      return;
    }
    aim = value;
    updateAim();
  }
  function autoStamp(automatic = false): void {
    if (
      screen === 'game' &&
      state.sleep &&
      !state.current?.blessings &&
      !busy &&
      !menuOpen &&
      !state.scene
    )
      stamp('approve', undefined, automatic);
  }
  function stamp(action: ToolAction, drop?: Point, automatic = false): void {
    if (sheetOpen || menuOpen || state.scene || state.bishop?.notices.length)
      return;
    if (!automatic && screen === 'game') pushHistoryGuard();
    if (busy) {
      finish?.();
      return;
    }
    const card = state.current;
    if (!card || screen !== 'game') return;
    if (
      (action === 'axe' && axeForbidden(card)) ||
      (action === 'bullet' &&
        (card.axe === false || !(state.boons.bullet! > 0))) ||
      (action === 'alice' && !canRerollDaily(state, runCards))
    ) {
      aim = null;
      updateAim();
      hesitateAxe(root, action);
      return;
    }
    if (action === 'scope') {
      const next = aimScope(state);
      if (next === state) return;
      state = next;
      aim = null;
      render();
      return;
    }
    clearTimeout(sleepTimer);
    const random = Math.random();
    const asleep = state.sleep > 0 && !card.blessings;
    const actual = asleep ? (random < 0.5 ? 'reject' : 'approve') : action;
    busy = true;
    const duration = playAction(
      root,
      actual,
      actual === action ? (drop ?? null) : null,
      asleep,
    );
    // an aimed document: bang and tracers the moment the stamp lands
    if (state.scoped && (actual === 'approve' || actual === 'reject'))
      fireScopeOnContact(root, state, actual);
    let completed = false;
    finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(animationTimer);
      finish = null;
      busy = false;
      aim = null;
      const previous = state;
      const oldGauges = state.gauges;
      const softened =
        (actual === 'reject' || actual === 'approve') &&
        card.axe !== 'free' &&
        understudyDamped(
          card[actual],
          state.gauges,
          card,
          state.year,
          state.statuses,
          state,
        );
      state = processDocument(
        state,
        actual,
        runCards,
        asleep ? sleepCoin(random) : Math.random,
      );
      if (state !== previous && !previous.sleep && actual !== 'alice') {
        const settings = loadSettings();
        saveSettings({ ...settings, stampsSeen: settings.stampsSeen + 1 });
      }
      const grant =
        (actual === 'approve' || actual === 'reject') && card[actual].grant;
      if (state !== previous && grant)
        playSound(grant.boon === 'bullet' ? 'shot' : 'boon');
      arrivalSounds(previous);
      collection.bestYear[state.mode] = Math.max(
        collection.bestYear[state.mode],
        state.year,
        state.bestYear,
      );
      saveCollection(collection);
      render();
      if (card.axe !== 'free' || (actual !== 'reject' && actual !== 'approve'))
        animateGauges(root, oldGauges, state.gauges);
      // the direction stayed hidden on the preview; the understudy owns up now
      if (softened && state !== previous)
        root
          .querySelector('.status-icon[data-boon="understudy"]')
          ?.classList.add('understudy-acted');
    };
    animationTimer = setTimeout(() => finish?.(), duration);
  }
  const input = createInput(root, {
    useBandage(gauge) {
      if (menuOpen || sheetOpen || state.bishop?.notices.length) return;
      const previous = state;
      state = useBandage(state, gauge);
      if (state === previous) return;
      render();
      animateGauges(root, previous.gauges, state.gauges);
    },
    placeBlindfold(gauge) {
      state = placeBlindfold(state, gauge);
      render();
    },
    get sceneOpen() {
      return (
        sheetOpen ||
        state.scene !== null ||
        !!state.bishop?.notices.length ||
        canRewind(state)
      );
    },
    sceneKey,
    get menuOpen() {
      return menuOpen;
    },
    openMenu,
    menuKey,
    get busy() {
      return busy;
    },
    get sleep() {
      return state.current?.blessings ? 0 : state.sleep;
    },
    get playing() {
      return screen === 'game';
    },
    get aim() {
      return aim;
    },
    setAim,
    canLift(action) {
      const card = state.current;
      if (action === 'scope' && aimScope(state) === state) return false;
      if (
        card &&
        ((action === 'axe' && axeForbidden(card)) ||
          (action === 'bullet' &&
            (card.axe === false || !(state.boons.bullet! > 0))) ||
          (action === 'alice' && !canRerollDaily(state, runCards)))
      ) {
        stamp(action);
        return false;
      }
      return true;
    },
    stamp,
    autoStamp,
    skip: () => finish?.(),
  });
  function refreshLanguage(): void {
    refreshingLanguage = true;
    const dialogs = [
      ...root.querySelectorAll<HTMLElement>('.preferences-overlay'),
    ].map((overlay) => ({
      kind: overlay.dataset.dialog,
      step: Number(overlay.dataset.step ?? 0),
      confirming: overlay.querySelector<HTMLElement>(
        '[data-confirm]:not([hidden])',
      )?.dataset.confirm,
      status:
        overlay.querySelector<HTMLElement>('.reset-status')?.dataset.action,
    }));
    const wasSheetOpen = sheetOpen;
    const wasMenuOpen = menuOpen;
    const previousMenuAction = menuAction;
    const albumOpen = !!root.querySelector('.album:not([hidden])');
    const albumId = root.querySelector<HTMLElement>(
      '.album-detail:not([hidden])',
    )?.dataset.ending;
    root
      .querySelectorAll('.preferences-overlay')
      .forEach((el) => el.dispatchEvent(new Event('dispose')));
    if (screen === 'title') title();
    else if (screen === 'ending') refreshEnding?.();
    else {
      menuOpen = false;
      root.innerHTML = '';
      render();
      if (wasSheetOpen) openSheet();
      if (wasMenuOpen) {
        openMenu();
        showMenuPage(previousMenuAction);
      }
    }
    if (albumOpen) {
      root.querySelector<HTMLButtonElement>('.album-open')?.click();
      if (albumId)
        root
          .querySelector<HTMLButtonElement>(
            `.album-card[data-ending="${albumId}"]`,
          )
          ?.click();
    }
    for (const dialog of dialogs) {
      if (dialog.kind === 'options') {
        options();
        if (dialog.confirming)
          root
            .querySelector<HTMLButtonElement>(
              dialog.confirming === 'erase'
                ? '.erase-records'
                : '.unlock-bishop',
            )
            ?.click();
        if (dialog.status) {
          const status = root.querySelector<HTMLElement>('.reset-status')!;
          status.dataset.action = dialog.status;
          status.textContent =
            dialog.status === 'erase'
              ? system.options.eraseDone
              : system.options.unlockDone;
        }
      } else if (dialog.kind === 'tutorial') openTutorial(root, dialog.step);
      else if (dialog.kind === 'offer') offerTutorial(root);
    }
    refreshingLanguage = false;
  }
  window.addEventListener('languagechange', refreshLanguage);
  function persistRun(): void {
    if (
      !runDiscarded &&
      screen === 'game' &&
      (!state.ending || canRewind(state))
    )
      saveRun(state);
  }
  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      persistRun();
      pauseMusic();
      suspendAudio();
    } else {
      resumeMusic();
    }
  }
  window.addEventListener('pagehide', persistRun);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('popstate', onPopState);
  title();
  const settings = loadSettings();
  // first visit: ask about the music, then (for a new player) offer the tutorial
  const offerFirstTutorial = () => {
    const now = loadSettings();
    if (now.tutorialSeen) return;
    saveSettings({ ...now, tutorialSeen: true });
    if (
      !collection.endings.length &&
      !collection.bestYear.apprentice &&
      !collection.bestYear.priest
    )
      offerTutorial(root);
  };
  if (!settings.musicAsked) offerMusic(root, offerFirstTutorial);
  else offerFirstTutorial();
  return () => {
    root
      .querySelectorAll('.preferences-overlay')
      .forEach((el) => el.dispatchEvent(new Event('dispose')));
    window.removeEventListener('languagechange', refreshLanguage);
    disposeTitle?.();
    disposeAlbum?.();
    cancelTimers();
    tips.dispose();
    input.dispose();
    root.removeEventListener('pointerdown', unlockGameAudio, true);
    root.removeEventListener('click', clickSound, true);
    window.removeEventListener('keydown', unlockGameAudio, true);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pagehide', persistRun);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export { boonsMarkup } from './desk';
