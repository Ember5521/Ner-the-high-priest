// shortcut: the simulator holds refund coupons without using them; add a policy when comparing coupon balance.
import { bishopConfig, deckForMode } from '../src/core/bishop';
import { pathToFileURL } from 'node:url';
import raw from '../data/cards/m1.json';
import { GAUGE_KEYS } from '../src/core/config';
import { nextDocument } from '../src/core/deck';
import { tension } from '../src/core/director';
import {
  canRewind,
  choiceEffects,
  processDocument,
  rewind,
} from '../src/core/loop';
import {
  boundary,
  initialState,
  type Action,
  type Card,
  type RNG,
  type State,
} from '../src/core/state';

export const policies = ['random', 'balanced', 'careful'] as const;
export type Policy = (typeof policies)[number];

export function mulberry32(seed: number): RNG {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Could the player have survived the document that ended the run? Unavoidable
 * means both stamps would break a gauge and neither axe nor bullet was usable.
 */
export function classifyDeath(
  state: State,
): 'avoidable' | 'unavoidable' | 'asleep' {
  if (state.sleep > 0) return 'asleep';
  const card = state.current;
  if (
    !card ||
    (card.axe !== false &&
      card.axe !== 'bullet' &&
      !state.statuses.some((s) => s.axeLock)) ||
    (card.axe !== false && (state.boons.bullet ?? 0) > 0)
  )
    return 'avoidable';
  const lethal = (side: 'reject' | 'approve') => {
    if (card.axe === 'free') return false;
    const g = { ...state.gauges };
    for (const [k, d] of Object.entries(
      choiceEffects(
        card[side],
        state.gauges,
        card.kind,
        state.year,
        state.statuses,
        state,
        card,
      ),
    ))
      g[k as keyof typeof g] = Math.max(
        0,
        Math.min(100, g[k as keyof typeof g] + (d ?? 0)),
      );
    return boundary(g) !== undefined;
  };
  return lethal('reject') && lethal('approve') ? 'unavoidable' : 'avoidable';
}

export function playerAction(state: State, policy: Policy, rng: RNG): Action {
  // The engine supplies the random stamp while asleep.
  if (state.sleep && !state.current?.blessings) return 'reject';
  if (policy === 'random') return rng() < 0.5 ? 'reject' : 'approve';
  const card = state.current!;
  const preview = (choice: 'reject' | 'approve') => {
    const effects = choiceEffects(
      card[choice],
      state.gauges,
      card.kind,
      state.year,
      state.statuses,
      state,
      card,
    );
    const gauges = { ...state.gauges };
    for (const key of GAUGE_KEYS)
      gauges[key] = Math.max(
        0,
        Math.min(100, gauges[key] + (effects[key] ?? 0)),
      );
    return gauges;
  };
  const reject = preview('reject');
  const approve = preview('approve');
  const score = (gauges: State['gauges']) =>
    GAUGE_KEYS.reduce((sum, key) => sum + (gauges[key] - 50) ** 2, 0);
  const choice = score(reject) <= score(approve) ? 'reject' : 'approve';
  if (boundary(choice === 'reject' ? reject : approve) && card.axe !== false) {
    const bulletUsable = (state.boons.bullet ?? 0) > 0;
    if (card.axe === 'bullet' && bulletUsable) return 'bullet';
    if (policy === 'careful') {
      if (
        card.axe !== 'bullet' &&
        state.drowse.stack < 2 &&
        !state.statuses.some((s) => s.axeLock)
      )
        return 'axe';
      if (bulletUsable) return 'bullet';
    }
  }
  return choice;
}

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const index = (sorted.length - 1) * q;
    const low = Math.floor(index);
    return (
      sorted[low]! + (sorted[Math.ceil(index)]! - sorted[low]!) * (index - low)
    );
  };
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    median: at(0.5),
    p10: at(0.1),
    p90: at(0.9),
  };
}

