let nextTip = 0;

export function bindTooltips(root: HTMLElement) {
  const events = new AbortController();
  const options = { capture: true, signal: events.signal };
  let target: HTMLElement | null = null;
  let tip: HTMLElement | null = null;
  let describedBy: string | null = null;
  const find = (event: Event) =>
    (event.target as Element).closest?.<HTMLElement>('[data-tip]') ?? null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function close() {
    clearTimeout(closeTimer);
    if (target) {
      if (describedBy === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', describedBy);
    }
    if (tip) tip.hidden = true;
    target = null;
  }
  function position() {
    if (!target || !tip) return;
    const rect = target.getBoundingClientRect();
    tip.style.position = 'fixed';
    tip.style.boxSizing = 'border-box';
    tip.style.maxWidth = `${Math.max(0, window.innerWidth - 16)}px`;
    tip.style.maxHeight = `${Math.max(0, window.innerHeight - 16)}px`;
    tip.style.overflow = 'auto';
    const size = tip.getBoundingClientRect();
    const below = rect.bottom + 8 + size.height <= window.innerHeight - 8;
    tip.dataset.side = below ? 'below' : 'above';
    tip.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - size.width / 2, window.innerWidth - size.width - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(below ? rect.bottom + 8 : rect.top - size.height - 8, window.innerHeight - size.height - 8))}px`;
  }
  function show(element: HTMLElement) {
    if (element.closest('[inert], [hidden]')) return;
    close();
    tip = root.querySelector<HTMLElement>('.tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      tip.setAttribute('role', 'tooltip');
      tip.innerHTML = '<b></b><span></span>';
      root.append(tip);
    }
    tip.id ||= `tip-${++nextTip}`;
    tip.querySelector('b')!.textContent = element.dataset.tipTitle ?? '';
    tip.querySelector('span')!.textContent = element.dataset.tipText ?? '';
    tip.hidden = false;
    target = element;
    describedBy = element.getAttribute('aria-describedby');
    element.setAttribute(
      'aria-describedby',
      [describedBy, tip.id].filter(Boolean).join(' '),
    );
    position();
  }
  root.addEventListener(
    'pointerover',
    (event) => {
      const element = find(event);
      if (
        tip?.contains(event.target as Node) ||
        (element && element === target)
      )
        clearTimeout(closeTimer);
      if (element && element !== target && event.pointerType !== 'touch')
        show(element);
    },
    options,
  );
  root.addEventListener(
    'pointerout',
    (event) => {
      if (
        event.pointerType !== 'touch' &&
        target &&
        !(
          event.relatedTarget instanceof Node &&
          (target.contains(event.relatedTarget) ||
            tip?.contains(event.relatedTarget))
        )
      ) {
        close();
      }
    },
    options,
  );
  root.addEventListener(
    'focusin',
    (event) => {
      const element = find(event);
      if (element) show(element);
    },
    options,
  );
  root.addEventListener(
    'focusout',
    (event) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        (!tip?.contains(event.relatedTarget) &&
          !target?.contains(event.relatedTarget))
      )
        close();
    },
    options,
  );
  root.addEventListener(
    'pointerdown',
    (event) => {
      const element = find(event);
      if (!element || (element.hasAttribute('data-blindfold-item') || element.hasAttribute('data-bandage-item'))) return;
      event.stopPropagation();
      if (event.pointerType === 'touch') {
        event.preventDefault();
        if (element === target) close();
        else show(element);
      }
    },
    options,
  );
  root.addEventListener(
    'click',
    (event) => {
      const element = find(event);
      if (element && !element.matches('.mode-option[aria-disabled="true"]'))
        event.stopPropagation();
    },
    options,
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!find(event) && !tip?.contains(event.target as Node)) close();
    },
    options,
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    },
    options,
  );
  window.addEventListener('resize', position, { signal: events.signal });
  window.addEventListener('scroll', position, options);
  return {
    close,
    dispose() {
      close();
      events.abort();
    },
  };
}
