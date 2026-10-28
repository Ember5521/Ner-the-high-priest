// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import rawCards from '../data/cards/m1.json';
import system from '../data/system.json';
import type { Card } from '../src/core/state';
import { badgeMarkup, cardFeatures } from '../src/editor/features';

const base = (): Card => ({
  ...structuredClone(rawCards.find((c) => c.kind === 'daily') as Card),
  conditions: undefined,
});

it('describes hyean in choices', () => {
  const card = rawCards.find((c) => c.id === 'story_diana_thanks') as Card;
  expect(
    cardFeatures(card, [card]).find((f) => f.kind === 'grant')?.body,
  ).toContain('N번 선택 동안 자원 변화를 정확한 숫자로 보여 줍니다.');
});

it('derives all feature kinds with approved copy, distinct choices, grants and scenes', () => {
  const card: Card = {
    ...base(),
    kind: 'special',
    period: 8,
    reject: {
      label: 'not the stamp',
      effects: {},
      grant: { boon: 'alice' },
      adjust: 10,
      schedule: { card: 'later', years: 3 },
    },
    approve: {
      label: 'also not the stamp',
      effects: {},
      grant: { boon: 'alice' },
      adjust: 20,
      schedule: { card: 'later', years: 5 },
    },
    axeResult: { scene: 'speakiCaught' },
    missed: { scene: 'speakiFooled' },
    conditions: {
      minYear: 0,
      flagsAll: ['a', 'b'],
      flagsNone: ['c'],
      gauges: {
        people: { min: 10, max: 90 },
        faith: { min: 20 },
        erpin: { max: 80 },
      },
    },
  };
  const features = cardFeatures(card, [
    { ...base(), id: 'later', title: '다음 공문' },
  ]);
  expect(features.filter((f) => f.kind === 'grant')).toEqual([
    {
      kind: 'grant',
      icon: '★',
      short: system.boons.alice.short,
      title: `보상: ${system.boons.alice.name}`,
      body: `${system.boons.alice.desc}\n\n받는 선택지: 반려, 승인`,
      preview: { type: 'boon', boon: 'alice' },
    },
  ]);
  expect(
    features.filter((f) => f.kind === 'schedule').map((f) => f.body),
  ).toEqual([
    "이 선택지(반려)를 고르면 3년 뒤 '다음 공문'이(가) 반드시 나옵니다.",
    "이 선택지(승인)를 고르면 5년 뒤 '다음 공문'이(가) 반드시 나옵니다.",
  ]);
  expect(
    features.filter((f) => f.kind === 'adjust').map((f) => f.body),
  ).toEqual(
    [10, 20].map(
      (n, i) =>
        `이 선택지(${i ? '승인' : '반려'})를 고르면 사탕을 뺀 자원 중 가장 위험한 것을 중앙 쪽으로 ${n}만큼 당겨 줍니다.`,
    ),
  );
  expect(features.filter((f) => f.kind === 'scene').map((f) => f.body)).toEqual(
    [
      `도끼로 잡았을 때 나오는 장면입니다.\n${system.scenes.speakiCaught.header}`,
      `도장을 찍어 속았을 때 나오는 장면입니다.\n${system.scenes.speakiFooled.header}`,
    ],
  );
  expect(features.find((f) => f.kind === 'period')).toMatchObject({
    short: '8년에 한 번',
    body: '8년 단위 구간마다 많아야 한 번, 구간 안의 랜덤한 해에 나옵니다.',
  });
  expect(features.find((f) => f.kind === 'condition')?.body).toBe(
    '0년 이후\n기록 있음: a, b\n기록 없음: c\n주민 10~90\n신앙 20 이상\n에르핀 80 이하',
  );
  card.approve.grant = { boon: 'rewind' };
  expect(cardFeatures(card, []).filter((f) => f.kind === 'grant')).toHaveLength(
    2,
  );
  card.kind = 'story';
  card.approve.grant = { boon: 'alice' };
  expect(cardFeatures(card, []).find((f) => f.kind === 'grant')?.body).toBe(
    `${system.boons.alice.desc}\n\n받는 선택지: 승인`,
  );
  card.trigger = { scheduled: true, order: 0 };
  expect(
    cardFeatures(card, []).find((f) => f.kind === 'scheduled'),
  ).toMatchObject({
    short: '예약 전용',
    title: '예약으로만 등장',
    body: '다른 이벤트의 선택으로 예약됐을 때만 나옵니다. 정해진 해에 저절로 나오지 않습니다.',
  });
  card.trigger = { from: 5, to: 15, order: 0 };
  expect(cardFeatures(card, []).find((f) => f.kind === 'window')).toMatchObject(
    {
      short: '5~15년',
      body: '5년부터 15년 사이 랜덤한 해에 반드시 한 번 나옵니다.',
    },
  );
  document.body.innerHTML = badgeMarkup(features, true);
  expect(document.querySelectorAll('button')).toHaveLength(features.length);
  expect(document.querySelector('button')?.getAttribute('type')).toBe('button');
  expect(document.querySelector('button b')).not.toBeNull();
});

