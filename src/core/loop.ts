import {
  advanceBishop,
  bishopConfig,
  bishopCurve,
  bishopEffectMultiplier,
  embraceSave,
} from './bishop';
import { resultStatus, statusGauges, statusesReplacedBy } from './status';
import {
  APPRENTICE_ERA_FACTOR,
  BANDAGE_AMOUNT,
  BULLET_CHARGES,
  END_YEAR,
  ERA_SCALE,
  GAUGE_KEYS,
  REWIND_YEARS,
  SLEEP_TURNS,
  STATUS_CAN_KILL,
  SCOPE_HARM,
  SCOPE_HELP,
} from './config';
import { advanceDrowse } from './axe';
import { dueYear, nextDocument, rerollDaily } from './deck';
import {
  boundary,
  bulletForbidden,
  itemsLocked,
  recordSnapshot,
  type ActiveStatus,
  type Gauge,
  type Action,
  type Card,
  type RNG,
  type State,
} from './state';
export function processDocument(
  state: State,
  action: Action,
  cards: Card[],
  rng: RNG,
): State {
  const card = state.current;
  if (!card || state.ending || state.scene) return state;
  const noTime = state.currentImmediate === true;
  if (state.asleepPending) return dismissScene(state);
  if (action === 'alice') return rerollDaily(state, cards, rng);
  if (card.blessings && state.bishop) {
    if (action !== 'reject' && action !== 'approve') return state;
    const id =
      card.blessings[action === 'reject' ? 0 : 1] ?? card.blessings[0]!;
    return recordSnapshot(
      nextDocument(
        {
          ...state,
          current: null,
          currentImmediate: undefined,
          bishop: {
            ...state.bishop,
            blessings: [...new Set([...state.bishop.blessings, id])],
            answer: null,
            pendingAnswers: state.bishop.pendingAnswers - 1,
          },
        },
        cards,
        rng,
      ),
    );
  }
  const axeForbidden = card.axe === false || card.axe === 'bullet';
  const bulletUsable = !bulletForbidden(card) && (state.boons.bullet ?? 0) > 0;
  if (
    action === 'axe' &&
    (state.sleep || axeForbidden || state.statuses.some((s) => s.axeLock))
  )
    return state;
  if (action === 'bullet' && (state.sleep || !bulletUsable)) return state;
  const asleep = state.sleep > 0;
  let actual = asleep ? (rng() < 0.5 ? 'reject' : 'approve') : action;
  const stampGauges = (side: 'reject' | 'approve') => {
    const gauges = { ...state.gauges };
    if (card.axe !== 'free') {
      for (const [key, delta] of Object.entries(
        choiceEffects(
          card[side],
          state.gauges,
          card.kind,
          state.year,
          state.statuses,
          state,
          card,
        ),
      )) {
        const gauge = key as keyof typeof gauges;
        gauges[gauge] = Math.max(0, Math.min(100, gauges[gauge] + delta));
      }
    }
    return gauges;
  };
  const discarded = actual === 'axe' || actual === 'bullet';
  let gauges = discarded
    ? { ...state.gauges }
    : stampGauges(actual as 'reject' | 'approve');
  let kickedOut = false;
  const protect = () => {
    if (card.safe) {
      for (const key of GAUGE_KEYS) gauges[key] = Math.max(1, Math.min(99, gauges[key]));

    }
  };
  protect();
  let erpinSaved = state.erpinSaved;
  if (!discarded && boundary(gauges)) {
    const other = actual === 'reject' ? 'approve' : 'reject';
    const otherGauges = stampGauges(other);
    if (asleep && !erpinSaved && !boundary(otherGauges)) {
      actual = other;
      gauges = otherGauges;
      erpinSaved = true;
    }
  }
  const result =
    discarded || card.axe === 'free'
      ? undefined
      : card[actual as 'reject' | 'approve'];
  if (result?.witchPress) {
    for (const key of GAUGE_KEYS)
      if (
        state.gauges[key] === 50 &&
        state.blindfold !== key &&
        !state.statuses.some((s) => s.freeze === key)
      )
        gauges[key] = 50 + (rng() < 0.5 ? -1 : 1) * Math.abs(gauges[key] - 50);
  }
  const relations = { ...state.relations };
  for (const [key, delta] of Object.entries(result?.relations ?? {}))
    relations[key] = (relations[key] ?? 0) + delta;
  const fooled = !asleep && !discarded && card.axe === 'free';
  const boons = { ...state.boons };
  if (
    !asleep &&
    !noTime &&
    (hasHyean(state) || (state.boons.intuition?.left ?? 0) > 0) &&
    card.kind !== 'story' &&
    [card.reject, card.approve].some(
      (side) =>
        Object.keys(side.effects).length > 0 || side.adjust || side.mend,
    )
  ) {
    const boon = hasHyean(state) ? 'hyean' : 'intuition';
    const left = boons[boon]!.left - 1;
    if (left > 0) boons[boon] = { left };
    else delete boons[boon];
  }
  if (state.blindfold && boons.blindfold) {
    if (--boons.blindfold === 0) delete boons.blindfold;
  }
  if (state.scoped && !discarded) {
    boons.scope = (boons.scope ?? 0) - 1;
    if (!boons.scope) delete boons.scope;
  }
  if (actual === 'bullet') {
    boons.bullet = boons.bullet! - 1;
    if (boons.bullet === 0) delete boons.bullet;
  }
  const counted =
    (actual === 'axe' && card.axe === true) || fooled
      ? 1
      : (result?.drowse ?? 0);
  const pendingDueYears = cards
    .filter(
      (c) =>
        (c.kind === 'story' || c.kind === 'fixed') &&
        c.trigger &&
        !c.trigger.onCondition &&
        (!state.seen.includes(c.id) ||
          (c.trigger.scheduled && state.scheduled[c.id] !== undefined)),
    )
    .map((c) => dueYear(c, state))
    .filter((year) => year > state.year);
  let cause = boundary(gauges);
  if (cause && boons.stitch) cause = undefined;
  const year = cause
    ? state.year
    : result?.schedule?.years === 0
      ? state.year
      : Math.min(
          state.year + card.years,
          state.mode === 'bishop' ? Infinity : END_YEAR,
          ...pendingDueYears,
        );
  let drowse = state.drowse;
  let sleep = Math.max(0, state.sleep - 1);
  if (!asleep) {
    if (!counted)
      drowse = advanceDrowse(
        drowse,
        false,
        !noTime && (year > state.year || Boolean(card.boss)),
      );
    for (let use = 0; use < counted; use++) {
      const fallsAsleep = drowse.stack === 2;
      drowse = advanceDrowse(drowse, true, year > state.year);
      if (fallsAsleep) {
        sleep = SLEEP_TURNS;
        break;
      }
    }
  }
  let statuses = state.statuses;
  if (!noTime && (card.kind !== 'story' || year > state.year)) {
    const frozen = new Set(statuses.map((s) => s.freeze));
    const apply = (effects: ActiveStatus['tick'], floor?: number) => {
      for (const [key, delta] of Object.entries(effects ?? {})) {
        const gauge = key as Gauge;
        if (frozen.has(gauge) || state.blindfold === gauge) continue;
        // A status must never rescue a card-caused collapse.
        if (!STATUS_CAN_KILL && (gauges[gauge] <= 0 || gauges[gauge] >= 100))
          continue;
        if (floor !== undefined && delta < 0 && gauges[gauge] <= floor) continue;
        const lethal = STATUS_CAN_KILL || (state.mode !== 'bishop' && !!state.boss);
        gauges[gauge] = Math.max(
          floor !== undefined && delta < 0 ? floor : lethal ? 0 : 1,
          Math.min(lethal ? 100 : 99, gauges[gauge] + delta),
        );
      }
    };
    statuses = statuses.flatMap((status) => {
      apply(status.tick, status.floor);
      const left = status.id === 'sugar_cut' ? status.left : status.left - 1;
      if (left > 0) return [{ ...status, left }];
      apply(status.delayed);
      if (status.drowseReset) drowse = { stack: 0, left: 0 };
      return [];
    });
  }
  const chosenStatus = discarded
    ? undefined
    : resultStatus(card[actual as 'reject' | 'approve'], state.gauges);
  if (chosenStatus) {
    const { turns, ...status } = structuredClone(chosenStatus);
    const replaced = statusesReplacedBy(statuses, chosenStatus);
    statuses = [
      ...statuses.filter((s) => !replaced.includes(s)),
      { ...status, left: state.scoped && [status.tick, status.delayed].some(e => Object.entries(e ?? {}).some(([key, delta]) => (state.gauges[key as Gauge] - 50) * delta >= 0)) ? Math.ceil(turns / 2) : turns, source: card.id },
    ];
  }
  if (result?.witchDrift) {
    statuses = statuses.filter((s) => s.id !== 'pikora_drift');
    for (const gauge of GAUGE_KEYS)
      statuses.push({
        id: 'pikora_drift',
        source: card.id,
        left: state.scoped ? Math.ceil(result.witchDrift.turns / 2) : result.witchDrift.turns,
        tick: { [gauge]: (rng() < 0.5 ? -1 : 1) * result.witchDrift.perDoc },
      });
  }
  if (card.status)
    statuses = [
      ...statuses.filter(
        (s) =>
          s.id !== card.status!.id &&
          !statusGauges(s).some((gauge) =>
            statusGauges(card.status!).includes(gauge),
          ),
      ),
      { ...card.status, source: card.id, left: 1 },
    ];
  if (card.bossAt === 10)
    statuses = statuses.filter((s) => s.id !== 'sugar_cut');
  protect();
  const stitched = Boolean(boons.stitch && boundary(gauges));
  if (stitched) {
    for (const key of GAUGE_KEYS) {
      if (gauges[key] <= 0) gauges[key] = 10;
      else if (gauges[key] >= 100) gauges[key] = 90;
    }
    delete boons.stitch;
  }
  cause = boundary(gauges);
  if (cause && state.mode !== 'bishop' && state.boss && !state.boss.kickoutUsed && !boons.rewind) {
    kickedOut = true;
    for (const key of GAUGE_KEYS) {
      if (gauges[key] <= 0) gauges[key] = 3;
      else if (gauges[key] >= 100) gauges[key] = 97;
    }
    cause = undefined;
  }
  const flags = [
    ...new Set([
      ...state.flags,
      ...(card.axe === 'free' ? [] : (result?.setFlags ?? [])),
      ...(discarded ? (card.axeResult?.setFlags ?? []) : []),
    ]),
  ];
  const flagYears = { ...state.flagYears };
  for (const flag of flags) flagYears[flag] ??= year;
  const grant = result?.grant;
  if (grant?.boon === 'hyean' || grant?.boon === 'intuition')
    boons[grant.boon] = {
      left: Math.max(boons[grant.boon]?.left ?? 0, grant.uses!),
    };
  else if (grant?.boon === 'bullet')
    boons.bullet = Math.min(
      BULLET_CHARGES,
      (boons.bullet ?? 0) + BULLET_CHARGES,
    );
  else if (grant?.boon === 'blindfold')
    boons.blindfold = (boons.blindfold ?? 0) + (grant.uses ?? 1);
  else if (grant?.boon === 'bandage') boons.bandage = (boons.bandage ?? 0) + 1;
  else if (grant?.boon === 'scope') boons.scope = (boons.scope ?? 0) + grant.uses!;
  else if (grant) boons[grant.boon] = true;
  const scheduled = { ...state.scheduled };
  if (result?.schedule && card.axe !== 'free') {
    const { card: target, years } = result.schedule;
    scheduled[target] = Math.min(scheduled[target] ?? Infinity, year + years);
  }
  const next = nextDocument(
    advanceBishop(
      embraceSave({
        ...state,
        gauges,
        statuses,
        blindfold: undefined,
        immediate:
          result?.schedule?.years === 0 ? result.schedule.card : undefined,
        rewindYear: grant?.boon === 'rewind' ? year : state.rewindYear,
        boss: state.boss && {
          ...state.boss,
          ...(kickedOut ? { kickoutUsed: true } : {}),
          done: state.boss.done + (card.boss && (!cause || (state.mode !== 'bishop' && !state.boss.kickoutUsed)) ? 1 : 0),
        },
        record: {
          helped:
            state.record.helped || stitched || kickedOut || (!state.erpinSaved && erpinSaved),
          axed: state.record.axed || (actual === 'axe' && card.axe === true),
        },
        erpinSaved,
        stitched,
        relations,
        flags,
        flagYears,
        scheduled,
        boons,
        bestYear: Math.max(state.bestYear, year),
        year,
        drowse,
        sleep,
        current: null,
        currentImmediate: undefined,
        scoped: undefined,
        scene: discarded
          ? (card.axeResult?.scene ?? null)
          : fooled
            ? (card.missed?.scene ?? null)
            : null,
        ending: cause ? { id: asleep ? 'sleep' : cause, cause } : null,
      }),
      state.year,
      rng,
    ),
    cards,
    rng,
  );
  const asleepPending =
    !next.ending &&
    (next.mode === 'bishop' || next.year < END_YEAR) &&
    !asleep &&
    next.sleep > 0;
  const scene =
    !next.ending && kickedOut ? 'kickout' : next.scene ??
    (next.ending
      ? null
      : stitched
        ? 'stitch'
        : !state.erpinSaved && erpinSaved
          ? 'erpinSave'
          : null);
  return recordSnapshot({
    ...next,
    scene: scene ?? (asleepPending ? 'asleep' : null),
    asleepPending: asleepPending && scene !== null,
  });
}

