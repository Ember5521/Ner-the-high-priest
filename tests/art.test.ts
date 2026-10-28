// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  art,
  artSlot,
  artUrl,
  hydrateArt,
  portraitArt,
  type ArtManifest,
} from '../src/ui/art';
import { existsSync, readFileSync } from 'node:fs';
import cards from '../data/cards/m1.json';
import manifest from '../data/art.json';
import system from '../data/system.json';
import { initialState } from '../src/core/state';
import { endingScreen, titleScreen } from '../src/ui/screens';
import type { Card } from '../src/core/state';
import { documentMarkup } from '../src/ui/document';
import { validateCards } from '../tools/validate-cards';
import { koMessage } from '../src/editor/messages';

let root: HTMLDivElement;
const portraits = art.portraits;
const endings = art.endings;
beforeEach(() => {
  root = document.createElement('div');
  art.portraits = { ...portraits };
  art.endings = { ...endings };
});
afterEach(() => {
  art.portraits = portraits;
  art.endings = endings;
});

describe('art manifest and fallback', () => {
  it('ships existing portrait files and file-backed icons and tools', () => {
    expect(Object.keys(art.icons)).toEqual([
      'sugar',
      'people',
      'faith',
      'erpin',
    ]);
    expect(Object.keys(art.ui)).toEqual([
      'axe',
      'stampApprove',
      'stampReject',
      'stampLeft',
      'stampRight',
      'stampLight',
      'stampMeet',
      'nerIntro',
      'titleErpin',
      'titlePat',
      'titlePlate',
      'speakiCaught',
      'aliceToken',
      'speakiFooled',
      'linuaRewind',
      'stitchScene',
      'erpinSave',
      'erpinSurvived',
      'nerKickout',
      'bullet',
      'scope',
    ]);
    for (const path of [
      ...Object.values(art.portraits)
        .flat()
        .filter((path) => path !== null),
      ...Object.values(art.icons),
      art.ui.axe,
      art.ui.stampApprove,
      art.ui.stampReject,
      art.ui.stampLeft,
      art.ui.stampRight,
      art.ui.stampLight,
      art.ui.stampMeet,
      art.ui.nerIntro,
      art.ui.titleErpin,
      art.ui.titlePat,
      art.ui.titlePlate,
      art.ui.speakiCaught,
      art.ui[system.rewindPrompt.art],
      art.ui.stitchScene,
      art.ui.erpinSave,
      art.ui.erpinSurvived,
      art.ui.nerKickout,
      art.ui.bullet,
      art.boons.rewind,
      art.boons.bullet,
      art.boons.stitch,
      ...Object.values(manifest.music),
    ]) {
      expect(typeof path).toBe('string');
      expect(artUrl(path)).not.toBeNull();
      expect(existsSync(`public/art/${path}`)).toBe(true);
    }
  });

  it('ships title layers at the same canvas size as Ner', () => {
    for (const path of [
      art.ui.nerIntro,
      art.ui.titleErpin,
      art.ui.titlePat,
      art.ui.titlePlate,
    ]) {
      const bytes = readFileSync(`public/art/${path}`);
      const format = bytes.toString('ascii', 12, 16);
      expect(['VP8X', 'VP8L']).toContain(format);
      const dimensions =
        format === 'VP8X'
          ? [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1]
          : [
              1 + bytes.readUInt8(21) + ((bytes.readUInt8(22) & 63) << 8),
              1 +
                (bytes.readUInt8(22) >> 6) +
                (bytes.readUInt8(23) << 2) +
                ((bytes.readUInt8(24) & 15) << 10),
            ];
      expect(dimensions).toEqual([840, 976]);
    }
  });

  it('rejects a rewind prompt art key missing from the ui manifest', () => {
    const path = art.ui[system.rewindPrompt.art];
    delete art.ui[system.rewindPrompt.art];
    try {
      expect(validateCards(cards)).toContain(
        'rewindPrompt.art must reference an existing ui art key',
      );
    } finally {
      art.ui[system.rewindPrompt.art] = path!;
    }
    expect(validateCards(cards)).toEqual([]);
  });

  it('covers every card speaker with a portrait key', () => {
    for (const card of cards as Card[]) {
      for (const speaker of [card.speaker, card.realSpeaker]) {
        if (speaker === undefined) continue;
        const definition =
          system.speakers[speaker as keyof typeof system.speakers];
        expect(definition, `${card.id}: ${speaker}`).toBeDefined();
        const key =
          ('portrait' in definition ? definition.portrait : undefined) ??
          speaker;
        expect(
          Object.hasOwn(art.portraits, key),
          `${card.id}: ${speaker}`,
        ).toBe(true);
      }
    }
  });

  it('selects a stable portrait per seed and can select both images', () => {
    art.portraits.guard = ['portraits/guard_1.webp', 'portraits/guard_2.webp'];
    const first = portraitArt('guard', 'card-a');
    expect(portraitArt('guard', 'card-a')).toBe(first);
    root.innerHTML = first + portraitArt('guard', 'card-b');
    const images = [...root.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    );
    expect(new Set(images)).toEqual(
      new Set([
        artUrl('portraits/guard_1.webp'),
        artUrl('portraits/guard_2.webp'),
      ]),
    );
    expect(
      root.querySelector('[data-art-slot="portraits.guard"]'),
    ).not.toBeNull();
  });

  it('renders empty portrait arrays exactly like null slots', () => {
    art.portraits.guard = null;
    const placeholder = portraitArt('guard', 'card-a');
    art.portraits.guard = [];
    expect(portraitArt('guard', 'card-a')).toBe(placeholder);
    root.innerHTML = portraitArt('guard', 'card-a');
    expect(root.querySelector('svg')).not.toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });

  it.each(['daily', 'speaki'] as const)(
    'uses the speaker group and card ID for %s portraits',
    (kind) => {
      art.portraits.fairy = [
        'portraits/fairy_1.webp',
        'portraits/fairy_2.webp',
      ];
      for (const id of ['card-a', 'card-b']) {
        const card = { ...cards[0], kind, speaker: 'villager', id } as Card;
        expect(documentMarkup(card)).toContain(portraitArt('fairy', card.id));
      }
    },
  );

  it('rejects unknown portrait groups even on unused speakers', () => {
    const errors = validateCards(cards, {
      ...system.speakers,
      unused: { name: 'Unused', portrait: 'unknown-group' },
    });
    const message = 'speaker unused: unknown portrait group';
    expect(errors).toContain(message);
    expect(koMessage(message)).toBe(
      '발신인(unused)의 초상화 그룹을 목록에서 골라 주세요.',
    );
  });

  it('rejects portrait arrays containing non-string entries', () => {
    const message = 'portrait guard: array entries must be strings';
    expect(
      validateCards(cards, system.speakers, {
        ...art.portraits,
        guard: ['a', 2],
      }),
    ).toContain(message);
    expect(koMessage(message)).toBe(
      '초상화(guard)의 이미지 경로는 모두 문자열이어야 합니다.',
    );
    expect(
      validateCards(cards, system.speakers, {
        ...art.portraits,
        guard: ['portraits/guard_1.webp', 'portraits/guard_2.webp'],
      }).filter((error) => error.startsWith('portrait ')),
    ).toEqual([]);
  });

  it('renders null or missing slots as placeholders without an image request', () => {
    root.innerHTML =
      artSlot('portraits', 'missing2', '<svg></svg>') +
      artSlot('portraits', 'missing', '<svg></svg>');
    expect(root.querySelectorAll('svg')).toHaveLength(2);
    expect(root.querySelector('img')).toBeNull();
    expect(() => hydrateArt(root)).not.toThrow();
  });

  it('resolves paths below public/art and the Vite base', () => {
    expect(artUrl('ui/axe.webp')).toBe(
      `${import.meta.env.BASE_URL}art/ui/axe.webp`,
    );
    expect(artUrl('public/art/my icon.svg')).toBe(
      `${import.meta.env.BASE_URL}art/my%20icon.svg`,
    );
    expect(artUrl('art/ner.png')).toBe(
      `${import.meta.env.BASE_URL}art/ner.png`,
    );
  });

  it.each([
    '../refs/image.png',
    '/art/image.png',
    'https://example.com/image.png',
    'art/../refs/x.png',
    'x\\y.png',
    '',
  ])('falls back for paths outside the art directory: %s', (path) => {
    expect(artUrl(path)).toBeNull();
  });

  const withImage = (): HTMLImageElement => {
    const source: ArtManifest = {
      ...art,
      ui: { ...art.ui, axe: 'ui/axe.webp' },
    };
    root.innerHTML = artSlot('ui', 'axe', '<svg></svg>', source);
    const img = root.querySelector('img')!;
    hydrateArt(root);
    return img;
  };

  it('silently restores the placeholder after an image error, including after a successful load', () => {
    const img = withImage();
    img.dispatchEvent(new Event('load'));
    expect(root.querySelector<HTMLElement>('.art-placeholder')!.hidden).toBe(
      true,
    );
    img.dispatchEvent(new Event('error'));
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector<HTMLElement>('.art-placeholder')!.hidden).toBe(
      false,
    );
  });

  it('replaces the placeholder after load', () => {
    const img = withImage();
    expect(img.hidden).toBe(true);
    Object.defineProperties(img, {
      naturalWidth: { value: 512 },
      naturalHeight: { value: 512 },
    });
    img.dispatchEvent(new Event('load'));
    expect(img.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.art-placeholder')!.hidden).toBe(
      true,
    );
  });
});

