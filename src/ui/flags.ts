import type { Lang } from '../i18n';

// Small flat flags for the language picker, drawn inline because Windows renders flag
// emoji as two letters.
// Taegukgi on the standard 72×48 construction: taegeuk diameter half the flag height,
// its axis on the diagonal (red above, blue below), each trigram as wide as the radius and
// half a radius away. Geon ☰ top left, gon ☷ bottom right, gam ☵ top right, ri ☲ bottom left.
// The breaks in the bars are drawn a little wider than standard so they read at icon size,
// and the taegeuk is one clipped group so no red seam shows along the circle's edge.
const bars =
  '<path stroke="#000" stroke-width="2" d="M-6-25H6M-6-22H6M-6-19H6M-6 19H6M-6 22H6M-6 25H6"/>';
const kr = `<svg viewBox="-36 -24 72 48" aria-hidden="true"><rect x="-36" y="-24" width="72" height="48" fill="#fff"/><g transform="rotate(-56.3099325)">${bars}<path stroke="#fff" stroke-width="1.6" d="M0 17v10"/><clipPath id="kr-taegeuk"><circle r="12"/></clipPath><g clip-path="url(#kr-taegeuk)"><rect x="-13" y="-13" width="26" height="26" fill="#cd2e3a"/><path fill="#0047a0" d="M0-12A6 6 0 0 0 0 0A6 6 0 0 1 0 12V14H-14V-14H0Z"/></g></g><g transform="rotate(-123.6900675)">${bars}<path stroke="#fff" stroke-width="1.6" d="M0-23.5v3M0 17v3.5M0 23.5v3"/></g></svg>`;

const us = `<svg viewBox="0 0 36 24" aria-hidden="true"><rect width="36" height="24" fill="#fff"/>${Array.from(
  { length: 7 },
  (_, i) =>
    `<rect y="${(i * 2 * 24) / 13}" width="36" height="${24 / 13}" fill="#b22234"/>`,
).join(
  '',
)}<rect width="15.5" height="${(7 * 24) / 13}" fill="#3c3b6e"/><g fill="#fff">${Array.from(
  { length: 20 },
  (_, i) =>
    `<circle cx="${1.7 + (i % 5) * 3}" cy="${1.6 + Math.floor(i / 5) * 3}" r="0.55"/>`,
).join('')}</g></svg>`;

const ja = `<svg viewBox="0 0 36 24" aria-hidden="true"><rect width="36" height="24" fill="#fff"/><circle cx="18" cy="12" r="7.2" fill="#bc002d"/></svg>`;

export const FLAGS: Record<Lang, string> = { ko: kr, en: us, ja };
