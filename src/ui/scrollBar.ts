// A small coffee-brown thumb on the paper's right edge, shown only while the
// letter is longer than its box: touch screens hide the native scrollbar until
// you scroll, so a long letter used to look complete.
export function bindScrollBar(root: ParentNode): void {
  const paper = root.querySelector<HTMLElement>('.document');
  const text = paper?.querySelector<HTMLElement>('.body-text');
  const bar = paper?.querySelector<HTMLElement>('.scroll-bar');
  if (!paper || !text || !bar) return;
  const thumb = bar.firstElementChild as HTMLElement;
  const update = () => {
    const view = text.clientHeight;
    const full = text.scrollHeight;
    bar.hidden = full - view < 2;
    if (bar.hidden) return;
    // the track spans the text box; the last 20px are the fade, so it stops short
    const track = Math.max(0, view - 16);
    const size = Math.max(18, (track * view) / full);
    const moved = text.scrollTop / (full - view);
    bar.style.top = `${text.offsetTop}px`;
    bar.style.height = `${track}px`;
    thumb.style.height = `${size}px`;
    thumb.style.translate = `0 ${(track - size) * moved}px`;
  };
  text.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(update).observe(text);
  document.fonts?.ready.then(update);
  update();
}