it('ships an art slot for every ending, empty or backed by a file', () => {
  expect(Object.keys(art.endings).sort()).toEqual(
    [
      ...new Set([
        'true',
        ...Object.keys(system.gameOvers),
        'sleep',
        'purist',
        'reformed',
      ]),
    ].sort(),
  );
  for (const slot of Object.values(art.endings)) {
    if (slot !== null) expect(existsSync(`public/art/${slot}`)).toBe(true);
  }
});

it('validates required ending slots and their values', () => {
  const slots: Record<string, unknown> = { ...art.endings };
  delete slots.true;
  slots.sleep = ['sleep.webp'];
  expect(validateCards(cards, system.speakers, art.portraits, slots)).toEqual([
    'ending true: missing art slot',
    'ending sleep: art must be a string or null',
  ]);
  slots.true = 'endings/true.webp';
  slots.sleep = null;
  expect(validateCards(cards, system.speakers, art.portraits, slots)).toEqual(
    [],
  );
});

it.each(['purist', 'reformed'])(
  'requires the extra ending art slot %s',
  (id) => {
    const slots = { ...art.endings };
    delete slots[id];
    expect(
      validateCards(cards, system.speakers, art.portraits, slots),
    ).toContain(`ending ${id}: missing art slot`);
  },
);

