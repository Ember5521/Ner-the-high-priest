import { playSound } from './sound';
export function bindAlbum(root: HTMLElement): () => void {
  const album = root.querySelector<HTMLElement>('.album')!;
  const open = root.querySelector<HTMLButtonElement>('.album-open')!;
  const close = album.querySelector<HTMLButtonElement>('.album-close')!;
  const back = album.querySelector<HTMLButtonElement>('.album-back')!;
  const cards = [...album.querySelectorAll<HTMLButtonElement>('.album-card')];
  const details = [...album.querySelectorAll<HTMLElement>('.album-detail')];
  let selected: HTMLButtonElement | undefined;

  open.setAttribute('aria-expanded', 'false');
  function reset(): void {
    album.classList.remove('reading');
    details.forEach((detail) => (detail.hidden = true));
  }
  function showPages(): void {
    reset();
    selected?.focus();
  }
  function closeAlbum(): void {
    playSound('click');
    reset();
    album.hidden = true;
    open.setAttribute('aria-expanded', 'false');
    open.focus();
  }
  function onClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('.album-open') === open) {
      playSound('click');
      album.hidden = false;
      open.setAttribute('aria-expanded', 'true');
      close.focus();
    } else if (!album.hidden) {
      const card = target.closest<HTMLButtonElement>('.album-card');
      if (target === album || target.closest('.album-close') === close) {
        closeAlbum();
      } else if (target.closest('.album-back') === back) {
        showPages();
      } else if (card && cards.includes(card)) {
        selected = card;
        album.classList.add('reading');
        details.forEach(
          (detail) =>
            (detail.hidden = detail.dataset.ending !== card.dataset.ending),
        );
        back.focus();
      }
    }
  }
  function onKey(event: KeyboardEvent): void {
    if (album.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (event.repeat) return;
      if (album.classList.contains('reading')) showPages();
      else closeAlbum();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = [
        close,
        ...(album.classList.contains('reading') ? [back] : cards),
      ];
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        index < 0
          ? event.shiftKey
            ? buttons.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + buttons.length) %
            buttons.length;
      buttons[next]!.focus();
    }
  }
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
  };
}
