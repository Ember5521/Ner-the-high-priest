import config from '../../data/bishop.json';
import { system } from '../i18n';
import type { Card, Gauge, Mode, RNG, State } from './state';

export { config as bishopConfig };
export const bishopStartFlags = config.startFlags;
export type BishopNotice =
  { kind: 'omen'; id: string } | { kind: 'embraceGift' | 'embrace' };
export interface BishopState {
  omens: { id: string }[];
  blessings: string[];
  flow: { id: string; until: number } | null;
  nextFlowAt: number;
  lastFlow: string | null;
  nextEvent: { kind: 'omen' | 'blessing'; at: number };
  omenBag: string[];
  lastOmen: string | null;
  embrace: 'none' | 'held' | 'used';
  flowNew: boolean;
  lastRelicYear: number;
  notices: BishopNotice[];
  pendingAnswers: number;
  answer: string[] | null;
}
interface Modifier {
  gain?: Partial<Record<Gauge, number>>;
  loss?: Partial<Record<Gauge, number>>;
  speakers?: Partial<Record<string, number>>;
  tiers?: Partial<Record<1 | 2 | 3, number>>;
  speakiChance?: number;
}
const gap = (rng: RNG) =>
  config.flowGap.min +
  Math.floor(rng() * (config.flowGap.max - config.flowGap.min + 1));
const eventGap = (rng: RNG) => config.events.gap.min + Math.floor(rng() * (config.events.gap.max - config.events.gap.min + 1));
const pick = <T>(values: T[], rng: RNG): T =>
  values[Math.floor(rng() * values.length)]!;
