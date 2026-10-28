export const BANDAGE_AMOUNT = 30;
// two Z (drowsy: the preview shows '?' instead of the pips) wear off after 3
export const AXE_DECAY_BY_STACK = { 1: 10, 2: 3 } as const;
export function decayFor(stack: 0 | 1 | 2): number {
  return stack === 0 ? 0 : AXE_DECAY_BY_STACK[stack];
}
export const REWIND_YEARS = 5;
export const SLEEP_TURNS = 3;
export const BULLET_CHARGES = 2;
export const END_YEAR = 200;
export const RECENT_LIMIT = 10;
export const DANGER_LOW = 20;
export const DANGER_HIGH = 80;
export const GAUGE_KEYS = ['sugar', 'people', 'faith', 'erpin'] as const;

export const SPEAKI_CHANCE = 0.08;
export const SPEAKI_GAP = 25;
export const SPECIAL_CHANCE = 0.12;
// Story modes: one multiplier per 50-year era, rising to x1.5 (the glow tiers
// follow the eras). The rhythm of each era comes from TENSION_CURVE below.
export const ERA_SCALE: [number, number][] = [
  [0, 1],
  [49, 1],
  [50, 1.2],
  [99, 1.2],
  [100, 1.35],
  [149, 1.35],
  [150, 1.5],
  [200, 1.5],
];
// Wave-shaped: a bump at each turn of the story, crises around 124 and 166,
// a breather after the avalanche (176) and one last climb before the rebellion.
// Lowered by 3 from 104 on (2026-10-27) to bring the clear rates back to the
// targets (apprentice 60–70%, priest 30–40%) after the spirits got harder.
// The last climb (190–200) was raised by 6 when the boss month got its
// kick-out, so the danger moves from the boss to the road leading to it.
export const TENSION_CURVE: [number, number][] = [
  [0, 14],
  [12, 22],
  [22, 30],
  [32, 26],
  [50, 40],
  [60, 32],
  [67, 40],
  [72, 30],
  [80, 37],
  [90, 41],
  [104, 44],
  [120, 42],
  [130, 38],
  [146, 48],
  [156, 40],
  [190, 52],
  [200, 52],
];
export const DIRECTOR_K = 0.03;
export const DIRECTOR_CLAMP = 18;
export const PHASES = [
  // no tier-3 documents in the first 30 years
  { until: 30, weights: { 1: 65, 2: 35, 3: 0 } },
  { until: 50, weights: { 1: 60, 2: 30, 3: 10 } },
  { until: 100, weights: { 1: 25, 2: 47, 3: 28 } },
  { until: 150, weights: { 1: 18, 2: 47, 3: 35 } },
  { until: Infinity, weights: { 1: 12, 2: 40, 3: 48 } },
];

export const NPC_GAP = 8;
export const GROUP_GAP = 15;
export const NPC_SAME_GAP = 20;

export const STATUS_LIMIT = 2;
// No new lingering gauge effect starts in these years before the witches'
// practicum, and the practicum waits until the last one has run out, so
// Pikora's drift never lands on top of another effect.
export const PRACTICUM_QUIET_YEARS = 10;
export const STATUS_CAN_KILL = false;

export const APPRENTICE_PHASES = [
  { until: 30, weights: { 1: 70, 2: 30, 3: 0 } },
  { until: 50, weights: { 1: 65, 2: 30, 3: 5 } },
  { until: 100, weights: { 1: 35, 2: 45, 3: 20 } },
  { until: 150, weights: { 1: 25, 2: 48, 3: 27 } },
  { until: Infinity, weights: { 1: 18, 2: 45, 3: 37 } },
];
export const APPRENTICE_ERA_FACTOR = 0.6;
export const APPRENTICE_TENSION_DELTA = -3;
export const APPRENTICE_SPIRITS = 1;
export const APPRENTICE_ELVES = 1;

export const SCOPE_HARM = 0.25;
export const SCOPE_HELP = 2;
