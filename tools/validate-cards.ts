import system from '../data/system.json';
import art from '../data/art.json';
import { GAUGE_KEYS } from '../src/core/config';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');
export function validateCards(
  input: unknown,
  speakers: Record<string, unknown> = system.speakers,
  portraits: Record<string, unknown> = art.portraits,
  endings: Record<string, unknown> = art.endings,
): string[] {
  const errors: string[] = [];
  if (
    !object(system.scenes.asleep) ||
    typeof system.scenes.asleep.art !== 'string' ||
    !Object.hasOwn(art.ui, system.scenes.asleep.art)
  )
    errors.push(
      'scenes.asleep must exist and reference an existing ui art key',
    );
  for (const id of new Set([
    'true',
    'purist',
    'reformed',
    ...Object.keys(system.gameOvers),
    'sleep',
  ])) {
    if (!Object.hasOwn(endings, id))
      errors.push(`ending ${id}: missing art slot`);
  }
  for (const [id, slot] of Object.entries(endings))
    if (slot !== null && typeof slot !== 'string')
      errors.push(`ending ${id}: art must be a string or null`);
  if (
    typeof system.rewindPrompt.art !== 'string' ||
    !Object.hasOwn(art.ui, system.rewindPrompt.art)
  )
    errors.push('rewindPrompt.art must reference an existing ui art key');
  for (const [key, speaker] of Object.entries(speakers))
    if (
      object(speaker) &&
      'portrait' in speaker &&
      (typeof speaker.portrait !== 'string' ||
        !Object.hasOwn(portraits, speaker.portrait))
    )
      errors.push(`speaker ${key}: unknown portrait group`);
  for (const [key, slot] of Object.entries(portraits))
    if (Array.isArray(slot) && !strings(slot))
      errors.push(`portrait ${key}: array entries must be strings`);
  if (!Array.isArray(input) || !input.length)
    return ['cards must be a nonempty array'];
  const ids = new Set<string>();
  const bossSlots = new Set<number>();
  const variants = new Map<
    string,
    {
      kinds: Set<'daily' | 'mandatory'>;
      pools: Map<number, { speakers: Set<string>; tiers: number[] }>;
    }
  >();
  input.forEach((value: unknown, i) => {
    const fail = (message: string) => errors.push(`[${i}] ${message}`);
    if (!object(value)) {
      fail('card must be an object');
      return;
    }
    const c = value;
    const mimic = c.kind === 'speaki' && 'mimic' in c;
    if (
      'mimic' in c &&
      (c.kind !== 'speaki' ||
        typeof c.mimic !== 'string' ||
        !input.some(
          (target) =>
            object(target) && target.kind === 'daily' && target.id === c.mimic,
        ))
    )
      fail('mimic must reference an existing daily card on speaki cards only');
    if (mimic)
      for (const key of ['speaker', 'faction', 'title', 'reject', 'approve'])
        if (key in c) fail(`mimic cards must not define ${key}`);
    if (c.kind === 'speaki' && c.axe !== 'free')
      fail('speaki cards must have free axe');
    if ('nerLine' in c) fail('nerLine is no longer used');
    for (const key of mimic
      ? ['id', 'text']
      : ['id', 'speaker', 'faction', 'title', 'text'])
      if (typeof c[key] !== 'string' || !c[key])
        fail(`${key} must be a nonempty string`);
    if (typeof c.id === 'string') {
      if (ids.has(c.id)) fail('duplicate id');
      ids.add(c.id);
    }
    if (
      !['story', 'fixed', 'daily', 'special', 'speaki'].includes(String(c.kind))
    )
      fail('invalid kind');
    if (
      'look' in c &&
      (!['story', 'fixed'].includes(String(c.kind)) ||
        !['special', 'quest', 'hard'].includes(String(c.look)))
    )
      fail('look must be special, quest or hard on story/fixed cards');
    if (
      c.pool !== undefined &&
      (!object(c.pool) ||
        typeof c.pool.group !== 'string' ||
        !c.pool.group ||
        typeof c.pool.member !== 'string' ||
        !c.pool.member)
    )
      fail('invalid pool');
    if (c.safe !== undefined && c.safe !== true) fail('invalid safe');
    if (c.boss !== undefined && !['cleanup', 'unrest'].includes(String(c.boss)))
      fail('invalid boss');
    if (c.bossPhase !== undefined && (c.boss !== 'unrest' || c.bossAt !== undefined || !['early', 'late'].includes(String(c.bossPhase))))
      fail('invalid bossPhase');
    if (
      c.bossAfter !== undefined &&
      (c.kind !== 'story' ||
        !Number.isInteger(c.bossAfter) ||
        Number(c.bossAfter) < 1 ||
        Number(c.bossAfter) > 10)
    )
      fail('invalid bossAfter');
    if (c.bossAt !== undefined) {
      if (!c.boss || !Number.isInteger(c.bossAt) || Number(c.bossAt) < 1 || Number(c.bossAt) > 10)
        fail('invalid bossAt');
      else if (bossSlots.has(Number(c.bossAt))) fail('duplicate bossAt');
      else bossSlots.add(Number(c.bossAt));
    }
    if (
      c.status !== undefined &&
      (c.kind !== 'story' && !c.boss ||
        !object(c.status) ||
        typeof c.status.id !== 'string' ||
        !Object.hasOwn(system.statuses, c.status.id) ||
        (c.status.floor !== undefined && (typeof c.status.floor !== 'number' || !Number.isFinite(c.status.floor))) ||
        !object(c.status.tick) ||
        !Object.keys(c.status.tick).length ||
        Object.entries(c.status.tick).some(
          ([g, v]) =>
            !(GAUGE_KEYS as readonly string[]).includes(g) ||
            !Number.isInteger(v),
        ))
    )
      fail('invalid story status');
    for (const key of ['speaker', 'realSpeaker'])
      if (
        ((key === 'speaker' && !mimic) || c[key] !== undefined) &&
        !Object.hasOwn(speakers, String(c[key]))
      )
        fail(`unknown ${key}`);
    if (![true, false, 'free', 'bullet'].includes(c.axe as boolean))
      fail('invalid axe');
    if ('special' in c) fail('special field is no longer supported');
    const mandatory = c.kind === 'story' || c.kind === 'fixed';
    if ('variant' in c) {
      const v = c.variant;
      if (
        (!mandatory && c.kind !== 'daily') ||
        !object(v) ||
        typeof v.group !== 'string' ||
        !v.group.trim() ||
        !Number.isInteger(v.pool) ||
        Number(v.pool) <= 0
      )
        fail(
          'variant requires a nonempty group and positive integer pool on story/fixed/daily cards',
        );
      else {
        if (!variants.has(v.group))
          variants.set(v.group, { kinds: new Set(), pools: new Map() });
        const group = variants.get(v.group)!;
        group.kinds.add(c.kind === 'daily' ? 'daily' : 'mandatory');
        if (!group.pools.has(Number(v.pool)))
          group.pools.set(Number(v.pool), {
            speakers: new Set(),
            tiers: [0, 0, 0],
          });
        const pool = group.pools.get(Number(v.pool))!;
        pool.speakers.add(String(c.speaker));
        if (c.kind === 'daily' && [1, 2, 3].includes(c.tier as number))
          pool.tiers[Number(c.tier) - 1]!++;
      }
    }
    if ('stamps' in c) {
      if (
        c.stamps !== 'direction' &&
        c.stamps !== 'light' &&
        c.stamps !== 'meet'
      )
        fail('stamps must be direction, light or meet');
      if (!mandatory) fail('stamps is only allowed on story/fixed cards');
      if (!object(c.reject) || !object(c.approve))
        fail('stamps requires both reject and approve');
    }
    if (c.kind === 'story' && c.axe !== false)
      fail('story cards must forbid axe');
    if (
      c.kind === 'fixed' &&
      c.axe !== false &&
      c.axe !== true &&
      c.axe !== 'bullet'
    )
      fail('fixed cards must forbid axe, count axe or require bullet');
    if (c.axe === 'bullet' && c.kind !== 'fixed')
      fail('bullet axe is only allowed on fixed cards');
    if (c.kind === 'daily') {
      if (![1, 2, 3].includes(c.tier as number))
        fail('daily tier must be 1, 2 or 3');
    } else if ('tier' in c) fail('tier is only allowed on daily cards');
    if (
      'repeatable' in c &&
      (c.kind !== 'special' || typeof c.repeatable !== 'boolean')
    )
      fail('repeatable must be a boolean on special cards');
    if (
      'period' in c &&
      (c.kind !== 'special' ||
        !Number.isInteger(c.period) ||
        Number(c.period) <= 0)
    )
      fail('period must be a positive integer on special cards');
    if ('npc' in c && (c.kind !== 'special' || typeof c.npc !== 'string'))
      fail('npc must be a string on special cards');
    if (!mandatory && 'trigger' in c)
      fail('trigger is only allowed on story/fixed cards');
    // A story card may leave the year unchanged so the next one follows the same year.
    if (
      !mimic &&
      (!Number.isInteger(c.years) ||
        Number(c.years) <
          (c.kind === 'story' || (object(c.trigger) && c.trigger.scheduled)
            ? 0
            : 1))
    )
      fail('years must be a positive integer (0 allowed for story cards)');
    if (
      c.weight !== undefined &&
      (typeof c.weight !== 'number' ||
        !Number.isFinite(c.weight) ||
        c.weight <= 0)
    )
      fail('invalid weight');
    if (
      mandatory &&
      (!object(c.trigger) ||
        !(
          (c.trigger.onCondition === true &&
            ['year', 'from', 'to', 'after', 'years', 'scheduled'].every(
              (key) => !(key in (c.trigger as Obj)),
            )) ||
          (Number.isInteger(c.trigger.from) &&
            Number(c.trigger.from) >= 0 &&
            Number.isInteger(c.trigger.to) &&
            Number(c.trigger.to) >= Number(c.trigger.from) &&
            !('year' in c.trigger) &&
            !('after' in c.trigger) &&
            !('years' in c.trigger) &&
            !('scheduled' in c.trigger)) ||
          (Number.isInteger(c.trigger.year) &&
            Number(c.trigger.year) >= 0 &&
            !('from' in c.trigger) &&
            !('to' in c.trigger) &&
            !('scheduled' in c.trigger) &&
            !('after' in c.trigger) &&
            !('years' in c.trigger)) ||
          (typeof c.trigger.after === 'string' &&
            !('from' in c.trigger) &&
            !('to' in c.trigger) &&
            c.trigger.after.length > 0 &&
            Number.isInteger(c.trigger.years) &&
            Number(c.trigger.years) >= 0 &&
            !('scheduled' in c.trigger) &&
            !('year' in c.trigger)) ||
          (c.trigger.scheduled === true &&
            !('from' in c.trigger) &&
            !('to' in c.trigger) &&
            !('year' in c.trigger) &&
            !('after' in c.trigger) &&
            !('years' in c.trigger))
        ) ||
        !Number.isInteger(c.trigger.order) ||
        Number(c.trigger.order) < 0)
    )
      fail('invalid story/fixed trigger');
    if (
      object(c.trigger) &&
      'onCondition' in c.trigger &&
      (c.trigger.onCondition !== true ||
        c.kind !== 'fixed' ||
        !object(c.conditions) ||
        !object(c.conditions.gauges) ||
        !Object.keys(c.conditions.gauges).length ||
        ['year', 'from', 'to', 'after', 'years', 'scheduled'].some(
          (key) => key in (c.trigger as Obj),
        ))
    )
      fail('onCondition requires fixed kind and conditions.gauges only');
    if (c.conditions !== undefined) {
      if (!object(c.conditions)) fail('invalid conditions');
      else
        for (const [key, value] of Object.entries(c.conditions)) {
          if (key === 'flagsAll' || key === 'flagsNone' || key === 'boonsNone') {
            if (!strings(value)) fail('invalid condition flags');
          } else if (key === 'minYear' || key === 'maxYear') {
            if (!Number.isInteger(value) || Number(value) < 0)
              fail(`invalid condition ${key}`);
            if (
              key === 'maxYear' &&
              c.conditions.minYear !== undefined &&
              Number(c.conditions.minYear) > Number(value)
            )
              fail('condition minYear must not exceed maxYear');
          } else if (key === 'gauges') {
            if (
              !object(value) ||
              Object.entries(value).some(
                ([g, r]) =>
                  !(GAUGE_KEYS as readonly string[]).includes(g) ||
                  !object(r) ||
                  Object.entries(r).some(
                    ([bound, n]) =>
                      !['min', 'max'].includes(bound) ||
                      !Number.isInteger(n) ||
                      Number(n) < 0 ||
                      Number(n) > 100,
                  ) ||
                  (r.min !== undefined &&
                    r.max !== undefined &&
                    Number(r.min) > Number(r.max)),
              )
            )
              fail('invalid condition gauges');
          } else fail('invalid condition flags');
        }
    }
    for (const side of mimic ? [] : ['reject', 'approve']) {
      const r = c[side];
      if (!object(r)) {
        fail(`missing ${side}`);
        continue;
      }
      if (typeof r.label !== 'string' || !r.label)
        fail(`invalid ${side} label`);
      if (!object(r.effects)) fail(`missing ${side} effects`);
      else {
        if (c.kind === 'story' && Object.keys(r.effects).length)
          fail('story effects must be empty');
        for (const [key, delta] of Object.entries(r.effects)) {
          if (!(GAUGE_KEYS as readonly string[]).includes(key))
            fail(`unknown gauge ${key}`);
          if (
            typeof delta !== 'number' ||
            (![-20, -15, -10, -5, 5, 10, 15, 20].includes(delta) &&
              !(
                (r.adjust !== undefined || c.look === 'special') &&
                Math.abs(delta) === 25
              ))
          )
            fail(`invalid delta ${delta}`);
        }
      }
      if ('status' in r) {
        if (c.kind === 'story') fail('story status is not allowed');
        const status = r.status;
        const gauge = (v: unknown) =>
          (GAUGE_KEYS as readonly unknown[]).includes(v);
        if (!object(status)) fail('status must be an object');
        else {
          if (
            typeof status.id !== 'string' ||
            !Object.hasOwn(system.statuses, status.id)
          )
            fail('invalid status id');
          if (
            !Number.isInteger(status.turns) ||
            Number(status.turns) < 1 ||
            Number(status.turns) > 12
          )
            fail('status turns must be 1..12');
          for (const key of ['tick', 'delayed'])
            if (key in status) {
              const values = status[key];
              const unit = key === 'tick' ? 1 : 5;
              if (
                !object(values) ||
                !Object.keys(values).length ||
                Object.entries(values).some(
                  ([g, v]) =>
                    !gauge(g) ||
                    !Number.isInteger(v) ||
                    Math.abs(Number(v)) < unit ||
                    Math.abs(Number(v)) > unit * 5 ||
                    Number(v) % unit !== 0,
                )
              )
                fail(`invalid status ${key}`);
            }
          if (
            'scale' in status &&
            (!object(status.scale) ||
              !gauge(status.scale.gauge) ||
              ![0.5, 1.5].includes(Number(status.scale.factor)) ||
              typeof status.scale.factor !== 'number')
          )
            fail('invalid status scale');
          if (status.floor !== undefined && (typeof status.floor !== 'number' || !Number.isFinite(status.floor))) fail('invalid status floor');
          if ('freeze' in status && !gauge(status.freeze))
            fail('invalid status freeze');
          for (const key of ['axeLock', 'drowseReset'])
            if (key in status && status[key] !== true)
              fail(`invalid status ${key}`);
          if (
            !['tick', 'delayed', 'scale', 'freeze', 'axeLock'].some(
              (key) => key in status,
            )
          )
            fail('status needs an effect');
        }
      }
      if ('drowse' in r) {
        if (
          !Number.isInteger(r.drowse) ||
          Number(r.drowse) < 1 ||
          Number(r.drowse) > 3
        )
          fail('drowse must be an integer from 1 to 3');
        if (!['fixed', 'daily', 'special'].includes(String(c.kind)))
          fail('drowse is only allowed on fixed/daily/special cards');
      }
      if ('schedule' in r) {
        if (!object(r.schedule)) fail('schedule must be an object');
        else {
          if (
            typeof r.schedule.card !== 'string' ||
            !input.some(
              (target) =>
                object(target) &&
                target.id === (r.schedule as Obj).card &&
                (target.kind === 'story' || target.kind === 'fixed') &&
                object(target.trigger) &&
                target.trigger.scheduled === true,
            )
          )
            fail('schedule.card must reference a scheduled-trigger card');
          if (
            !Number.isInteger(r.schedule.years) ||
            Number(r.schedule.years) < 0
          )
            fail('schedule.years must be a nonnegative integer');
        }
      }
      if (
        r.grant !== undefined &&
        (!object(r.grant) ||
          typeof r.grant.boon !== 'string' ||
          !Object.hasOwn(system.boons, r.grant.boon))
      )
        fail('invalid grant boon');
      else if (
        object(r.grant) &&
        ('years' in r.grant ||
          (['hyean', 'intuition', 'scope'].includes(String(r.grant.boon))
            ? !Number.isInteger(r.grant.uses) || Number(r.grant.uses) <= 0
            : ['blindfold'].includes(String(r.grant.boon))
              ? r.grant.uses !== undefined &&
                (!Number.isInteger(r.grant.uses) || Number(r.grant.uses) <= 0)
              : 'uses' in r.grant))
      )
        fail('grant uses must be a positive integer for hyean, intuition or scope');
      if (
        r.adjust !== undefined &&
        (!Number.isInteger(r.adjust) || Number(r.adjust) <= 0)
      )
        fail('adjust must be a positive integer');
      if (c.kind === 'story' && r.adjust !== undefined)
        fail('story adjust is not allowed');
      if (r.mend !== undefined) {
        const m = r.mend;
        if (
          !object(m) ||
          !['worst', 'center', 'all'].includes(String(m.mode)) ||
          (m.mode !== 'all' &&
            (!Number.isInteger(m.count) ||
              Number(m.count) < 1 ||
              Number(m.count) > 4)) ||
          (m.mode !== 'center' &&
            (!Number.isInteger(m.amount) || Number(m.amount) <= 0)) ||
          (m.exclude !== undefined &&
            (!strings(m.exclude) ||
              m.exclude.some(
                (g) => !(GAUGE_KEYS as readonly string[]).includes(g),
              )))
        )
          fail('invalid mend');
      }
      if (
        r.witchPress !== undefined &&
        (!object(r.witchPress) ||
          !Number.isInteger(r.witchPress.amount) ||
          Number(r.witchPress.amount) <= 0 ||
          !Number.isInteger(r.witchPress.floor) ||
          Number(r.witchPress.floor) < 1 ||
          Number(r.witchPress.floor) >= 50)
      )
        fail('invalid witchPress');
      if (
        r.witchDrift !== undefined &&
        (!object(r.witchDrift) ||
          !Number.isInteger(r.witchDrift.perDoc) ||
          Number(r.witchDrift.perDoc) <= 0 ||
          !Number.isInteger(r.witchDrift.turns) ||
          Number(r.witchDrift.turns) <= 0)
      )
        fail('invalid witchDrift');
      if (r.setFlags !== undefined && !strings(r.setFlags))
        fail('invalid setFlags');
      if (
        r.relations !== undefined &&
        (!object(r.relations) ||
          Object.values(r.relations).some(
            (n) => typeof n !== 'number' || !Number.isFinite(n),
          ))
      )
        fail('invalid relations');
    }
    if (
      c.axeResult !== undefined &&
      (!object(c.axeResult) ||
        'message' in c.axeResult ||
        (c.axeResult.scene !== undefined &&
          (typeof c.axeResult.scene !== 'string' ||
            !Object.hasOwn(system.scenes, c.axeResult.scene))) ||
        (c.axeResult.setFlags !== undefined && !strings(c.axeResult.setFlags)))
    )
      fail('invalid axeResult');
    if (c.axe === 'free' && c.axeResult === undefined)
      fail('free axe requires axeResult');
    if (
      c.missed !== undefined &&
      (c.axe !== 'free' ||
        !object(c.missed) ||
        typeof c.missed.scene !== 'string' ||
        !Object.hasOwn(system.scenes, c.missed.scene))
    )
      fail('missed must specify a valid system scene on free axe cards only');
  });
  for (const [group, { kinds, pools }] of variants) {
    if (kinds.size > 1) {
      errors.push(
        `variant group ${group}: must not mix daily and story/fixed cards`,
      );
      continue;
    }
    if (kinds.has('daily')) {
      if (pools.size < 2)
        errors.push(
          `variant group ${group}: daily groups require at least 2 pools`,
        );
      if (
        new Set([...pools.values()].map((pool) => JSON.stringify(pool.tiers)))
          .size > 1
      )
        errors.push(
          `variant group ${group}: daily pools must have the same number of cards per tier`,
        );
      continue;
    }
    const speakers = [...pools.values()].map((pool) =>
      JSON.stringify([...pool.speakers].sort()),
    );
    if (new Set(speakers).size > 1)
      errors.push(
        `variant group ${group}: every pool must have the same set of speakers`,
      );
  }
  if (input.some((c) => object(c) && c.boss)) {
    for (const [phase, minimum] of [['early', 2], ['late', 4]] as const)
      if (input.filter((c) => object(c) && c.boss === 'unrest' && c.bossAt === undefined && c.bossPhase === phase).length < minimum)
        errors.push(`boss phase ${phase} needs at least ${minimum} cards`);
  }
  return errors;
}

