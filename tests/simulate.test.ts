import { AXE_DECAY_BY_STACK } from '../src/core/config';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import * as loop from '../src/core/loop';
import { initialState, type Card } from '../src/core/state';
import {
  classifyDeath,
  parseArgs,
  playerAction,
  simulate,
} from '../tools/simulate';

const daily: Card = {
  id: 'test',
  kind: 'daily',
  tier: 1,
  years: 1,
  axe: true,
  speaker: 'test',
  faction: 'test',
  title: 'Test',
  text: 'Test',
  reject: { label: 'Reject', effects: { sugar: -100 } },
  approve: { label: 'Approve', effects: { sugar: 100 } },
};

describe('simulator', () => {
  it('bins death at the fatal document year rather than its advanced year', () => {
    const source: Card = {
      ...daily,
      id: 'source',
      kind: 'story',
      years: 197,
      axe: false,
      trigger: { year: 0, order: 0 },
      reject: { label: 'x', effects: {} },
      approve: { label: 'x', effects: {} },
    };
    const report = simulate('balanced', 1, 1, [source, { ...daily, years: 3 }]);
    expect(report.trueEndingPct).toBe(0);
    expect(report.deathYearPct['175-199']).toBe(100);
  });

  it('keeps death classification based on the original choices', () => {
    const state = { ...initialState(), current: daily };
    expect(classifyDeath(state)).toBe('avoidable');
    expect(classifyDeath({ ...state, current: { ...daily, axe: false } })).toBe(
      'unavoidable',
    );
    expect(classifyDeath({ ...state, sleep: 1 })).toBe('asleep');
    expect(
      classifyDeath({ ...state, current: { ...daily, axe: 'free' } }),
    ).toBe('avoidable');
  });

  it('uses visible forged previews, saves a lethal choice only with an available counted axe, and defers sleep randomness', () => {
    const state = { ...initialState(), current: daily };
    expect(playerAction(state, 'balanced', () => 0)).toBe('reject');
    expect(playerAction(state, 'careful', () => 0)).toBe('axe');
    expect(
      playerAction(
        { ...state, drowse: { stack: 2, left: AXE_DECAY_BY_STACK[2] } },
        'careful',
        () => 0,
      ),
    ).toBe('reject');
    expect(
      playerAction(
        { ...state, current: { ...daily, axe: false } },
        'careful',
        () => 0,
      ),
    ).toBe('reject');
    const forged = {
      ...daily,
      axe: 'free' as const,
      reject: { label: 'Reject', effects: { sugar: 20 } },
    };
    expect(
      playerAction({ ...state, current: forged }, 'balanced', () => 0),
    ).toBe('reject');
    expect(
      playerAction({ ...state, sleep: 1 }, 'random', () => {
        throw new Error('Engine must roll');
      }),
    ).toBe('reject');
  });

  it('counts rewind, scenes, final deaths and post-document near misses', () => {
    const source: Card = {
      ...daily,
      id: 'source',
      kind: 'story',
      tier: undefined,
      years: 0,
      axe: false,
      trigger: { year: 0, order: 0 },
      reject: { label: 'Reject', effects: {}, grant: { boon: 'rewind' } },
    };
    const fatal = {
      ...daily,
      years: 10,
      axe: 'free' as const,
      missed: { scene: 'speakiFooled' as const },
    };
    const bossCards: Card[] = Array.from({ length: 10 }, (_, i) => ({
      ...fatal,
      id: `boss-${i}`,
      kind: 'fixed',
      years: 1,
      boss: i < 2 ? 'cleanup' : 'unrest',
      ...(i >= 2 ? { bossPhase: i < 4 ? 'early' as const : 'late' as const } : {}),
    }));
    const result = simulate('balanced', 1, 1, [source, fatal, ...bossCards]);
    expect(result.trueEndingPct).toBe(100);
    expect(result.daily).toEqual({
      avgShown: result.docs.avg - 11,
      avgDistinct: 1,
      trueAvgShown: result.docs.avg - 11,
      trueAvgDistinct: 1,
    });
    expect(result.nearMissPct).toBe(0);
    const death = simulate('balanced', 1, 1, [source, { ...daily, years: 10 }]);
    expect(death.rewinds).toBe(1);
    expect(death.docs.avg).toBe(3);
    expect(death.daily).toEqual({
      avgShown: 2,
      avgDistinct: 1,
      trueAvgShown: null,
      trueAvgDistinct: null,
    });
    expect(death.nearMissPct).toBeCloseTo(200 / 3);
    expect(death.deathYearPct['0-24']).toBe(100);
    expect(death.estimatedMinutesPerTrueEnding).toBeNull();
  });

  it('excludes successful rewound runs from the final death histogram', () => {
    const source: Card = {
      ...daily,
      id: 'source',
      kind: 'story',
      years: 0,
      axe: false,
      trigger: { year: 0, order: 0 },
      reject: { label: 'Reject', effects: {}, grant: { boon: 'rewind' } },
    };
    const restored = vi.spyOn(loop, 'rewind').mockReturnValueOnce({
      ...initialState(),
      year: 200,
      ending: { id: 'true' },
    });
    try {
      const report = simulate('balanced', 1, 1, [source, daily]);
      expect(report.rewinds).toBe(1);
      expect(report.trueEndingPct).toBe(100);
      expect(
        Object.values(report.deathYearPct).every((value) => value === 0),
      ).toBe(true);
    } finally {
      restored.mockRestore();
    }
  });

  it('reports one stitch per consumed boon', () => {
    const source: Card = {
      ...daily,
      id: 'stitch-source',
      kind: 'story',
      axe: false,
      years: 0,
      trigger: { year: 0, order: 0 },
      reject: { label: 'Reject', effects: {}, grant: { boon: 'stitch' } },
      approve: { label: 'Approve', effects: {}, grant: { boon: 'stitch' } },
    };
    const report = simulate('balanced', 2, 1, [source, daily]);
    expect(report.stitches).toBe(report.runs);
    expect(report.docs.avg).toBe(3);
  });

  it('rejects invalid CLI values', () => {
    expect(
      parseArgs(['--n', '3', '--seed', '-1', '--policy', 'careful']),
    ).toEqual({ n: 3, seed: -1, policy: 'careful' });
    for (const args of [
      ['--n', '0'],
      ['--seed', '1.2'],
      ['--policy', 'unknown'],
      ['--wat', '3'],
      ['--n'],
    ])
      expect(() => parseArgs(args)).toThrow('Usage:');
  });

  it('runs the bundled CLI for a few seeded games deterministically', () => {
    const outfile = resolve('.cache/simulate-smoke.mjs');
    buildSync({
      entryPoints: ['tools/simulate.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    const run = () =>
      execFileSync(
        process.execPath,
        [outfile, '--n', '3', '--seed', '1', '--policy', 'all'],
        { encoding: 'utf8' },
      );
    const first = run();
    expect(run()).toBe(first);
    const result = JSON.parse(first.trim().split('\n').at(-1)!);
    expect(result.seed).toBe(1);
    expect(
      result.results.map((r: { policy: string; runs: number }) => [
        r.policy,
        r.runs,
      ]),
    ).toEqual([
      ['random', 3],
      ['balanced', 3],
      ['careful', 3],
    ]);
    for (const report of result.results) {
      expect(report.docs.avg).toBeGreaterThan(0);
      expect(
        Object.values(report.endingPct).reduce(
          (sum: number, pct) => sum + Number(pct),
          0,
        ),
      ).toBeCloseTo(100);
    }
    const bishop = () =>
      execFileSync(
        process.execPath,
        [
          outfile,
          '--mode',
          'bishop',
          '--n',
          '3',
          '--seed',
          '2026',
          '--policy',
          'careful',
        ],
        { encoding: 'utf8' },
      );
    const bishopOutput = bishop();
    expect(bishop()).toBe(bishopOutput);
    expect(JSON.parse(bishopOutput).results[0]).toMatchObject({
      mode: 'bishop',
      runs: 3,
      policy: 'careful',
    });
    // bundles and runs the CLI twice: slow under a parallel full run
  }, 30000);
});