export function declineRewind(state: State, cards: Card[], rng: RNG): State {
  if (!canRewind(state) || state.mode === 'bishop' || !state.boss || state.boss.kickoutUsed || !boundary(state.gauges)) return state;
  const gauges = { ...state.gauges };
  for (const key of GAUGE_KEYS) {
    if (gauges[key] <= 0) gauges[key] = 3;
    else if (gauges[key] >= 100) gauges[key] = 97;
  }
  return recordSnapshot(nextDocument({
    ...state,
    gauges,
    ending: null,
    boss: { ...state.boss, kickoutUsed: true },
    record: { ...state.record, helped: true },
    scene: 'kickout',
  }, cards, rng));
}

export function dismissScene(state: State): State {
  return {
    ...state,
    scene:
      state.asleepPending &&
      state.sleep > 0 &&
      (state.mode === 'bishop' || state.year < END_YEAR) &&
      !state.ending
        ? 'asleep'
        : null,
    asleepPending: false,
  };
}

export function eraScale(year: number): number {
  const first = ERA_SCALE[0]!;
  if (year <= first[0]) return first[1];
  for (let i = 1; i < ERA_SCALE.length; i++) {
    const [endYear, end] = ERA_SCALE[i]!;
    const [startYear, start] = ERA_SCALE[i - 1]!;
    if (year <= endYear)
      return (
        start + ((year - startYear) / (endYear - startYear)) * (end - start)
      );
  }
  return ERA_SCALE.at(-1)![1];
}

