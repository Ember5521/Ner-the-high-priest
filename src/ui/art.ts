import manifest from '../../data/art.json';
import type { Gauge } from '../core/state';

type SlotGroup = 'portraits' | 'icons' | 'ui' | 'boons' | 'endings';
export type UiArt =
  | 'aliceToken'
  | 'axe'
  | 'bullet'
  | 'scope'
  | 'stampApprove'
  | 'stampReject'
  | 'stampLeft'
  | 'stampRight'
  | 'stampLight'
  | 'stampMeet'
  | 'nerIntro'
  | 'linuaRewind'
  | 'speakiCaught'
  | 'speakiFooled';
export type ArtManifest = Record<
  Exclude<SlotGroup, 'portraits'>,
  Record<string, string | null>
> & { portraits: Record<string, string | string[] | null> };
export const art: ArtManifest = manifest;

export const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export function artUrl(path: string | null | undefined): string | null {
  if (!path || /[\\:#?]/.test(path) || path.startsWith('/')) return null;
  const relative = path.replace(/^(?:public\/)?art\//, '');
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return `${import.meta.env.BASE_URL}art/${parts.map(encodeURIComponent).join('/')}`;
}

export function artSlot(
  group: SlotGroup,
  key: string,
  placeholder: string,
  source: ArtManifest = art,
  seed = '',
): string {
  const slot = source[group]?.[key];
  let hash = 2166136261;
  if (Array.isArray(slot))
    for (let i = 0; i < seed.length; i++)
      hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0;
  const url = artUrl(Array.isArray(slot) ? slot[hash % slot.length] : slot);
  return `
    <span class="art-slot" data-art-slot="${group}.${escape(key)}">
      <span class="art-placeholder">${placeholder}</span>
      ${url ? `<img data-art-image src="${escape(url)}" alt="" draggable="false" decoding="async" hidden />` : ''}
    </span>`;
}

export function hydrateArt(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLImageElement>('img[data-art-image]')
    .forEach((img) => {
      const placeholder = img.previousElementSibling as HTMLElement;
      const loaded = () => {
        placeholder.hidden = true;
        img.hidden = false;
      };
      const failed = () => {
        placeholder.hidden = false;
        img.remove();
      };
      img.addEventListener('load', loaded, { once: true });
      img.addEventListener('error', failed, { once: true });
      if (img.complete) {
        if (img.naturalWidth > 0) loaded();
        else failed();
      }
    });
}

// Line-only stand-in until the character art arrives.
export function portraitArt(key: string, seed = ''): string {
  const svg = `
    <svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="50" cy="40" r="17"/>
      <path d="M20 90q2-26 30-26t30 26"/>
    </svg>`;
  return artSlot('portraits', key, svg, art, seed);
}

const fallbackIcon = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="currentColor"/></svg>`;

export function iconArt(key: Gauge): string {
  return artSlot('icons', key, fallbackIcon);
}

export function uiArt(key: UiArt): string {
  return artSlot('ui', key, fallbackIcon);
}

// Plain URL for images that are created on the fly (stamp imprints).
export function uiUrl(key: UiArt): string | null {
  return artUrl(art.ui[key]);
}
