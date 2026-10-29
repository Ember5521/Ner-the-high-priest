import { createBishop, bishopStartFlags, type BishopState } from './bishop';
import { GAUGE_KEYS, REWIND_YEARS } from './config';
import type system from '../../data/system.json';
export type Gauge = (typeof GAUGE_KEYS)[number];
export type Mode = 'apprentice' | 'priest' | 'bishop';
export type RNG = () => number;
export type Choice = 'reject' | 'approve';
export type Action = Choice | 'axe' | 'bullet' | 'alice';
export interface Status {
  id: string;
  turns: number;
  floor?: number;
  tick?: Partial<Record<Gauge, number>>;
  delayed?: Partial<Record<Gauge, number>>;
  scale?: { gauge: Gauge; factor: 0.5 | 1.5 };
  freeze?: Gauge;
  axeLock?: true;
  drowseReset?: true;
}
export interface ActiveStatus extends Omit<Status, 'turns'> {
  left: number;
  source: string;
}
export interface Result {
  status?: Status;
  label: string;
  effects: Partial<Record<Gauge, number>>;
  grant?: {
    boon:
      | 'hyean'
      | 'intuition'
      | 'rewind'
      | 'alice'
      | 'bullet'
      | 'stitch'
      | 'blindfold'
      | 'scope'
      | 'understudy'
      | 'bandage';
    uses?: number;
  };
  adjust?: number;
  mend?: {
    mode: 'worst' | 'center' | 'all';
    count?: number;
    amount?: number;
    exclude?: Gauge[];
  };
  witchPress?: { amount: number; floor: number };
  witchDrift?: { perDoc: number; turns: number };
  drowse?: 1 | 2 | 3;
  schedule?: { card: string; years: number };
  setFlags?: string[];
  relations?: Record<string, number>;
}
export interface Card {
  modes?: Mode[];
  blessings?: string[];
  id: string;
  kind: 'story' | 'fixed' | 'daily' | 'special' | 'speaki';
  look?: 'special' | 'quest' | 'hard';
  pool?: { group: string; member: string };
  boss?: 'cleanup' | 'unrest';
  bossPhase?: 'early' | 'late';
  bossAfter?: number;
  bossAt?: number;
  safe?: true;
  status?: Omit<Status, 'turns'>;
  stamps?: 'direction' | 'light' | 'meet';
  mimic?: string;
  speaker: string;
  realSpeaker?: string;
  faction: string;
  title: string;
  text: string;
  years: number;
  axe: boolean | 'free' | 'bullet';
  tier?: 1 | 2 | 3;
  repeatable?: boolean;
  period?: number;
  npc?: string;
  variant?: { group: string; pool: number };
  trigger?:
    | {
        from?: never;
        to?: never;
        year: number;
        after?: never;
        years?: never;
        scheduled?: never;
        onCondition?: never;
        order: number;
      }
    | {
        year?: never;
        from?: never;
        to?: never;
        after: string;
        years: number;
        scheduled?: never;
        onCondition?: never;
        order: number;
      }
    | {
        from?: never;
        to?: never;
        scheduled: true;
        year?: never;
        after?: never;
        years?: never;
        onCondition?: never;
        order: number;
      }
    | {
        from: number;
        to: number;
        year?: never;
        after?: never;
        years?: never;
        scheduled?: never;
        onCondition?: never;
        order: number;
      }
    | {
        onCondition: true;
        order: number;
        year?: never;
        from?: never;
        to?: never;
        after?: never;
        years?: never;
        scheduled?: never;
      };
  weight?: number;
  conditions?: {
    flagsAll?: string[];
    flagsNone?: string[];
    boonsNone?: string[];
    minYear?: number;
    maxYear?: number;
    gauges?: Partial<Record<Gauge, { min?: number; max?: number }>>;
  };
  reject: Result;
  approve: Result;
  axeResult?: { setFlags?: string[]; scene?: string };
  missed?: { scene: keyof typeof system.scenes };
}
export type Document = Card;
export interface Ending {
  id: string;
  cause?: string;
}
export type Snapshot = Omit<State, 'past'>;
export interface State {
  bishop?: BishopState;
  boss?: { done: number; drawn: string[]; kickoutUsed?: boolean };
  poolCards?: string[];
  elfCards?: string[];
  blindfold?: Gauge;
  rewindYear?: number;
  immediate?: string;
  currentImmediate?: boolean;
  statuses: ActiveStatus[];
  mode: Mode;
  record: { helped: boolean; axed: boolean };
  past: Snapshot[];
  gauges: Record<Gauge, number>;
  year: number;
  flags: string[];
  flagYears: Record<string, number>;
  npcYears: Record<string, number>;
  appearanceYears: Record<string, number[]>;
  scheduled: Record<string, number>;
  windowYears: Record<string, number>;
  variantPools: Record<string, number>;
  boons: {
    hyean?: { left: number };
    intuition?: { left: number };
    rewind?: true;
    alice?: true;
    bullet?: number;
    stitch?: true;
    blindfold?: number;
    bandage?: number;
    scope?: number;
    understudy?: true;
  };
  bestYear: number;
  relations: Record<string, number>;
  seen: string[];
  recent: string[];
  drawn: string[];
  drowse: { stack: 0 | 1 | 2; left: number };
  scoped?: true;
  current: Document | null;
  sleep: number;
  erpinSaved: boolean;
  stitched: boolean;
  ending: Ending | null;
  scene: string | null;
  asleepPending?: boolean;
}
export function initialState(
  mode: Mode = 'priest',
  rng: RNG = Math.random,
): State {
  return {
    ...(mode === 'bishop' ? { bishop: createBishop(rng) } : {}),
    statuses: [],
    mode,
    record: { helped: false, axed: false },
    past: [],
    gauges: { sugar: 50, people: 50, faith: 50, erpin: 50 },
    year: 0,
    flags: mode === 'bishop' ? [...bishopStartFlags] : [],
    flagYears: {},
    npcYears: {},
    appearanceYears: {},
    scheduled: {},
    windowYears: {},
    variantPools: {},
    boons: {},
    bestYear: 0,
    relations: {},
    seen: [],
    recent: [],
    drawn: [],
    drowse: { stack: 0, left: 0 },
    current: null,
    sleep: 0,
    erpinSaved: false,
    stitched: false,
    ending: null,
    scene: null,
  };
}
// Keep the five-year window and its nearest earlier anchor.
export function recordSnapshot(state: State): State {
  if (!state.boons.rewind) return { ...state, past: [] };
  if (!state.current || state.ending) return state;
  const { past = [], ...snapshot } = state;
  const cutoff = state.year - REWIND_YEARS;
  const history = [
    ...past,
    structuredClone({
      ...snapshot,
      scene: null,
      asleepPending: false,
      stitched: false,
    }),
  ];
  const anchor = history.filter((entry) => entry.year <= cutoff).at(-1);
  return {
    ...state,
    past: state.boss
      ? history.filter(
          (entry) => entry.boss && entry.boss.done >= state.boss!.done - 3,
        )
      : history.filter((entry) => entry.year > cutoff || entry === anchor),
  };
}
export function boundary(gauges: State['gauges']): string | undefined {
  for (const key of GAUGE_KEYS) {
    if (gauges[key] <= 0) return `${key}_low`;
    if (gauges[key] >= 100) return `${key}_high`;
  }
  return undefined;
}

export type ExtraEnding = 'purist' | 'reformed';
export function earnedExtraEndings(state: State): ExtraEnding[] {
  if (state.mode === 'bishop' || state.ending?.id !== 'true') return [];
  return [
    ...(!state.record.helped ? ['purist' as const] : []),
    ...(!state.record.axed ? ['reformed' as const] : []),
  ];
}