export function effectiveEraScale(year: number, mode?: State['mode']): number {
  const scale = eraScale(year);
  return mode === 'apprentice' ? 1 + (scale - 1) * APPRENTICE_ERA_FACTOR : scale;
}

export function choiceEffects(
  result: import('./state').Result,
  gauges: State['gauges'],
  kind?: Card['kind'],
  year = 0,
  statuses: ActiveStatus[] = [],
  state?: State,
  card?: Card,
): Partial<State['gauges']> {
  const effects = { ...result.effects };
  if (state?.bishop && kind !== 'story') {
    const era =
      (kind === 'daily' || kind === 'special' || kind === 'speaki') &&
      !bishopConfig.crisis.cards.includes(card?.id ?? '')
        ? bishopCurve(year, bishopConfig.scale)
        : 1;
    for (const key of Object.keys(effects) as Gauge[]) {
      const delta = effects[key]!;
      effects[key] =
        Math.sign(delta) *
        Math.max(
          5,
          Math.round(
            (Math.abs(delta) *
              era *
              bishopEffectMultiplier(state, key, delta > 0)) /
              5,
          ) * 5,
        );
    }
  }
  if (result.adjust) {
    const keys = ['people', 'faith', 'erpin'] as const;
    const target = keys.reduce((a, b) =>
      Math.abs(gauges[b] - 50) > Math.abs(gauges[a] - 50) ? b : a,
    );
    effects[target] =
      (effects[target] ?? 0) +
      Math.sign(50 - gauges[target]) *
        Math.min(result.adjust, Math.abs(50 - gauges[target]));
  }
  if (
    !state?.bishop &&
    (kind === 'daily' || kind === 'special' || kind === 'speaki')
  ) {
    const scale = effectiveEraScale(year, state?.mode);
    for (const key of Object.keys(effects) as (keyof typeof effects)[]) {
      const delta = effects[key]!;
      effects[key] =
        Math.sign(delta) *
        Math.max(5, Math.round((Math.abs(delta) * scale) / 5) * 5);
    }
  }
  for (const gauge of Object.keys(effects) as Gauge[]) {
    let delta = effects[gauge]!;
    for (const status of statuses)
      if (status.scale?.gauge === gauge) {
        delta =
          Math.sign(delta) *
          Math.max(
            5,
            Math.round((Math.abs(delta) * status.scale.factor) / 5) * 5,
          );
      }
    effects[gauge] = delta;
  }
  Object.assign(effects, mendEffects(result.mend, gauges));
  if (result.witchPress) {
    const { amount, floor } = result.witchPress;
    for (const gauge of GAUGE_KEYS) {
      const direction = Math.sign(gauges[gauge] - 50) || 1;
      const pushed =
        Math.max(
          floor,
          Math.min(100 - floor, gauges[gauge] + direction * amount),
        ) - gauges[gauge];
      // Fricle only ever pushes outward; a gauge already past the floor stays put.
      effects[gauge] = pushed * direction > 0 ? pushed : 0;
    }
  }
  for (const gauge of Object.keys(effects) as Gauge[]) {
    let delta = effects[gauge]!;
    if (state?.scoped) {
      const distance = Math.abs(50 - gauges[gauge]);
      const toward = (50 - gauges[gauge]) * delta > 0;
      delta = Math.sign(delta) * (toward
        ? Math.max(Math.abs(delta), Math.min(Math.round(Math.abs(delta) * SCOPE_HELP), distance))
        : Math.round(Math.abs(delta) * SCOPE_HARM));
    }
    const end = gauges[gauge] + delta;
    if (Math.abs(end - 50) > Math.abs(gauges[gauge] - 50) && state?.boons.understudy && (end <= 20 || end >= 80))
      delta =
        Math.sign(delta) *
        Math.min(Math.abs(delta), Math.max(5, Math.abs(delta) - 5));
    effects[gauge] = delta;
  }
  for (const gauge of Object.keys(effects) as Gauge[])
    if (statuses.some((s) => s.freeze === gauge) || state?.blindfold === gauge)
      effects[gauge] = 0;
  return effects;
}
// Erpin's sleepy stamp: the coin the desk already showed picks the side, and
// every later roll (witch drifts, the next draw) is fresh.
export function sleepCoin(coin: number, rng: RNG = Math.random): RNG {
  let used = false;
  return () => (used ? rng() : ((used = true), coin));
}
export const hasHyean = (state: State): boolean =>
  (state.boons.hyean?.left ?? 0) > 0;