it.each(['true', ...Object.keys(system.gameOvers), 'purist', 'reformed'])(
  'renders art only for populated ending %s and discovered album entries',
  (id) => {
    const state = initialState();
    state.ending = { id };
    const collection = {
      bestYear: { apprentice: 0, priest: 200, bishop: 0 },
      endings: [id],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    };
    art.endings[id] = null;
    root.innerHTML = endingScreen(state, collection) + titleScreen(collection);
    expect(root.querySelector('.ending-art, .album-art')).toBeNull();
    art.endings[id] = 'endings/test.webp';
    root.innerHTML = endingScreen(state, collection) + titleScreen(collection);
    const ending = root.querySelector('.ending-art')!;
    expect(ending.previousElementSibling?.tagName).toBe('H1');
    expect(ending.nextElementSibling?.tagName).toBe('P');
    const images = root.querySelectorAll<HTMLImageElement>(
      `.ending-art img, .album-art img`,
    );
    expect(images).toHaveLength(2);
    hydrateArt(root);
    for (const img of images) {
      expect(img.getAttribute('src')).toBe(artUrl('endings/test.webp'));
      img.dispatchEvent(new Event('load'));
      expect(img.hidden).toBe(false);
    }
    root.innerHTML = titleScreen({ ...collection, endings: [] });
    expect(root.querySelector('.album-art')).toBeNull();
  },
);
