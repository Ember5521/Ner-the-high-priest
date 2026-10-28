import type { Mode, Card } from '../core/state';
import { initialState } from '../core/state';
import cards from '../../data/cards/m1.json';
import { artSlot, hydrateArt } from './art';
import { liftTool, moveTool, dropTool } from './fx';
import { playSound } from './sound';

export function bindTitle(
  root: HTMLElement,
  selected: Mode,
  select: (mode: Mode) => void,
  start: () => void,
  { resume, tutorial }: { resume?: () => void; tutorial: () => void },
): () => void {
  const bindings = new AbortController();
  const { signal } = bindings;
  const papers = [...root.querySelectorAll<HTMLButtonElement>('.mode-option')];
  const targetSelector = '.mode-option, .title-continue, .title-tutorial';
  const targets = [...root.querySelectorAll<HTMLButtonElement>(targetSelector)];
  const continuePaper = root.querySelector('.title-continue');
  const tutorialPaper = root.querySelector('.title-tutorial');
  const home = root.querySelector<HTMLButtonElement>('.title-stamp')!;
  // Use the game's lifted stamp and return animation on the title desk.
  root.querySelector('.title-screen')!.classList.add('desk');
  home.classList.add('tool');
  home.dataset.action = 'approve';
  let stamping = false;
  let timer: ReturnType<typeof setTimeout>;
  let tutorialTimer: ReturnType<typeof setTimeout> | undefined;
  let tutorialCleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let pointer: number | null = null;
  const nudgeTimers = new Map<
    HTMLButtonElement,
    ReturnType<typeof setTimeout>
  >();
  const locked = (paper: HTMLButtonElement) =>
    paper.getAttribute('aria-disabled') === 'true';
  const nudge = (paper: HTMLButtonElement) => {
    clearTimeout(nudgeTimers.get(paper));
    paper.classList.remove('locked-nudge');
    void paper.offsetWidth;
    paper.classList.add('locked-nudge');
    nudgeTimers.set(
      paper,
      setTimeout(() => {
        paper.classList.remove('locked-nudge');
        nudgeTimers.delete(paper);
      }, 450),
    );
  };
  const paperAt = (x: number, y: number) => {
    if (typeof document.elementsFromPoint === 'function') {
      for (const element of document.elementsFromPoint(x, y)) {
        const paper = element.closest<HTMLButtonElement>(targetSelector);
        if (paper && targets.includes(paper)) return paper;
      }
      return undefined;
    }
    return targets.find((paper) => {
      const b = paper.getBoundingClientRect();
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    });
  };
  const aim = (target?: HTMLButtonElement) => {
    targets.forEach((paper) =>
      paper.classList.toggle('aimed', paper === target),
    );
  };
  const choose = (mode: Mode) => {
    selected = mode;
    select(mode);
    papers.forEach((paper) => {
      paper.setAttribute('aria-checked', String(paper.dataset.mode === mode));
      paper.tabIndex = paper.dataset.mode === mode ? 0 : -1;
    });
  };
  const clearTutorialImprint = () => {
    tutorialPaper
      ?.querySelectorAll('.title-imprint')
      .forEach((ink) => ink.remove());
    tutorialPaper?.classList.remove('stamped');
  };
  const stamp = (paper: HTMLButtonElement) => {
    if (stamping || tutorialTimer !== undefined) return;
    if (locked(paper)) {
      nudge(paper);
      dropTool(root);
      return;
    }
    const isTutorial = paper === tutorialPaper;
    if (isTutorial) {
      clearTimeout(tutorialCleanupTimer);
      clearTutorialImprint();
      void paper.offsetWidth;
    } else {
      stamping = true;
      if (paper !== continuePaper) choose(paper.dataset.mode as Mode);
      root.querySelector('.title-screen')!.setAttribute('inert', '');
    }
    const ink = document.createElement('span');
    ink.className = 'title-imprint';
    ink.setAttribute('aria-hidden', 'true');
    ink.innerHTML = artSlot('ui', 'stampApprove', '');
    paper.append(ink);
    hydrateArt(ink);
    // the lifted stamp itself comes down on the paper and goes back home,
    // like the stamps on the desk; it leaves only the ink behind
    const lifted = root.querySelector<HTMLElement>('.ghost');
    if (lifted) {
      lifted.style.setProperty('--travel', '0ms');
      lifted.classList.add('striking');
      setTimeout(() => dropTool(root), 140);
    }
    // the same thump as a real approval: sound, the paper gives under the stamp
    playSound('stamp');
    paper.classList.add('stamped');
    if (isTutorial) {
      // the stamp shows at home again once it has flown back (dropTool)
      tutorialTimer = setTimeout(() => {
        tutorialTimer = undefined;
        tutorial();
      }, 320);
      tutorialCleanupTimer = setTimeout(clearTutorialImprint, 900);
      return;
    }
    home.classList.add('used');
    timer = setTimeout(paper === continuePaper ? () => resume?.() : start, 620);
  };
  papers.forEach((paper) => {
    paper.addEventListener(
      'click',
      () => {
        if (!stamping) {
          if (locked(paper)) nudge(paper);
          else if (selected === paper.dataset.mode) stamp(paper);
          else choose(paper.dataset.mode as Mode);
        }
      },
      { signal },
    );
    paper.addEventListener(
      'keydown',
      (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key))
          return;
        event.preventDefault();
        if (event.repeat || stamping) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const selectable = papers.filter((p) => !locked(p));
          const index = selectable.findIndex(
            (p) => p.dataset.mode === selected,
          );
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          const target =
            selectable[
              (index + direction + selectable.length) % selectable.length
            ]!;
          choose(target.dataset.mode as Mode);
          target.focus();
        } else {
          if (locked(paper)) nudge(paper);
          else stamp(papers.find((p) => p.dataset.mode === selected)!);
        }
      },
      { signal },
    );
  });
  home.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.button !== 0 ||
        stamping ||
        tutorialTimer !== undefined ||
        pointer !== null
      )
        return;
      event.preventDefault();
      pointer = event.pointerId;
      home.setPointerCapture?.(pointer);
      liftTool(root, 'approve', {
        x: event.clientX,
        y: event.clientY,
      }).classList.add('title-ghost');
    },
    { signal },
  );
  home.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId === pointer) {
        moveTool(root, { x: event.clientX, y: event.clientY });
        aim(paperAt(event.clientX, event.clientY));
      }
    },
    { signal },
  );
  const release = (event: PointerEvent) => {
    if (pointer === null || event.pointerId !== pointer) return;
    pointer = null;
    aim();
    const paper =
      event.type === 'pointerup'
        ? paperAt(event.clientX, event.clientY)
        : undefined;
    if (paper) stamp(paper);
    else dropTool(root);
  };
  home.addEventListener('pointerup', release, { signal });
  home.addEventListener('pointercancel', release, { signal });
  home.addEventListener('lostpointercapture', release, { signal });
  papers.find((paper) => paper.dataset.mode === selected)?.focus();
  return () => {
    bindings.abort();
    clearTimeout(timer);
    clearTimeout(tutorialTimer);
    clearTimeout(tutorialCleanupTimer);
    clearTutorialImprint();
    nudgeTimers.forEach(clearTimeout);
    targets.forEach((paper) => paper.classList.remove('locked-nudge', 'aimed'));
    root.querySelector('.ghost')?.remove();
  };
}

export function tutorialState() {
  const state = initialState('apprentice');
  state.current = (cards as Card[]).find((card) => card.kind === 'daily')!;
  state.drowse = { stack: 0, left: 0 };
  return state;
}