export function simulate(
  policy: Policy,
  runs: number,
  seed: number,
  cards = raw as Card[],
  mode: 'apprentice' | 'priest' = 'priest',
) {
  cards = deckForMode(cards, mode);
  const rng = mulberry32(seed);
  const docs: number[] = [];
  const years: number[] = [];
  const endings: Record<string, number> = {};
  const deaths: Record<string, number> = {};
  // first collapse of each run, including ones Linua's rewind later undid
  const collapses: Record<string, number> = {};
  let cleanTrue = 0;
  // why each game over happened (rewound ones included)
  const deathKinds = { avoidable: 0, unavoidable: 0, asleep: 0 };
  const tensions: Record<string, { total: number; documents: number }> = {};
  let totalDocs = 0;
  let elapsedYears = 0;
  let nearMisses = 0;
  let rewinds = 0;
  let erpinSaves = 0;
  let stitches = 0;
  let successDocs = 0;
  let dailyShown = 0;
  let dailyDistinct = 0;
  let successDailyShown = 0;
  let successDailyDistinct = 0;
  const bin = (year: number) => {
    const start = Math.floor(year / 25) * 25;
    return `${start}-${start + 24}`;
  };
  for (let start = 0; start <= 200; start += 25) {
    deaths[bin(start)] = 0;
    collapses[bin(start)] = 0;
    tensions[bin(start)] = { total: 0, documents: 0 };
  }
  for (let run = 0; run < runs; run++) {
    let state = nextDocument(initialState(mode), cards, rng);
    let documents = 0;
    let dailies = 0;
    const dailyIds = new Set<string>();
    let collapsed = false;
    while (true) {
      if (state.ending) {
        if (!collapsed && state.ending.id !== 'true') {
          collapsed = true;
          collapses[bin(state.year)] = (collapses[bin(state.year)] ?? 0) + 1;
        }
        if (canRewind(state)) {
          state = rewind(state, cards, rng);
          rewinds++;
          continue;
        }
        break;
      }
      if (state.scene) state = { ...state, scene: null };
      if (!state.current) state = nextDocument(state, cards, rng);
      if (++documents > 10000)
        throw new Error('Simulation exceeded 10000 documents in one run');
      if (state.current?.kind === 'daily') {
        dailies++;
        dailyIds.add(state.current.id);
      }
      const beforeYear = state.year;
      const before = state;
      state = processDocument(
        state,
        playerAction(state, policy, rng),
        cards,
        rng,
      );
      elapsedYears += state.year - beforeYear;
      if (!before.erpinSaved && state.erpinSaved) erpinSaves++;
      if (state.stitched) stitches++;
      if (state.ending && state.ending.id !== 'true')
        deathKinds[classifyDeath(before)]++;
      const m = tension(state.gauges);
      if (m >= 35) nearMisses++;
      const bucket = (tensions[bin(state.year)] ??= { total: 0, documents: 0 });
      bucket.total += m;
      bucket.documents++;
    }
    dailyShown += dailies;
    dailyDistinct += dailyIds.size;
    docs.push(documents);
    totalDocs += documents;
    years.push(state.year);
    const ending = state.ending!.id;
    endings[ending] = (endings[ending] ?? 0) + 1;
    if (ending === 'true') {
      successDocs += documents;
      successDailyShown += dailies;
      successDailyDistinct += dailyIds.size;
    }
    if (ending === 'true' && !collapsed) cleanTrue++;
    if (ending !== 'true')
      deaths[bin(state.year)] = (deaths[bin(state.year)] ?? 0) + 1;
  }
  const successes = endings.true ?? 0;
  return {
    policy,
    runs,
    daily: {
      avgShown: dailyShown / runs,
      avgDistinct: dailyDistinct / runs,
      trueAvgShown: successes ? successDailyShown / successes : null,
      trueAvgDistinct: successes ? successDailyDistinct / successes : null,
    },
    docs: summary(docs),
    years: summary(years),
    avgYearsPerDocument: elapsedYears / totalDocs,
    trueEndingPct: (successes / runs) * 100,
    endingPct: Object.fromEntries(
      Object.entries(endings)
        .sort()
        .map(([key, count]) => [key, (count / runs) * 100]),
    ),
    deathYearPct: Object.fromEntries(
      Object.entries(deaths).map(([key, count]) => [key, (count / runs) * 100]),
    ),
    nearMissPct: (nearMisses / totalDocs) * 100,
    averageTensionByYear: Object.fromEntries(
      Object.entries(tensions).map(([key, bucket]) => [
        key,
        bucket.documents ? bucket.total / bucket.documents : null,
      ]),
    ),
    rewinds,
    firstCollapsePct: Object.fromEntries(
      Object.entries(collapses).map(([key, count]) => [
        key,
        (count / runs) * 100,
      ]),
    ),
    trueWithoutRewindPct: (cleanTrue / runs) * 100,
    deathKinds,
    erpinSaves,
    stitches,
    // Includes failed attempts: expected play time to earn one true ending.
    estimatedMinutesPerTrueEnding: successes
      ? (totalDocs * 7) / (60 * successes)
      : null,
    successfulRunMinutes: successes
      ? (successDocs * 7) / (60 * successes)
      : null,
  };
}

