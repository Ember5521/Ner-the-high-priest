import { afterEach, expect, it, vi } from 'vitest';
import {
  loadCollection,
  saveCollection,
  loadSettings,
  saveSettings,
} from '../src/save/storage';
afterEach(() => vi.unstubAllGlobals());
it('validates settings and keeps session preferences when storage is blocked', () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      key === 'ner-settings'
        ? '{"sfx":-10,"bgm":500,"lastSfx":0,"language":"en","musicAsked":true}'
        : null,
  });
  expect(loadSettings()).toMatchObject({
    sfx: 0,
    bgm: 100,
    lastSfx: 1,
    language: 'en',
  });
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  });
  const settings = {
    sfx: 35,
    lastSfx: 35,
    bgm: 20,
    lastBgm: 20,
    musicAsked: true,
    language: 'ko' as const,
    tutorialSeen: true,
    stampsSeen: 0,
  };
  expect(() => saveSettings(settings)).not.toThrow();
  expect(loadSettings()).toEqual(settings);
});
it('round trips both mode records and the shared ending album', () => {
  let saved: string | null = null;
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  });
  const collection = {
    bestYear: { apprentice: 63, priest: 142, bishop: 0 },
    endings: ['sleep', 'faith_low'],
    bishopUnlocked: true,
    cleared: { apprentice: false, priest: false },
  };
  saveCollection(collection);
  expect(loadCollection()).toEqual(collection);
});

it.each([
  'null',
  '{',
  '{}',
  '{"bestYear":null,"endings":[]}',
  '{"bestYear":{"apprentice":-1,"priest":20},"endings":[]}',
  '{"bestYear":{"apprentice":10,"priest":"20"},"endings":[]}',
  '{"bestYear":{"priest":20},"endings":[]}',
  '{"bestYear":1e999,"endings":[]}',
  '{"bestYear":{"apprentice":10,"priest":1e999},"endings":[]}',
  '{"bestYear":{"apprentice":10,"priest":20},"endings":[1]}',
])('safely rejects invalid collection %s', (saved) => {
  vi.stubGlobal('localStorage', { getItem: () => saved });
  expect(loadCollection()).toEqual({
    bestYear: { apprentice: 0, priest: 0, bishop: 0 },
    endings: [],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  });
});

it('continues when storage throws', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  });
  expect(loadCollection()).toEqual({
    bestYear: { apprentice: 0, priest: 0, bishop: 0 },
    endings: [],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  });
  expect(() =>
    saveCollection({
      bestYear: { apprentice: 0, priest: 10, bishop: 0 },
      endings: ['sleep'],
      bishopUnlocked: false,
      cleared: { apprentice: false, priest: false },
    }),
  ).not.toThrow();
});
it('loads and validates collection without storing a run', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: () => '{"bestYear":20,"endings":["sleep","sleep"]}',
    setItem,
  });
  expect(loadCollection()).toEqual({
    bestYear: { apprentice: 0, priest: 20, bishop: 0 },
    endings: ['sleep'],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  });
  saveCollection(loadCollection());
  expect(JSON.parse(setItem.mock.calls[0]![1] as string)).toEqual({
    bestYear: { apprentice: 0, priest: 20, bishop: 0 },
    endings: ['sleep'],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  });
  vi.stubGlobal('localStorage', {
    getItem: () => '{"bestYear":-1,"endings":[]}',
  });
  expect(loadCollection().bestYear).toEqual({
    apprentice: 0,
    priest: 0,
    bishop: 0,
  });
});

it('starts sound effects at 75% and music muted until the player is asked', () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  expect(loadSettings()).toMatchObject({ sfx: 75, lastSfx: 75, bgm: 0, lastBgm: 75, musicAsked: false });
  // an old save with a music level but no answer yet still starts muted
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'ner-settings' ? JSON.stringify({ bgm: 60 }) : null),
  });
  expect(loadSettings()).toMatchObject({ bgm: 0, musicAsked: false });
});

it.each([
  [undefined, 0],
  [-2, 0],
  [8, 5],
  [3.8, 3],
  ['4', 0],
  [null, 0],
])('migrates and clamps stampsSeen %s', (value, expected) => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      key === 'ner-settings' ? JSON.stringify({ stampsSeen: value }) : null,
    setItem: vi.fn(),
  });
  expect(loadSettings().stampsSeen).toBe(expected);
  saveSettings({ ...loadSettings(), stampsSeen: 9 });
  expect(localStorage.setItem).toHaveBeenCalledWith(
    'ner-settings',
    expect.stringContaining('"stampsSeen":5'),
  );
});

it.each([undefined, false, 'true', 1, null, true])(
  'migrates and validates bishopUnlocked %s',
  (bishopUnlocked) => {
    const saved = {
      bestYear: { apprentice: 10, priest: 20 },
      endings: ['sleep'],
      bishopUnlocked,
    };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved) });
    expect(loadCollection().bishopUnlocked).toBe(bishopUnlocked === true);
    expect(loadCollection().bestYear.priest).toBe(20);
    expect(loadCollection().endings).toEqual(['sleep']);
  },
);
