import {
  answerCard,
  BISHOP_ANSWER,
  bishopConfig,
  deckForMode,
} from '../core/bishop';
import system from '../../data/system.json';
import { GAUGE_KEYS } from '../core/config';
import { materializeCard } from '../core/deck';
import { defaultLanguage, type Lang } from '../i18n';
import { initialState, type Card, type State, type Mode } from '../core/state';

const MODE_KEY = 'ner-m1-mode';
export function loadMode(): Mode {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode === 'apprentice' || mode === 'bishop') return mode;
  } catch {
    /* Storage is optional. */
  }
  return 'priest';
}
export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* Play continues without persistence. */
  }
}

export interface Collection {
  bestYear: Record<Mode, number>;
  endings: string[];
  cleared: Record<'apprentice' | 'priest', boolean>;
  bishopUnlocked: boolean;
}
const KEY = 'ner-m1-collection';
export function loadCollection(): Collection {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'bestYear' in value &&
      'endings' in value &&
      Array.isArray(value.endings) &&
      value.endings.every((e) => typeof e === 'string')
    ) {
      const bestYear =
        typeof value.bestYear === 'number'
          ? { apprentice: 0, priest: value.bestYear }
          : value.bestYear;
      if (
        bestYear &&
        typeof bestYear === 'object' &&
        'apprentice' in bestYear &&
        'priest' in bestYear &&
        [bestYear.apprentice, bestYear.priest].every(
          (year) =>
            typeof year === 'number' && Number.isFinite(year) && year >= 0,
        )
      )
        return {
          bestYear: {
            apprentice: bestYear.apprentice as number,
            priest: bestYear.priest as number,
            bishop:
              'bishop' in bestYear &&
              typeof bestYear.bishop === 'number' &&
              Number.isFinite(bestYear.bishop) &&
              bestYear.bishop >= 0
                ? bestYear.bishop
                : 0,
          },
          endings: [...new Set(value.endings)],
          bishopUnlocked:
            'bishopUnlocked' in value && value.bishopUnlocked === true,
          cleared:
            'cleared' in value &&
            value.cleared &&
            typeof value.cleared === 'object'
              ? {
                  apprentice:
                    'apprentice' in value.cleared &&
                    value.cleared.apprentice === true,
                  priest:
                    'priest' in value.cleared && value.cleared.priest === true,
                }
              : { apprentice: false, priest: value.endings.includes('true') },
        };
    }
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
  return emptyCollection();
}
export function saveCollection(value: Collection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Play continues without persistence. */
  }
}

export function emptyCollection(): Collection {
  return {
    bestYear: { apprentice: 0, priest: 0, bishop: 0 },
    endings: [],
    bishopUnlocked: false,
    cleared: { apprentice: false, priest: false },
  };
}

/** Sound effects and music start at 75% until the player changes them. */
export const DEFAULT_VOLUME = 75;
export interface Settings {
  sfx: number;
  lastSfx: number;
  bgm: number;
  lastBgm: number;
  /** The first-visit 'turn the music on?' question has been answered. */
  musicAsked: boolean;
  language: Lang;
  tutorialSeen: boolean;
  stampsSeen: number;
}
let settings: Settings = {
  sfx: DEFAULT_VOLUME,
  lastSfx: DEFAULT_VOLUME,
  bgm: 0,
  lastBgm: DEFAULT_VOLUME,
  musicAsked: false,
  language: defaultLanguage(),
  tutorialSeen: false,
  stampsSeen: 0,
};
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('ner-settings');
    const value = raw ? JSON.parse(raw) : {};
    const volume = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.min(100, v))
        : fallback;
    settings = {
      sfx: volume(
        value.sfx,
        localStorage.getItem('ner-sound') === 'off' ? 0 : DEFAULT_VOLUME,
      ),
      lastSfx: Math.max(1, volume(value.lastSfx, DEFAULT_VOLUME)),
      // music stays muted until the first-visit question is answered
      bgm: value.musicAsked === true ? volume(value.bgm, DEFAULT_VOLUME) : 0,
      lastBgm: Math.max(1, volume(value.lastBgm, DEFAULT_VOLUME)),
      musicAsked: value.musicAsked === true,
      language: ['ko', 'en', 'ja'].includes(value.language)
        ? value.language
        : defaultLanguage(),
      tutorialSeen: value.tutorialSeen === true,
      stampsSeen: stampCount(value.stampsSeen),
    };
  } catch {
    /* Keep session settings when storage is unavailable. */
  }
  return { ...settings };
}
function stampCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(5, Math.floor(value)))
    : 0;
}
export function saveSettings(
  value: Omit<Settings, 'stampsSeen' | 'lastBgm' | 'musicAsked'> & {
    stampsSeen?: number;
    lastBgm?: number;
    musicAsked?: boolean;
  },
): void {
  settings = {
    ...value,
    lastBgm: value.lastBgm ?? settings.lastBgm,
    musicAsked: value.musicAsked ?? settings.musicAsked,
    stampsSeen: stampCount(value.stampsSeen),
  };
  try {
    localStorage.setItem('ner-settings', JSON.stringify(settings));
  } catch {
    /* Settings still apply this session. */
  }
}