export const canRewind = (state: State): boolean =>
  Boolean(state.ending && state.ending.id !== 'true' && state.boons.rewind);
export function rewind(state: State, cards: Card[], rng: RNG): State {
  if (!canRewind(state)) return state;
  const target =
    (state.past ?? [])
      .filter((snapshot) =>
        state.boss
          ? snapshot.boss &&
            snapshot.boss.done <= Math.max(0, state.boss.done - 3)
          : snapshot.year >= (state.rewindYear ?? 0) &&
            snapshot.year <= state.year - REWIND_YEARS,
      )
      .at(-1) ??
    state.past?.find((snapshot) =>
      state.boss ? !!snapshot.boss : snapshot.year >= (state.rewindYear ?? 0),
    );
  const boons = { ...(target ?? state).boons };
  delete boons.rewind;
  if (target)
    return {
      ...structuredClone(target),
      ...(target.boss && state.boss?.kickoutUsed ? { boss: { ...target.boss, kickoutUsed: true } } : {}),
      ...(target.bishop && state.bishop?.embrace === 'used'
        ? { bishop: { ...structuredClone(target.bishop), embrace: 'used' } }
        : {}),
      record: { ...state.record, helped: true },
      boons,
      bestYear: Math.max(state.bestYear, state.year),
      past: [],
      ending: null,
      scene: null,
      stitched: false,
    };
  return nextDocument(
    {
      ...state,
      record: { ...state.record, helped: true },
      past: [],
      year: Math.max(
        state.boss ? END_YEAR : (state.rewindYear ?? 0),
        state.year - REWIND_YEARS,
      ),
      bestYear: Math.max(state.bestYear, state.year),
      gauges: { sugar: 50, people: 50, faith: 50, erpin: 50 },
      boons,
      drowse: { stack: 0, left: 0 },
      sleep: 0,
      stitched: false,
      ending: null,
      scene: null,
      current: null,
    },
    cards,
    rng,
  );
}