export function simulateBishop(
  policy: Policy,
  runs: number,
  seed: number,
  source = raw as Card[],
) {
  const rng = mulberry32(seed);
  const years: number[] = [];
  const endings: Record<string, number> = {};
  let relics = 0;
  let blessings = 0;
  let embraceSaves = 0;
  for (let run = 0; run < runs; run++) {
    const cards = deckForMode(source, 'bishop');
    let state = nextDocument(initialState('bishop', rng), cards, rng);
    let documents = 0;
    while (state.year < 1000) {
      if (state.ending) {
        if (canRewind(state)) {
          state = rewind(state, cards, rng);
          continue;
        }
        break;
      }
      if (++documents > 20000)
        throw new Error('Bishop simulation exceeded 20000 documents');
      state = {
        ...state,
        scene: null,
        asleepPending: false,
        bishop: { ...state.bishop!, notices: [] },
      };
      const before = state;
      state = processDocument(
        state,
        playerAction(state, policy, rng),
        cards,
        rng,
      );
      if (before.bishop!.embrace !== 'used' && state.bishop!.embrace === 'used')
        embraceSaves++;
    }
    years.push(Math.min(1000, state.year));
    const cause = state.ending?.cause ?? state.ending?.id ?? 'cap';
    endings[cause] = (endings[cause] ?? 0) + 1;
    relics += state.seen.filter((id) =>
      bishopConfig.relics.cards.includes(id),
    ).length;
    blessings += state.bishop!.blessings.length;
  }
  const sorted = [...years].sort((a, b) => a - b);
  const quantile = (q: number) => {
    const i = (sorted.length - 1) * q;
    return (
      sorted[Math.floor(i)]! +
      (sorted[Math.ceil(i)]! - sorted[Math.floor(i)]!) * (i - Math.floor(i))
    );
  };
  return {
    mode: 'bishop',
    policy,
    runs,
    years: {
      p10: quantile(0.1),
      p25: quantile(0.25),
      median: quantile(0.5),
      p75: quantile(0.75),
      p90: quantile(0.9),
      max: sorted.at(-1)!,
    },
    reachingPct: Object.fromEntries(
      [100, 150, 200, 300].map((year) => [
        year,
        (years.filter((value) => value >= year).length / runs) * 100,
      ]),
    ),
    endingPct: Object.fromEntries(
      Object.entries(endings)
        .sort()
        .map(([id, count]) => [id, (count / runs) * 100]),
    ),
    relicsPerRun: relics / runs,
    blessingsPerRun: blessings / runs,
    embraceSavesPerRun: embraceSaves / runs,
  };
}

export function parseArgs(args: string[]) {
  let mode: 'apprentice' | 'priest' | 'bishop' | undefined;
  let n = 2000;
  let seed = Math.floor(Math.random() * 4294967296);
  let policy: Policy | 'all' = 'all';
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i];
    const value = args[i + 1];
    if (
      option === '--mode' &&
      (value === 'apprentice' || value === 'priest' || value === 'bishop')
    )
      mode = value;
    else if (
      option === '--n' &&
      value &&
      /^\d+$/.test(value) &&
      Number.isSafeInteger(+value) &&
      +value > 0
    )
      n = +value;
    else if (
      option === '--seed' &&
      value &&
      /^-?\d+$/.test(value) &&
      Number.isSafeInteger(+value)
    )
      seed = +value;
    else if (
      option === '--policy' &&
      value &&
      [...policies, 'all'].includes(value as Policy)
    )
      policy = value as Policy | 'all';
    else
      throw new Error(
        'Usage: npm run sim -- --n <positive integer> --seed <integer> --policy <random|balanced|careful|all> [--mode <apprentice|priest|bishop>]',
      );
  }
  return { n, seed, policy, ...(mode ? { mode } : {}) };
}

export function main(args: string[]) {
  const { n, seed, policy, mode } = parseArgs(args);
  if (mode === 'bishop') {
    const results = (policy === 'all' ? policies : [policy]).map((p) =>
      simulateBishop(p, n, seed),
    );
    console.log(JSON.stringify({ seed, results }));
    return;
  }
  const results = (policy === 'all' ? policies : [policy]).map((p) =>
    simulate(p, n, seed, raw as Card[], mode),
  );
  const number = (value: number | null) =>
    value === null ? 'n/a' : value.toFixed(2);
  console.log(
    `Seed: ${seed}; 7 seconds/document. Death bins use final deaths; tension bins use post-document year.`,
  );
  console.table(
    results.map((r) => ({
      policy: r.policy,
      runs: r.runs,
      'daily avg': number(r.daily.avgShown),
      'distinct daily avg': number(r.daily.avgDistinct),
      'true daily avg': number(r.daily.trueAvgShown),
      'true distinct daily avg': number(r.daily.trueAvgDistinct),
      'docs avg': number(r.docs.avg),
      'docs median': number(r.docs.median),
      'docs p10': number(r.docs.p10),
      'docs p90': number(r.docs.p90),
      'years avg': number(r.years.avg),
      'years median': number(r.years.median),
      'years/doc': number(r.avgYearsPerDocument),
      'true %': number(r.trueEndingPct),
      'near-miss %': number(r.nearMissPct),
      rewinds: r.rewinds,
      stitches: r.stitches,
      'min/true (incl failures)': number(r.estimatedMinutesPerTrueEnding),
      'min/successful run': number(r.successfulRunMinutes),
    })),
  );
  for (const r of results) {
    console.log(`${r.policy}: ending distribution (%)`);
    console.table(r.endingPct);
    console.log(
      `${r.policy}: death-year share of runs (%) and average tension`,
    );
    console.table(
      Object.keys(r.averageTensionByYear).map((bin) => ({
        bin,
        'death %': number(r.deathYearPct[bin] ?? 0),
        'avg tension': number(r.averageTensionByYear[bin]!),
      })),
    );
  }
  console.log(JSON.stringify({ seed, results }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