const RUN_KEY = 'ner-m1-run';
const RUN_VERSION = 1;
export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* Storage is optional. */
  }
}
export function saveRun(state: State): void {
  try {
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify({ version: RUN_VERSION, state }, (key, value) =>
        key === 'current' && value
            ? { id: value.id }
            : value,
      ),
    );
  } catch {
    /* Play continues without persistence. */
  }
}
export function loadRun(cards: Card[]): State | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const migrate = (s: any) => {
      if (!s || typeof s !== 'object') return;
      if (s.boons?.cloak) {
        if (s.boons.cloak.held > 0) s.boons.scope = (s.boons.scope ?? 0) + 4;
        delete s.boons.cloak;
      }
      if (Array.isArray(s.past)) s.past.forEach(migrate);
    };
    migrate(value.state);
    const ids = new Set(cards.map((card) => card.id));
    const object = (v: unknown): v is Record<string, any> =>
      !!v && typeof v === 'object' && !Array.isArray(v);
    const numbers = (v: unknown) =>
      object(v) &&
      Object.values(v).every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      );
    const strings = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((s) => typeof s === 'string');
    const gauge = (v: unknown) =>
      (GAUGE_KEYS as readonly unknown[]).includes(v);
    const gaugeMap = (v: unknown) =>
      numbers(v) && Object.keys(v as object).every(gauge);
    const validStatuses = (v: unknown) =>
      Array.isArray(v) &&
      v.every(
        (s) =>
          object(s) &&
          typeof s.id === 'string' &&
          Object.hasOwn(system.statuses, s.id) &&
          Number.isInteger(s.left) &&
          s.left > 0 &&
          typeof s.source === 'string' &&
          ['tick', 'delayed'].every(
            (key) => s[key] === undefined || gaugeMap(s[key]),
          ) &&
          (s.scale === undefined ||
            (object(s.scale) &&
              gauge(s.scale.gauge) &&
              [0.5, 1.5].includes(s.scale.factor))) &&
          (s.floor === undefined || (typeof s.floor === 'number' && Number.isFinite(s.floor))) &&
          (s.freeze === undefined || gauge(s.freeze)) &&
          ['axeLock', 'drowseReset'].every(
            (key) => s[key] === undefined || s[key] === true,
          ),
      );
    const validBishop = (b: any): boolean => {
      const blessingIds = bishopConfig.blessings.map((v) => v.id);
      const omenIds = bishopConfig.omens.map((v) => v.id);
      const flowIds = bishopConfig.flows.map((v) => v.id);
      return (
        object(b) &&
        Array.isArray(b.omens) &&
        b.omens.every(
          (o) =>
            object(o) &&
            omenIds.includes(o.id) &&
            (o.empowered === undefined || typeof o.empowered === 'boolean'),
        ) &&
        strings(b.blessings) &&
        b.blessings.every((id) => blessingIds.includes(id) || ((typeof b.embraceUsed === 'boolean' || (['none', 'held', 'used'].includes(b.embrace) && object(b.nextEvent) && ['omen', 'blessing'].includes(b.nextEvent.kind) && Number.isFinite(b.nextEvent.at) && strings(b.omenBag) && b.omenBag.every((id) => omenIds.includes(id)) && new Set(b.omenBag).size === b.omenBag.length && (b.lastOmen === null || omenIds.includes(b.lastOmen)) && typeof b.flowNew === 'boolean')) && id === 'embrace')) &&
        new Set(b.blessings).size === b.blessings.length &&
        (b.flow === null ||
          (object(b.flow) &&
            flowIds.includes(b.flow.id) &&
            Number.isFinite(b.flow.until))) &&
        Number.isFinite(b.nextFlowAt) &&
        (b.lastFlow === null || flowIds.includes(b.lastFlow)) &&
        (typeof b.embraceUsed === 'boolean' || (['none', 'held', 'used'].includes(b.embrace) && object(b.nextEvent) && ['omen', 'blessing'].includes(b.nextEvent.kind) && Number.isFinite(b.nextEvent.at) && strings(b.omenBag) && b.omenBag.every((id) => omenIds.includes(id)) && new Set(b.omenBag).size === b.omenBag.length && (b.lastOmen === null || omenIds.includes(b.lastOmen)) && typeof b.flowNew === 'boolean')) &&
        (b.lastRelicYear === null || Number.isFinite(b.lastRelicYear)) &&
        Number.isInteger(b.pendingAnswers) &&
        b.pendingAnswers >= 0 &&
        (b.answer === null ||
          (strings(b.answer) &&
            b.answer.length >= 1 &&
            b.answer.length <= 2 &&
            b.answer.every(
              (id) => blessingIds.includes(id) && !b.blessings.includes(id),
            ))) &&
        Array.isArray(b.notices) &&
        b.notices.every(
          (n) =>
            object(n) &&
            (n.kind === 'embrace' || n.kind === 'embraceGift' ||
              (n.kind === 'omen'
                ? omenIds.includes(n.id)
                : ['flow', 'flowEnd'].includes(n.kind) &&
                  flowIds.includes(n.id))),
        )
      );
    };
    const valid = (s: any): boolean => {
      if (
        !object(s) ||
        !Object.keys(initialState())
          .filter(
            (key) =>
              key !== 'past' &&
              key !== 'statuses' &&
              key !== 'variantPools' &&
              key !== 'drawn',
          )
          .every((key) => key in s)
      )
        return false;
      return (
        (s.mode !== 'bishop'
          ? s.bishop === undefined
          : validBishop(s.bishop)) &&
        (s.statuses === undefined || validStatuses(s.statuses)) &&
        (s.variantPools === undefined ||
          (numbers(s.variantPools) &&
            Object.entries(s.variantPools).every(
              ([group, pool]) =>
                group.trim().length > 0 &&
                Number.isInteger(pool) &&
                Number(pool) > 0,
            ))) &&
        ['apprentice', 'priest', 'bishop'].includes(s.mode) &&
        ['year', 'bestYear', 'sleep'].every(
          (key) =>
            typeof s[key] === 'number' &&
            Number.isFinite(s[key]) &&
            s[key] >= 0,
        ) &&
        object(s.record) &&
        typeof s.record.helped === 'boolean' &&
        typeof s.record.axed === 'boolean' &&
        numbers(s.gauges) &&
        Object.keys(initialState().gauges).every((key) => key in s.gauges) &&
        [
          'flagYears',
          'npcYears',
          'scheduled',
          'windowYears',
          'relations',
        ].every((key) => numbers(s[key])) &&
        object(s.appearanceYears) &&
        Object.values(s.appearanceYears).every(
          (years) =>
            Array.isArray(years) &&
            years.every((n) => typeof n === 'number' && Number.isFinite(n)),
        ) &&
        strings(s.flags) &&
        strings(s.seen) &&
        strings(s.recent) &&
        (s.drawn === undefined || strings(s.drawn)) &&
        [
          ...s.seen,
          ...s.recent,
          ...Object.keys(s.scheduled),
          ...Object.keys(s.windowYears),
          ...Object.keys(s.appearanceYears),
        ].every((id) => ids.has(id)) &&
        (s.current === null ||
          (object(s.current) &&
            (ids.has(s.current.id) ||
              (s.mode === 'bishop' &&
                s.current.id === BISHOP_ANSWER &&
                s.bishop?.answer?.length)))) &&
        (s.blindfold === undefined ||
          (gauge(s.blindfold) && s.boons?.blindfold > 0)) &&
        (s.rewindYear === undefined ||
          (Number.isFinite(s.rewindYear) && s.rewindYear >= 0)) &&
        (s.poolCards === undefined || strings(s.poolCards)) &&
        (s.elfCards === undefined || strings(s.elfCards)) &&
        (s.immediate === undefined || typeof s.immediate === 'string') &&
        (s.currentImmediate === undefined || typeof s.currentImmediate === 'boolean') &&
        (s.boss === undefined ||
          (s.mode !== 'bishop' &&
            s.year === 200 &&
            object(s.boss) &&
            Number.isInteger(s.boss.done) &&
            s.boss.done >= 0 &&
            s.boss.done <= 10 &&
            strings(s.boss.drawn) &&
            (s.boss.kickoutUsed === undefined || typeof s.boss.kickoutUsed === 'boolean'))) &&
        object(s.boons) &&
        Object.entries(s.boons).every(([key, v]) =>
          key === 'hyean' || key === 'intuition'
            ? object(v) && typeof v.left === 'number' && Number.isFinite(v.left)
            : key === 'bandage' || key === 'scope'
                ? Number.isInteger(v) && Number(v) >= 0
                : key === 'bullet' || key === 'blindfold'
                  ? typeof v === 'number' && Number.isFinite(v)
                  : ['rewind', 'alice', 'stitch', 'understudy'].includes(key) &&
                    v === true,
        ) &&
        object(s.drowse) &&
        [0, 1, 2].includes(s.drowse.stack) &&
        typeof s.drowse.left === 'number' &&
        Number.isFinite(s.drowse.left) &&
        (s.ending === null ||
          (object(s.ending) && typeof s.ending.id === 'string')) &&
        (s.scene === null || typeof s.scene === 'string') &&
        typeof s.erpinSaved === 'boolean' &&
        typeof s.stitched === 'boolean'
      );
    };
    // Retired cards and statuses must not invalidate an otherwise healthy save.
    if (object(value?.state)) {
      for (const s of [
        value.state,
        ...(Array.isArray(value.state.past) ? value.state.past : []),
      ]) {
        if (!object(s)) continue;
        delete s.loan;
        delete s.refundable;
        if (object(s.boons) && 'refund' in s.boons) {
          s.boons.bandage = (s.boons.bandage ?? 0) + s.boons.refund;
          delete s.boons.refund;
        }
        for (const key of ['seen', 'recent', 'drawn'])
          if (strings(s[key]))
            s[key] = s[key].filter((id: string) => ids.has(id));
        for (const key of ['scheduled', 'windowYears', 'appearanceYears'])
          if (object(s[key]))
            s[key] = Object.fromEntries(
              Object.entries(s[key]).filter(([id]) => ids.has(id)),
            );
        if (Array.isArray(s.statuses))
          s.statuses = s.statuses.filter(
            (status: any) =>
              object(status) && Object.hasOwn(system.statuses, status.id),
          );
        if (
          object(s.current) &&
          !ids.has(s.current.id) &&
          s.current.id !== BISHOP_ANSWER
        )
          s.current = null;
        if (s.boons?.rewind && s.rewindYear === undefined)
          s.rewindYear = s.past?.[0]?.year ?? s.year;
      }
    }
    if (
      value?.version === RUN_VERSION &&
      valid(value.state) &&
      Array.isArray(value.state.past) &&
      value.state.past.every(valid)
    ) {
      const decks = new Map<Mode, Card[]>();
      // Use current card data after an update, including cards restored by rewind.
      for (const s of [value.state, ...value.state.past]) {
        s.drawn = (s.drawn ?? []).filter((id: string) => ids.has(id));
        if (s.bishop && typeof s.bishop.embraceUsed === 'boolean') {
          const b = s.bishop;
          b.embrace = b.embraceUsed ? 'used' : b.blessings.includes('embrace') ? 'held' : 'none';
          b.blessings = b.blessings.filter((id: string) => id !== 'embrace');
          b.omens = b.omens.map((o: { id: string }) => ({ id: o.id }));
          const at = (Math.floor(s.year / 25) + 1) * 25;
          b.nextEvent = { kind: at % 50 === 0 ? 'blessing' : 'omen', at };
          b.omenBag = bishopConfig.omens.map((o) => o.id);
          b.lastOmen = b.omens.at(-1)?.id ?? null;
          b.flowNew = false;
          b.notices = b.notices.filter((n: { kind: string }) => n.kind !== 'flow' && n.kind !== 'flowEnd');
          delete b.embraceUsed;
        }
        s.statuses ??= [];
        s.variantPools ??= {};
        if (!decks.has(s.mode)) decks.set(s.mode, deckForMode(cards, s.mode));
        const deck = decks.get(s.mode)!;
        // JSON encodes the initial -Infinity relic sentinel as null.
        if (s.bishop && s.bishop.lastRelicYear === null)
          s.bishop.lastRelicYear = -Infinity;
        if (
          s.current &&
          s.current.id !== BISHOP_ANSWER &&
          !deck.some((c) => c.id === s.current.id)
        )
          s.current = null;
        if (s.current)
          s.current =
            s.current.id === BISHOP_ANSWER
              ? answerCard(s.bishop.answer)
              : materializeCard(
                  deck.find((card) => card.id === s.current.id)!,
                  deck,
                );
      }
      return value.state as State;
    }
  } catch {
    /* Corrupt or unavailable storage must not prevent play. */
  }
  clearRun();
  return null;
}