export function mendEffects(
  mend: import('./state').Result['mend'],
  gauges: State['gauges'],
): Partial<State['gauges']> {
  if (!mend) return {};
  const keys = GAUGE_KEYS.filter((key) => !mend.exclude?.includes(key));
  if (mend.mode !== 'all')
    keys.sort((a, b) => Math.abs(gauges[b] - 50) - Math.abs(gauges[a] - 50));
  return Object.fromEntries(
    keys
      .slice(0, mend.mode === 'all' ? keys.length : (mend.count ?? 1))
      .map((key) => [
        key,
        Math.sign(50 - gauges[key]) *
          (mend.mode === 'center'
            ? Math.abs(50 - gauges[key])
            : Math.min(mend.amount ?? 0, Math.abs(50 - gauges[key]))),
      ]),
  );
}

export function placeBlindfold(state: State, gauge?: Gauge): State {
  if (
    state.ending ||
    state.scene ||
    state.sleep ||
    !state.current ||
    itemsLocked(state.current) ||
    !(state.boons.blindfold! > 0)
  )
    return state;
  return { ...state, blindfold: gauge };
}

export function useBandage(state: State, gauge: Gauge): State {
  if (state.ending || state.scene || state.sleep || !state.current || itemsLocked(state.current) || state.bishop?.notices.length || !(state.boons.bandage! > 0) || state.gauges[gauge] === 50) return state;
  const value = state.gauges[gauge];
  const boons: State['boons'] = { ...state.boons, bandage: state.boons.bandage! - 1 };
  if (!boons.bandage) delete boons.bandage;
  return { ...state, boons, gauges: { ...state.gauges, [gauge]: value + Math.sign(50 - value) * Math.min(BANDAGE_AMOUNT, Math.abs(50 - value)) } };
}

export function aimScope(state: State): State {
  const card = state.current;
  if (!(state.boons.scope! > 0) || state.scoped || !card || itemsLocked(card) || state.ending || state.scene || state.sleep || state.bishop?.notices.length) return state;
  return { ...state, scoped: true };
}