export function createBishop(rng: RNG): BishopState {
  return {
    omens: [],
    blessings: [],
    flow: null,
    nextFlowAt: gap(rng),
    lastFlow: null,
    nextEvent: { kind: 'omen', at: eventGap(rng) },
    omenBag: config.omens.map((o) => o.id),
    lastOmen: null,
    embrace: 'none',
    flowNew: false,
    lastRelicYear: -Infinity,
    notices: [],
    pendingAnswers: 0,
    answer: null,
  };
}
export function bishopDeck(cards: Card[]): Card[] {
  return cards
    .filter(
      (c) =>
        !c.boss &&
        c.bossAfter === undefined &&
        ![
          'fixed_xion_request',
          'special_renewa_curtain',
          'fixed_renewa_theater',
          'fixed_chloe_tailor',
          'quest_goldie_storage',
        ].includes(c.id) &&
        (!c.modes || c.modes.includes('bishop')) &&
        c.kind !== 'story' &&
        (c.kind !== 'fixed' ||
          c.pool ||
          bishopRecurring(c) ||
          config.crisis.cards.includes(c.id) ||
          config.relics.cards.includes(c.id) ||
          c.trigger?.scheduled ||
          c.trigger?.onCondition) &&
        (c.kind !== 'daily' ||
          (c.conditions?.minYear ?? 0) < config.excludeDailyFromYear),
    )
    .map((source) => {
      const c = structuredClone(source);
      if (bishopRecurring(c)) {
        c.kind = 'special';
        c.repeatable = true;
        c.period = 60;
        delete c.trigger;
        delete c.pool;
        delete c.variant;
      }
      if (c.conditions) {
        delete c.conditions.minYear;
        delete c.conditions.maxYear;
      }
      if (c.kind === 'daily') delete c.variant;
      if (
        config.crisis.cards.includes(c.id) ||
        config.relics.cards.includes(c.id)
      ) {
        const crisis = config.crisis.cards.includes(c.id);
        c.kind = 'special';
        delete c.trigger;
        delete c.variant;
        c.weight = crisis ? config.crisis.weight : config.relics.weight;
        c.repeatable = crisis;
        if (crisis) {
          c.period = config.crisis.periodYears;
          c.axe = 'bullet';
        } else delete c.period;
      }
      return c;
    });
}
export function deckForMode(cards: Card[], mode: Mode): Card[] {
  return mode === 'bishop'
    ? bishopDeck(cards)
    : cards.filter((c) => !c.modes || c.modes.includes(mode));
}
type Curve = { steps: number[][] };
export function bishopCurve(year: number, curve: Curve): number {
  return curve.steps.reduce((value, [at, next]) => year >= at! ? next! : value, curve.steps[0]![1]!);
}
export const bishopEra = (year: number): number => bishopCurve(year, config.scale);
export function activeModifiers(state: State): Modifier[] {
  if (!state.bishop) return [];
  const b = state.bishop;
  return [
    ...b.omens.map((omen) => {
      const entry: Modifier = config.omens.find((o) => o.id === omen.id)!;
      if (b.embrace !== 'used') return entry;
      const factor = config.embrace.omenAfter;
      return Object.fromEntries(
        Object.entries(entry)
          .filter(([key]) => key !== 'id')
          .map(([key, values]) => [
            key,
            typeof values === 'number'
              ? factor
              : Object.fromEntries(Object.keys(values).map((g) => [g, factor])),
          ]),
      );
    }),
    ...config.blessings.filter((entry) => b.blessings.includes(entry.id)),
    ...config.flows.filter((entry) => entry.id === b.flow?.id),
  ];
}
export function bishopWeight(
  state: State,
  kind: 'speakers' | 'tiers' | 'speakiChance',
  id = '',
): number {
  return activeModifiers(state).reduce(
    (value, modifier) =>
      value *
      (kind === 'speakiChance'
        ? (modifier.speakiChance ?? 1)
        : ((modifier[kind] as Record<string, number> | undefined)?.[id] ?? 1)),
    1,
  );
}
export function bishopEffectMultiplier(
  state: State,
  gauge: Gauge,
  positive: boolean,
): number {
  const side = positive ? 'gain' : 'loss';
  const product = activeModifiers(state).reduce(
    (value, m) => value * (m[side]?.[gauge] ?? 1),
    1,
  );
  // The reign-long baseline sits outside the cap so blessings on top of it
  // still count; softer candy losses keep sugar from being the usual way a reign ends.
  const base: Modifier = config.base;
  return (
    Math.max(
      config.modifierCap.min,
      Math.min(config.modifierCap.max, product),
    ) * (base[side]?.[gauge] ?? 1)
  );
}
export function bishopEligible(card: Card, state: State): boolean {
  if (!state.bishop) return true;
  if (card.period === 60) {
    const ids = card.id.startsWith('special_sist_deal')
      ? ['special_sist_deal', 'special_sist_deal_late']
      : [card.id];
    if (
      ids.some(
        (id) =>
          state.year - (state.appearanceYears[id]?.at(-1) ?? -Infinity) < 60,
      )
    )
      return false;
  }
  if (
    config.crisis.cards.includes(card.id) &&
    !Object.values(state.gauges).every(
      (value) =>
        value >= config.crisis.safe && value <= 100 - config.crisis.safe,
    )
  )
    return false;
  return (
    !config.relics.cards.includes(card.id) ||
    state.year - state.bishop.lastRelicYear >= config.relics.gapYears
  );
}
export function advanceBishop(
  state: State,
  previousYear: number,
  rng: RNG,
): State {
  if (!state.bishop) return state;
  const b = structuredClone(state.bishop);
  const boons = { ...state.boons };
  for (
    let segment = Math.floor(previousYear / config.segmentYears) + 1;
    segment <= Math.floor(state.year / config.segmentYears);
    segment++
  ) {
    if (b.blessings.includes('careful'))
      boons.hyean = {
        left:
          (boons.hyean?.left ?? 0) +
          config.blessings.find((v) => v.id === 'careful')!.hyeanPerSegment!,
      };
  }
  while (state.year >= b.nextEvent.at) {
    const { kind, at } = b.nextEvent;
    if (kind === 'omen') {
      if (!b.omenBag.length) b.omenBag = config.omens.map((o) => o.id);
      const choices = b.omenBag.length === config.omens.length && b.lastOmen ? b.omenBag.filter((id) => id !== b.lastOmen) : b.omenBag;
      const id = pick(choices, rng);
      b.omenBag.splice(b.omenBag.indexOf(id), 1);
      b.omens.push({ id });
      b.notices.push({ kind: 'omen', id });
      b.lastOmen = id;
    } else if (b.blessings.length < config.blessings.length) b.pendingAnswers++;
    let nextAt = at + eventGap(rng);
    if (b.embrace === 'none' && Math.abs(nextAt - config.embrace.year) <= config.embrace.clear)
      nextAt = config.embrace.year + config.embrace.clear + 1;
    b.nextEvent = { kind: kind === 'omen' ? 'blessing' : 'omen', at: nextAt };
  }
  if (b.embrace === 'none' && state.year >= config.embrace.year) {
    b.embrace = 'held';
    b.notices.push({ kind: 'embraceGift' });
  }
  b.flowNew = false;
  if (b.flow && state.year >= b.flow.until) {
    b.flow = null;
    b.nextFlowAt = state.year + gap(rng);
  }
  if (!b.flow && state.year >= b.nextFlowAt) {
    const flow = pick(
      config.flows.filter((f) => f.id !== b.lastFlow),
      rng,
    );
    b.flow = { id: flow.id, until: state.year + flow.years };
    b.lastFlow = flow.id;
    b.flowNew = true;
  }
  return { ...state, bishop: b, boons };
}
export const BISHOP_ANSWER = 'bishop_answer';
export function answerCard(ids: string[]): Card {
  const copy = system.bishop.blessings as Record<
    string,
    { name: string; desc: string }
  >;
  return {
    id: BISHOP_ANSWER,
    kind: 'special',
    speaker: 'worldtree',
    faction: 'fairy',
    title: system.bishop.answer.title,
    text: system.bishop.answer.text,
    years: 0,
    axe: false,
    stamps: 'direction',
    blessings: ids,
    reject: { label: copy[ids[0]!]!.name, effects: {} },
    approve: { label: copy[ids[1] ?? ids[0]!]!.name, effects: {} },
  };
}
export function nextAnswer(state: State, rng: RNG): State | null {
  if (!state.bishop?.pendingAnswers) return null;
  const available = config.blessings
    .filter((b) => !state.bishop!.blessings.includes(b.id))
    .map((b) => b.id);
  if (!available.length) return null;
  const first = pick(available, rng);
  const rest = available.filter((id) => id !== first);
  const ids = rest.length ? [first, pick(rest, rng)] : [first];
  return {
    ...state,
    bishop: { ...state.bishop, answer: ids },
    current: answerCard(ids),
  };
}
export function embraceSave(state: State): State {
  const b = state.bishop;
  const cause = state.ending?.cause ?? state.ending?.id;
  if (
    !b ||
    b.embrace !== 'held' ||
    !cause ||
    !/_(low|high)$/.test(cause)
  )
    return state;
  const gauge = cause.replace(/_(low|high)$/, '') as Gauge;
  const save = config.embrace.save;
  return {
    ...state,
    gauges: {
      ...state.gauges,
      [gauge]: cause.endsWith('_low') ? save : 100 - save,
    },
    ending: null,
    bishop: {
      ...b,
      embrace: 'used',
      notices: [...b.notices, { kind: 'embrace' }],
    },
  };
}