it('combines mimic target and own fields once, including target year gating', () => {
  const target = {
    ...base(),
    conditions: { minYear: 25 },
    approve: {
      label: 'a',
      effects: {},
      grant: { boon: 'alice' as const },
      adjust: 5,
    },
  };
  const mimic: Card = {
    ...base(),
    id: 'fake',
    kind: 'speaki',
    mimic: target.id,
    conditions: { flagsAll: ['own'] },
    axeResult: { scene: 'speakiCaught' },
    missed: { scene: 'speakiCaught' },
    approve: structuredClone(target.approve),
  };
  const features = cardFeatures(mimic, [target, mimic]);
  expect(features.filter((f) => f.kind === 'grant')).toHaveLength(1);
  expect(features.filter((f) => f.kind === 'adjust')).toHaveLength(1);
  expect(features.filter((f) => f.kind === 'scene')).toHaveLength(1);
  expect(features.find((f) => f.kind === 'condition')?.body).toBe(
    '25년 이후\n기록 있음: own',
  );
  expect(features.find((f) => f.kind === 'mimic')?.body).toBe(
    `'${target.title}' 공문을 흉내 낸 가짜 공문입니다. 제목·발신인·선택지·자원 변화는 원본을 따르고, 본문만 따로 씁니다.`,
  );
  expect(cardFeatures(base(), [])).toEqual([]);
});

it('keeps list selection, opens and dismisses accessible popovers, updates edits and posts previews', async () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const first = base();
  const second: Card = {
    ...base(),
    id: 'other',
    kind: 'special',
    axe: 'free',
    axeResult: { scene: 'speakiCaught' },
    approve: { label: 'a', effects: {}, grant: { boon: 'alice' } },
  };
  localStorage.setItem('event-editor', JSON.stringify({ id: first.id }));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => [first, second] }),
  );
  await import('../src/editor/main');
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  await vi.waitFor(() =>
    expect(get<HTMLInputElement>('f-id').value).toBe(first.id),
  );
  const badge = document.querySelector<HTMLButtonElement>(
    '[data-id="other"] [data-badge="grant"]',
  )!;
  const pop = get('feature-pop');
  vi.spyOn(badge, 'getBoundingClientRect').mockReturnValue({
    left: 2000,
    bottom: 2000,
  } as DOMRect);
  vi.spyOn(pop, 'getBoundingClientRect').mockReturnValue({
    width: 320,
    height: 200,
  } as DOMRect);
  expect(badge.parentElement?.previousElementSibling?.tagName).toBe('B');
  expect(badge.querySelector('b')).toBeNull();
  badge.focus();
  badge.click();
  expect(get<HTMLInputElement>('f-id').value).toBe(first.id);
  expect(pop.hidden).toBe(false);
  expect(badge.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(get('feature-pop-close'));
  expect(parseFloat(pop.style.left)).toBeGreaterThanOrEqual(12);
  expect(parseFloat(pop.style.left) + 320).toBeLessThanOrEqual(
    window.innerWidth - 12,
  );
  expect(parseFloat(pop.style.top) + 200).toBeLessThanOrEqual(
    window.innerHeight - 12,
  );
  const frame = get<HTMLIFrameElement>('preview');
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  get('feature-pop-preview').click();
  expect(post).toHaveBeenLastCalledWith(
    { type: 'special', special: 'alice' },
    location.origin,
  );
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(pop.hidden).toBe(true);
  expect(document.activeElement).toBe(badge);
  expect(badge.getAttribute('aria-expanded')).toBe('false');
  badge.click();
  get('feature-pop-close').click();
  expect(pop.hidden).toBe(true);
  badge.click();
  document.body.click();
  expect(pop.hidden).toBe(true);
  badge.click();
  const scene = document.querySelector<HTMLButtonElement>(
    '[data-id="other"] [data-badge="scene"]',
  )!;
  scene.click();
  expect(badge.getAttribute('aria-expanded')).toBe('false');
  expect(get('feature-pop-title').textContent).toBe(
    `장면: ${system.scenes.speakiCaught.title}`,
  );
  get('feature-pop-preview').click();
  expect(post).toHaveBeenLastCalledWith(
    { type: 'special', special: 'speakiCaught' },
    location.origin,
  );
  document.querySelector<HTMLButtonElement>('[data-id="other"]')!.click();
  expect(pop.hidden).toBe(true);
  expect(get<HTMLInputElement>('f-id').value).toBe(second.id);
  expect(
    get('features').querySelector('[data-badge="grant"] b')?.textContent,
  ).toBe(system.boons.alice.short);
  get<HTMLInputElement>('f-flagsAll').value = 'new_flag';
  get('f-flagsAll').dispatchEvent(new Event('input', { bubbles: true }));
  expect(
    get('features').querySelector('[data-badge="condition"]'),
  ).not.toBeNull();
  expect(
    document.querySelector('[data-id="other"] [data-badge="condition"]'),
  ).not.toBeNull();
  get('features')
    .querySelector<HTMLButtonElement>('[data-badge="condition"]')!
    .click();
  expect(get('feature-pop-body').textContent).toBe('기록 있음: new_flag');
  expect(get('feature-pop-preview').hidden).toBe(true);
  get('feature-pop-close').click();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
