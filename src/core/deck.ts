import {
  bishopConfig,
  bishopEligible,
  bishopWeight,
  nextAnswer,
} from './bishop';
import { system } from '../i18n';
import {
  APPRENTICE_ELVES,
  APPRENTICE_PHASES,
  APPRENTICE_SPIRITS,
  END_YEAR,
  GROUP_GAP,
  NPC_GAP,
  NPC_SAME_GAP,
  PHASES,
  PRACTICUM_QUIET_YEARS,
  RECENT_LIMIT,
  SPECIAL_CHANCE,
  SPEAKI_CHANCE,
  SPEAKI_GAP,
} from './config';
import { recordSnapshot, type Card, type RNG, type State } from './state';
import { directorWeight } from './director';
import { statusGauges } from './status';
const PRACTICUM = 'special_fricle_pikora';
// A card that would start a lingering gauge effect stays away while one that
// cannot be pushed out (Pikora's drift, the boss sugar cut) holds that gauge,
// and in the quiet years before the practicum: effects never pile up.
function statusBlocked(card: Card, state: State): boolean {
  const gauges = [card.reject, card.approve].flatMap((side) =>
    side?.status ? statusGauges(side.status) : [],
  );
  if (!gauges.length) return false;
  const practicum = state.windowYears[PRACTICUM];
  if (
    practicum !== undefined &&
    !state.seen.includes(PRACTICUM) &&
    state.year >= practicum - PRACTICUM_QUIET_YEARS
  )
    return true;
  return state.statuses.some(
    (s) =>
      (s.id === 'pikora_drift' || s.id === 'sugar_cut') &&
      statusGauges(s).some((gauge) => gauges.includes(gauge)),
  );
}
export function eligible(card: Card, state: State): boolean {
  if (card.modes && !card.modes.includes(state.mode)) return false;
  if (!bishopEligible(card, state)) return false;
  if (card.boss && (!state.boss || state.mode === 'bishop')) return false;
  if (statusBlocked(card, state)) return false;
  if (card.pool && !state.poolCards?.includes(card.id)) return false;
  if (card.variant?.group === 'elves' && state.elfCards && !state.elfCards.includes(card.id)) return false;
  const c = card.conditions;
  return (
    (!card.variant ||
      state.variantPools[card.variant.group] === card.variant.pool) &&
    (c?.flagsAll ?? []).every((f) => state.flags.includes(f)) &&
    (c?.flagsNone ?? []).every((f) => !state.flags.includes(f)) &&
    (c?.boonsNone ?? []).every((boon) => !state.boons[boon as keyof State['boons']]) &&
    state.year >= (c?.minYear ?? 0) &&
    state.year <= (c?.maxYear ?? Infinity) &&
    Object.entries(c?.gauges ?? {}).every(([key, range]) => {
      const value = state.gauges[key as keyof State['gauges']];
      return value >= (range.min ?? 0) && value <= (range.max ?? 100);
    }) &&
    !(
      card.kind === 'special' &&
      card.period &&
      (state.appearanceYears[card.id] ?? []).some(
        (year) =>
          Math.floor(year / card.period!) ===
          Math.floor(state.year / card.period!),
      )
    ) &&
    // A card that hands out a one-time boon stays away while that boon is held.
    ![card.reject, card.approve].some(
      (r) => r?.grant?.boon === 'alice' && state.boons.alice,
    ) &&
    // Intuition keeps further intuition and hyean offers away.
    !(
      state.boons.intuition &&
      [card.reject, card.approve].some(
        (r) => r?.grant?.boon === 'intuition' || r?.grant?.boon === 'hyean',
      )
    ) &&
    !(
      card.kind !== 'speaki' &&
      card.npc &&
      (Object.values(state.npcYears).some(
        (year) => state.year - year < NPC_GAP,
      ) ||
        state.year - (state.npcYears[card.npc] ?? -Infinity) < NPC_SAME_GAP)
    )
  );
}
export function materializeCard(card: Card, cards: Card[]): Card {
  if (card.kind !== 'speaki' || !card.mimic) return card;
  const target = cards.find((c) => c.kind === 'daily' && c.id === card.mimic);
  if (!target) return card;
  const { speaker, faction, title, tier, years, reject, approve } = target;
  return {
    ...card,
    speaker,
    faction,
    title,
    tier,
    years,
    reject: structuredClone(reject),
    approve: structuredClone(approve),
  };
}
export function dueYear(card: Card, state: State): number {
  const t = card.trigger;
  if (card.bossAfter !== undefined || card.boss) return Infinity;
  if (!t) return Infinity;
  if (t.onCondition) return eligible(card, state) ? state.year : Infinity;
  if (t.from !== undefined) return state.windowYears[card.id] ?? Infinity;
  if (t.scheduled) return state.scheduled[card.id] ?? Infinity;
  return t.after !== undefined
    ? (state.flagYears[t.after] ?? Infinity) + t.years
    : t.year;
}
function conditionDistance(card: Card, state: State): number {
  return Math.max(
    ...Object.keys(card.conditions?.gauges ?? {}).map((key) =>
      Math.abs(state.gauges[key as keyof State['gauges']] - 50),
    ),
  );
}
function weighted<T>(pool: T[], weight: (value: T) => number, rng: RNG): T {
  let roll = rng() * pool.reduce((sum, value) => sum + weight(value), 0);
  return (
    pool.find((value) => (roll -= weight(value)) < 0) ?? pool[pool.length - 1]!
  );
}
export function nextDocument(state: State, cards: Card[], rng: RNG): State {
  if (state.ending || state.current) return state;
  cards = cards.filter((c) => !c.modes || c.modes.includes(state.mode));
  if (state.immediate) {
    const followup = cards.find((c) => c.id === state.immediate);
    const scheduled = { ...state.scheduled };
    delete scheduled[state.immediate];
    state = { ...state, immediate: undefined, scheduled };
    if (followup)
      return {
        ...state,
        current: followup,
        currentImmediate: true,
        seen: [...new Set([...state.seen, followup.id])],
      };
  }
  if (state.mode !== 'bishop' && state.year >= END_YEAR) {
    state = {
      ...state,
      year: END_YEAR,
      boss: state.boss ?? { done: 0, drawn: [] },
      sleep: 0,
      asleepPending: false,
      drowse: state.boss ? state.drowse : { stack: 0, left: 0 },
    };
    const boss = state.boss!;
    const opening = cards
      .filter(
        (c) =>
          c.trigger?.year === END_YEAR &&
          c.bossAfter === undefined &&
          c.trigger.order <= 2 &&
          !state.seen.includes(c.id),
      )
      .sort((a, b) => a.trigger!.order - b.trigger!.order)[0];
    const beat = cards
      .filter(
        (c) =>
          c.bossAfter !== undefined &&
          c.bossAfter <= boss.done &&
          !state.seen.includes(c.id),
      )
      .sort((a, b) => a.bossAfter! - b.bossAfter!)[0];
    const finale =
      boss.done >= 10
        ? cards
            .filter(
              (c) =>
                c.kind === 'story' &&
                c.trigger?.year === END_YEAR &&
                c.bossAfter === undefined &&
                !state.seen.includes(c.id),
            )
            .sort((a, b) => a.trigger!.order - b.trigger!.order)[0]
        : undefined;
    const story = opening ?? beat ?? finale;
    if (story)
      return { ...state, current: story, seen: [...state.seen, story.id] };
    if (boss.done >= 10)
      return {
        ...state,
        statuses: state.statuses.filter((s) => s.id !== 'sugar_cut'),
        ending: { id: 'true' },
      };
    const fixed = cards.find((c) => c.boss && c.bossAt === boss.done + 1);
    const pool = cards.filter(
      (c) =>
        c.bossAt === undefined &&
        c.boss === (boss.done < 2 ? 'cleanup' : 'unrest') &&
        (boss.done < 2 || c.bossPhase === (boss.done < 4 ? 'early' : 'late')) &&
        !boss.drawn.includes(c.id),
    );
    if (!fixed && !pool.length) throw new Error('Missing boss documents');
    const selected = fixed ?? weighted(
      pool,
      (c) => (boss.done < 2 ? 1 : directorWeight(c, state)),
      rng,
    );
    return {
      ...state,
      current: selected,
      boss: { ...boss, drawn: [...boss.drawn, selected.id] },
    };
  }
  const answer = nextAnswer(state, rng);
  if (answer) return answer;
  if (state.mode !== 'bishop' && state.year >= END_YEAR)
    state = {
      ...state,
      sleep: 0,
      asleepPending: false,
      drowse: { stack: 0, left: 0 },
    };
  let variantPools = { ...state.variantPools };
  const newGroups = new Set<string>();
  const groups = new Map<string, Set<number>>();
  for (const { variant } of cards) {
    if (!variant) continue;
    if (!groups.has(variant.group)) groups.set(variant.group, new Set());
    groups.get(variant.group)!.add(variant.pool);
  }
  for (const [group, pools] of groups) {
    if (!Object.hasOwn(variantPools, group)) {
      const choices = [...pools];
      variantPools = {
        ...variantPools,
        [group]: choices[Math.floor(rng() * choices.length)]!,
      };
      newGroups.add(group);
    }
  }
  if (state.mode === 'apprentice' && newGroups.has('elves')) {
    const choices = cards.filter((card) => card.variant?.group === 'elves' && card.variant.pool === variantPools.elves);
    const selected: string[] = [];
    while (choices.length && selected.length < APPRENTICE_ELVES)
      selected.push(choices.splice(Math.floor(rng() * choices.length), 1)[0]!.id);
    state = { ...state, elfCards: selected };
  }
  const windowYears = { ...state.windowYears };
  if (state.mode !== 'bishop' && state.poolCards === undefined) {
    const spirits = cards.filter((c) => c.pool?.group === 'spirits');
    const pairs = spirits.flatMap((a, i) =>
      spirits
        .slice(i + 1)
        .filter((b) => b.pool!.member !== a.pool!.member)
        .map((b) => [a, b] as const),
    );
    const touched = (c: Card) =>
      new Set([
        ...Object.keys(c.reject.effects),
        ...Object.keys(c.approve.effects),
      ]);
    const disjoint = pairs.filter(([a, b]) =>
      [...touched(a)].every((key) => !touched(b).has(key)),
    );
    const choices = disjoint.length ? disjoint : pairs;
    const selected = state.mode === 'apprentice' && APPRENTICE_SPIRITS < 2
      ? (spirits.length && APPRENTICE_SPIRITS > 0 ? [spirits[Math.floor(rng() * spirits.length)]!] : [])
      : choices.length ? choices[Math.floor(rng() * choices.length)]! : [];
    state = { ...state, poolCards: selected.map((c) => c.id) };
    for (const card of spirits) delete windowYears[card.id];
  }
  const poolWindows = cards.filter(
    (c) =>
      c.pool &&
      state.poolCards?.includes(c.id) &&
      c.trigger?.from !== undefined,
  );
  for (const card of poolWindows) {
    if (windowYears[card.id] !== undefined) continue;
    const { from, to } = card.trigger!;
    const years = Array.from(
      { length: to! - from! + 1 },
      (_, i) => from! + i,
    ).filter((year) =>
      poolWindows.every(
        (other) =>
          other.id === card.id ||
          windowYears[other.id] === undefined ||
          Math.abs(windowYears[other.id]! - year) >= GROUP_GAP,
      ),
    );
    if (!years.length) throw new Error('Cannot space spirit pool');
    windowYears[card.id] = years[Math.floor(rng() * years.length)]!;
  }
  // Older saves assigned all variants independently, before a pool existed.
  for (const card of cards)
    if (card.variant && newGroups.has(card.variant.group))
      delete windowYears[card.id];
  for (const group of groups.keys()) {
    const windows = cards.filter(
      (card) =>
        card.variant?.group === group &&
        (!state.elfCards || group !== 'elves' || state.elfCards.includes(card.id)) &&
        card.variant.pool === variantPools[group] &&
        (card.kind === 'story' || card.kind === 'fixed') &&
        card.trigger?.from !== undefined,
    );
    // Try randomized years with backtracking so an early roll cannot strand a later card.
    const assign = (index: number): boolean => {
      if (index === windows.length) return true;
      const card = windows[index]!;
      const { from, to } = card.trigger!;
      const saved = windowYears[card.id];
      const count = to! - from! + 1;
      const start = saved === undefined ? Math.floor(rng() * count) : 0;
      for (
        let offset = 0;
        offset < (saved === undefined ? count : 1);
        offset++
      ) {
        const year = saved ?? from! + ((start + offset) % count);
        if (
          windows
            .slice(0, index)
            .some((other) => Math.abs(windowYears[other.id]! - year) < GROUP_GAP &&
              !(saved !== undefined && state.windowYears[other.id] !== undefined))
        )
          continue;
        windowYears[card.id] = year;
        if (assign(index + 1)) return true;
      }
      if (saved === undefined) delete windowYears[card.id];
      return false;
    };
    if (!assign(0))
      throw new Error(
        `Cannot space variant group ${group} by ${GROUP_GAP} years`,
      );
  }
  for (const card of cards) {
    const t = card.trigger;
    if (
      !card.variant &&
      !card.pool &&
      (card.kind === 'story' || card.kind === 'fixed') &&
      t?.from !== undefined &&
      windowYears[card.id] === undefined
    )
      windowYears[card.id] = t.from + Math.floor(rng() * (t.to - t.from + 1));
  }
  const practicum = cards.find((c) => c.id === 'special_fricle_pikora');
  if (practicum?.trigger?.from !== undefined && state.windowYears[practicum.id] === undefined) {
    const { from, to } = practicum.trigger;
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i)
      .filter((year) => cards.every((c) => c.id === practicum.id || c.kind !== 'fixed' ||
        windowYears[c.id] === undefined || Math.abs(windowYears[c.id]! - year) >= NPC_GAP));
    if (years.length) windowYears[practicum.id] = years[Math.floor(rng() * years.length)]!;
    else {
      const movable = cards.filter((c) => c.id !== practicum.id && c.kind === 'fixed' && c.trigger?.from !== undefined && state.windowYears[c.id] === undefined && windowYears[c.id] !== undefined && windowYears[c.id]! >= from - NPC_GAP + 1 && windowYears[c.id]! <= to + NPC_GAP - 1);
      const place = (index: number, year: number): boolean => {
        if (index === movable.length) return cards.every((c) => c.id === practicum.id || c.kind !== 'fixed' || windowYears[c.id] === undefined || Math.abs(windowYears[c.id]! - year) >= NPC_GAP);
        const card = movable[index]!;
        const trigger = card.trigger!;
        const original = windowYears[card.id]!;
        for (let candidate = trigger.from!; candidate <= trigger.to!; candidate++) {
          windowYears[card.id] = candidate;
          if (place(index + 1, year)) return true;
        }
        windowYears[card.id] = original;
        return false;
      };
      for (let year = from; year <= to; year++) if (place(0, year)) { windowYears[practicum.id] = year; break; }
    }
  }
  state = { ...state, windowYears, variantPools };
  const skipped = cards.filter(
    (c) =>
      c.trigger?.from !== undefined &&
      !state.seen.includes(c.id) &&
      dueYear(c, state) <= state.year &&
      (c.conditions?.boonsNone?.length
        ? state.year > c.trigger.to!
        : !eligible(c, state)),
  );
  if (skipped.length)
    state = { ...state, seen: [...state.seen, ...skipped.map((c) => c.id)] };
  const mandatory = cards
    .filter(
      (c) =>
        !c.boss &&
        c.bossAfter === undefined &&
        !state.sleep &&
        (c.kind === 'story' || c.kind === 'fixed') &&
        (state.mode === 'bishop' ||
          state.year < END_YEAR ||
          (c.kind === 'story' && c.trigger?.year === END_YEAR)) &&
        c.trigger &&
        dueYear(c, state) <= state.year &&
        (c.trigger.scheduled || !state.seen.includes(c.id)) &&
        !(
          c.id === PRACTICUM &&
          state.statuses.some((s) => statusGauges(s).length > 0)
        ) &&
        eligible(c, state),
    )
    .sort(
      (a, b) =>
        dueYear(a, state) - dueYear(b, state) ||
        Number(!!a.trigger!.onCondition) - Number(!!b.trigger!.onCondition) ||
        (a.trigger!.onCondition && b.trigger!.onCondition
          ? conditionDistance(b, state) - conditionDistance(a, state)
          : 0) ||
        a.trigger!.order - b.trigger!.order,
    )[0];
  if (mandatory) {
    const scheduled = { ...state.scheduled };
    if (mandatory.trigger?.scheduled) delete scheduled[mandatory.id];
    return {
      ...state,
      current: mandatory,
      seen: [...new Set([...state.seen, mandatory.id])],
      scheduled,
    };
  }

  if (state.mode !== 'bishop' && state.year >= END_YEAR)
    return { ...state, ending: { id: 'true' } };

  const specials = cards.filter(
    (c) =>
      c.kind === 'special' &&
      eligible(c, state) &&
      (c.repeatable || !state.seen.includes(c.id)),
  );
  const lastSpeakiYear = Math.max(
    -Infinity,
    ...cards
      .filter((c) => c.kind === 'speaki')
      .flatMap((c) => state.appearanceYears[c.id] ?? []),
  );
  const speakis =
    state.statuses.some((s) => s.axeLock) || state.year - lastSpeakiYear < SPEAKI_GAP
      ? []
      : cards.filter(
          (c) =>
            c.kind === 'speaki' &&
            !state.seen.includes(c.id) &&
            eligible(c, state) &&
            (!c.mimic ||
              cards.some(
                (target) =>
                  target.kind === 'daily' &&
                  target.id === c.mimic &&
                  eligible(target, state),
              )),
        );
  let selected: Card;
  if (
    speakis.length &&
    rng() < SPEAKI_CHANCE * bishopWeight(state, 'speakiChance')
  ) {
    selected = materializeCard(
      speakis[Math.floor(rng() * speakis.length)]!,
      cards,
    );
  } else if (rng() < SPECIAL_CHANCE && specials.length) {
    selected = weighted(
      specials,
      (c) => (c.weight ?? 1) * bishopWeight(state, 'speakers', c.speaker),
      rng,
    );
  } else {
    const pool = cards.filter((c) => c.kind === 'daily' && eligible(c, state));
    if (!pool.length) throw new Error(system.ui.noEligibleCard);
    const n = Math.min(pool.length - 1, RECENT_LIMIT);
    const recent = n > 0 ? state.recent.slice(-n) : [];
    const candidates = pool.filter((c) => !recent.includes(c.id));
    const phase =
      state.mode === 'bishop'
        ? bishopConfig.phases.find(
            (p) => p.until === null || state.year < p.until,
          )!
        : (state.mode === 'apprentice' ? APPRENTICE_PHASES : PHASES).find((p) => state.year < p.until)!;
    const tiers = ([1, 2, 3] as const).filter((tier) =>
      (state.mode !== 'bishop' || phase.weights[tier] > 0) && candidates.some((c) => c.tier === tier),
    );
    if (!tiers.length && state.mode === 'bishop') {
      candidates.splice(0, candidates.length, ...pool.filter((c) => phase.weights[c.tier ?? 1] > 0));
      tiers.push(...([1, 2, 3] as const).filter((t) => phase.weights[t] > 0 && candidates.some((c) => c.tier === t)));
    }
    const tier = weighted(
      tiers,
      (t) => phase.weights[t] * bishopWeight(state, 'tiers', String(t)),
      rng,
    );
    let tierPool = candidates.filter(
      (c) => c.tier === tier && !state.drawn.includes(c.id),
    );
    if (!tierPool.length) {
      const tierIds = new Set(
        cards
          .filter((c) => c.kind === 'daily' && c.tier === tier)
          .map((c) => c.id),
      );
      state = { ...state, drawn: state.drawn.filter((id) => !tierIds.has(id)) };
      tierPool = candidates.filter((c) => c.tier === tier);
    }
    const weights = tierPool.map(
      (c) =>
        directorWeight(c, state) * bishopWeight(state, 'speakers', c.speaker),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    selected = weighted(
      tierPool,
      total > 1e-12
        ? (c) => weights[tierPool.indexOf(c)]!
        : (c) => (c.weight ?? 1) * bishopWeight(state, 'speakers', c.speaker),
      rng,
    );
  }
  return {
    ...state,
    current: selected,
    ...(state.bishop && bishopConfig.relics.cards.includes(selected.id)
      ? { bishop: { ...state.bishop, lastRelicYear: state.year } }
      : {}),
    drawn:
      selected.kind === 'daily'
        ? [...new Set([...state.drawn, selected.id])]
        : state.drawn,
    appearanceYears:
      (selected.kind === 'special' && selected.period) ||
      selected.kind === 'speaki'
        ? {
            ...state.appearanceYears,
            [selected.id]: [
              ...(state.appearanceYears[selected.id] ?? []),
              state.year,
            ],
          }
        : state.appearanceYears,
    npcYears:
      selected.kind !== 'speaki' && selected.npc
        ? { ...state.npcYears, [selected.npc]: state.year }
        : state.npcYears,
    seen:
      (selected.kind === 'special' && !selected.repeatable) ||
      selected.kind === 'speaki'
        ? [...state.seen, selected.id]
        : state.seen,
    recent: [...state.recent, selected.id].slice(-RECENT_LIMIT),
  };
}

export function canRerollDaily(state: State, cards: Card[]): boolean {
  return (
    !!state.boons.alice &&
    (state.current?.kind === 'daily' || state.current?.kind === 'speaki') &&
    !state.sleep &&
    !state.scene &&
    !state.ending &&
    cards.some(
      (c) =>
        c.kind === 'daily' &&
        c.id !== state.current!.id &&
        eligible(c, state) &&
        (!state.boss ||
          (c.boss === state.current?.boss && c.bossPhase === state.current?.bossPhase && !state.boss.drawn.includes(c.id))),
    )
  );
}

export function rerollDaily(state: State, cards: Card[], rng: RNG): State {
  if (!canRerollDaily(state, cards)) return state;
  const pool = state.boss
    ? cards
    : cards.filter(
        (c) =>
          c.kind === 'daily' &&
          c.id !== state.current!.id &&
          eligible(c, state),
      );
  if (!pool.length) return state;
  const boons = { ...state.boons };
  delete boons.alice;
  return recordSnapshot(
    nextDocument(
      {
        ...state,
        current: null,
        currentImmediate: undefined,
        scoped: undefined,
        boons,
        stitched: false,
      },
      pool,
      rng,
    ),
  );
}