function bishopRecurring(card: Card): boolean {
  return (
    !!card.pool ||
    [
      'special_sist_deal',
      'special_sist_deal_late',
      'special_fricle_pikora',
    ].includes(card.id)
  );
}

export function bishopTotals(state: State): Record<Gauge, { gain: number; loss: number }> {
  const gauges: Gauge[] = ['sugar', 'faith', 'people', 'erpin'];
  return Object.fromEntries(gauges.map((gauge) => {
    const status = state.statuses.reduce((v, s) => v * (s.scale?.gauge === gauge ? s.scale.factor : 1), 1);
    const side = (side: 'gain' | 'loss') => Math.max(config.modifierCap.min, Math.min(config.modifierCap.max, activeModifiers(state).reduce((v, m) => v * (m[side]?.[gauge] ?? 1), 1))) * status;
    return [gauge, { gain: side('gain'), loss: side('loss') }];
  })) as Record<Gauge, { gain: number; loss: number }>;
}
export function arrowCount(m: number): 0 | 1 | 2 | 3 {
  const e = 1e-9;
  if (m >= 1.35 - e || m <= 0.75 + e) return 3;
  if (m >= 1.15 - e || m <= 0.85 + e) return 2;
  if (m >= 1.05 - e || m <= 0.95 + e) return 1;
  return 0;
}
type Source = { group: 'flow' | 'omen' | 'blessing' | 'status'; id: string; count?: number; left?: number; factors: Partial<Record<Gauge, { gain?: number; loss?: number }>> };
function factors(m: Modifier): Source['factors'] {
  const result: Source['factors'] = {};
  for (const gauge of ['sugar', 'faith', 'people', 'erpin'] as Gauge[]) {
    const gain = m.gain?.[gauge], loss = m.loss?.[gauge];
    if ((gain !== undefined && gain !== 1) || (loss !== undefined && loss !== 1)) result[gauge] = { ...(gain !== undefined && gain !== 1 ? { gain } : {}), ...(loss !== undefined && loss !== 1 ? { loss } : {}) };
  }
  return result;
}
export function bishopSources(state: State): Source[] {
  const b = state.bishop;
  if (!b) return [];
  const result: Source[] = [];
  if (b.flow) result.push({ group: 'flow', id: b.flow.id, left: Math.max(0, b.flow.until - state.year), factors: factors(config.flows.find((x) => x.id === b.flow!.id)!) });
  for (const omen of b.omens) {
    const existing = result.find((x) => x.group === 'omen' && x.id === omen.id);
    if (existing) { existing.count!++; continue; }
    const original: Modifier = config.omens.find((x) => x.id === omen.id)!;
    const m: Modifier = b.embrace === 'used' ? { gain: Object.fromEntries(Object.keys(original.gain ?? {}).map((g) => [g, config.embrace.omenAfter])), loss: Object.fromEntries(Object.keys(original.loss ?? {}).map((g) => [g, config.embrace.omenAfter])) } : original;
    result.push({ group: 'omen', id: omen.id, count: 1, factors: factors(m) });
  }
  for (const id of b.blessings) result.push({ group: 'blessing', id, factors: factors(config.blessings.find((x) => x.id === id)!) });
  for (const status of state.statuses) if (status.scale) result.push({ group: 'status', id: status.id, factors: { [status.scale.gauge]: { gain: status.scale.factor, loss: status.scale.factor } } });
  return result;
}
export function bishopSpecials(state: State): { id: string; source?: { group: 'flow' | 'blessing'; id: string } }[] {
  const b = state.bishop;
  if (!b) return [];
  const result: { id: string; source?: { group: 'flow' | 'blessing'; id: string } }[] = [];
  for (const [group, entries] of [['flow', config.flows.filter((x) => x.id === b.flow?.id)], ['blessing', config.blessings.filter((x) => b.blessings.includes(x.id))]] as const)
    for (const entry of entries) for (const id of ('specials' in entry ? entry.specials : []) ?? []) result.push({ id, source: { group, id: entry.id } });
  if (b.embrace !== 'none') result.push({ id: b.embrace === 'held' ? 'embrace' : 'omenUp' });
  return result;
}