export interface TranslationCoverage {
  errors: string[];
  cards: number;
  totalCards: number;
  system: number;
  totalSystem: number;
}
export function validateTranslations(
  input: unknown,
  cards: unknown[],
  source: unknown = system,
): TranslationCoverage {
  const result: TranslationCoverage = {
    errors: [],
    cards: 0,
    totalCards: cards.length,
    system: 0,
    totalSystem: 0,
  };
  const countStrings = (value: unknown): number =>
    typeof value === 'string'
      ? 1
      : value && typeof value === 'object'
        ? Object.values(value).reduce<number>(
            (sum, child) => sum + countStrings(child),
            0,
          )
        : 0;
  result.totalSystem = countStrings(source);
  const fail = (path: string, message: string) =>
    result.errors.push(`${path}: ${message}`);
  const checkString = (base: unknown, value: unknown, path: string) => {
    if (typeof value !== 'string') {
      fail(path, 'translation must be a string');
      return;
    }
    if (typeof base !== 'string') {
      fail(path, 'unknown string path');
      return;
    }
    for (const placeholder of new Set(base.match(/\{\w+\}/g) ?? []))
      if (!value.includes(placeholder))
        fail(path, `missing placeholder ${placeholder}`);
  };
  const walk = (base: unknown, value: unknown, path: string) => {
    if (typeof base === 'string') {
      checkString(base, value, path);
      if (typeof value === 'string') result.system++;
    } else if (
      base &&
      typeof base === 'object' &&
      value &&
      typeof value === 'object' &&
      Array.isArray(base) === Array.isArray(value)
    ) {
      for (const [key, child] of Object.entries(value)) {
        if (!Object.hasOwn(base, key))
          fail(`${path}.${key}`, 'unknown system path');
        else walk((base as Obj)[key], child, `${path}.${key}`);
      }
    } else fail(path, 'translation must contain string values');
  };
  if (!object(input)) {
    fail('i18n', 'must be an object');
    return result;
  }
  for (const key of Object.keys(input))
    if (!['system', 'cards'].includes(key))
      fail(key, 'unknown translation section');
  if ('system' in input) {
    if (!object(input.system)) fail('system', 'must be an object');
    else walk(source, input.system, 'system');
  }
  if ('cards' in input) {
    if (!object(input.cards)) fail('cards', 'must be an object');
    else
      for (const [id, copy] of Object.entries(input.cards)) {
        const card = cards.find((card) => object(card) && card.id === id) as
          Obj | undefined;
        if (!card) {
          fail(`cards.${id}`, 'unknown card id');
          continue;
        }
        if (!object(copy)) {
          fail(`cards.${id}`, 'must be an object');
          continue;
        }
        if (Object.keys(copy).length) result.cards++;
        const inherited = card.mimic
          ? (cards.find(
              (target) => object(target) && target.id === card.mimic,
            ) as Obj | undefined)
          : undefined;
        for (const [key, value] of Object.entries(copy)) {
          if (!['title', 'text', 'reject', 'approve'].includes(key)) {
            fail(`cards.${id}.${key}`, 'unknown card copy field');
            continue;
          }
          const base = card[key] ?? inherited?.[key];
          checkString(
            key === 'reject' || key === 'approve'
              ? (base as Obj | undefined)?.label
              : base,
            value,
            `cards.${id}.${key}`,
          );
        }
      }
  }
  return result;
}
