import system from '../../data/system.json';
import type { SpecialPreview } from './specials';
import type { Card, Gauge } from '../core/state';
import { escape } from '../ui/art';

export interface Feature {
  kind: string;
  icon: string;
  short: string;
  title: string;
  body: string;
  preview?:
    | { type: 'boon'; boon: keyof typeof system.boons }
    | { type: 'scene'; scene: string }
    | { type: 'special'; special: SpecialPreview };
}

export function cardFeatures(card: Card, cards: Card[]): Feature[] {
  const target =
    card.kind === 'speaki' && card.mimic
      ? cards.find((c) => c.id === card.mimic && c.kind === 'daily')
      : undefined;
  const sources = target ? [target, card] : [card];
  const features: Feature[] = [];
  const add = (feature: Feature) => {
    if (!features.some((f) => JSON.stringify(f) === JSON.stringify(feature)))
      features.push(feature);
  };
  const grants = new Map<keyof typeof system.boons, Set<string>>();
  const scenes = new Map<string, Set<string>>();
  for (const c of sources) {
    for (const side of ['reject', 'approve'] as const) {
      const choice = c[side];
      if (!choice) continue;
      const stamp =
        c.stamps === 'meet'
          ? '손을 내민다'
          : c.stamps === 'light'
            ? '빛으로'
            : c.stamps === 'direction'
              ? side === 'reject'
                ? '왼쪽'
                : '오른쪽'
              : side === 'reject' && c.kind !== 'story'
                ? '반려'
                : '승인';
      if (choice.drowse === 3)
        add({
          kind: 'drowse',
          icon: '☾',
          short: `강제 수면 (${stamp})`,
          title: '강제 수면',
          preview: { type: 'special', special: 'sleep' },
          body: '이 도장을 찍으면 네르가 그 자리에서 잠들어 버립니다. 몇 장 동안 에르핀이 대신 도장을 찍습니다.',
        });
      else if (choice.drowse)
        add({
          kind: 'drowse',
          icon: '☾',
          short: `졸음 +${choice.drowse} (${stamp})`,
          title: `졸음 +${choice.drowse}`,
          body: `${choice.drowse === 1 ? '이 도장을 찍으면 도끼를 한 번 쓴 것처럼 졸음이 한 칸 쌓입니다. 졸음이 이미 두 칸이면 바로 잠들어 버립니다.' : '이 도장을 찍으면 도끼를 두 번 쓴 것처럼 졸음이 두 칸 쌓입니다. 졸음이 이미 쌓여 있으면 바로 잠들어 버립니다.'}\n\n선택지: ${stamp}`,
        });
      if (choice.grant) {
        const boon = choice.grant.boon;
        if (!grants.has(boon)) grants.set(boon, new Set());
        grants.get(boon)!.add(stamp);
      }
      if (choice.schedule) {
        const { years, card: id } = choice.schedule;
        const title = cards.find((c) => c.id === id)?.title ?? id;
        add({
          kind: 'schedule',
          icon: '⏱',
          short: `후속 ${years}년`,
          title: '후속 이벤트 예약',
          body: `이 선택지(${stamp})를 고르면 ${years}년 뒤 '${title}'이(가) 반드시 나옵니다.`,
        });
      }
      if (choice.adjust !== undefined)
        add({
          kind: 'adjust',
          icon: '◎',
          short: `조절 ${choice.adjust}`,
          title: '자원 조절',
          body: `이 선택지(${stamp})를 고르면 사탕을 뺀 자원 중 가장 위험한 것을 중앙 쪽으로 ${choice.adjust}만큼 당겨 줍니다.`,
        });
    }
    if (c.trigger?.onCondition)
      add({
        kind: 'onCondition',
        icon: '◇',
        short: '조건 등장',
        title: '조건 등장',
        body: '조건을 만족하는 순간 바로 나옵니다. 한 판에 한 번.',
      });
    if (c.trigger?.scheduled)
      add({
        kind: 'scheduled',
        icon: '⏱',
        short: '예약 전용',
        title: '예약으로만 등장',
        body: '다른 이벤트의 선택으로 예약됐을 때만 나옵니다. 정해진 해에 저절로 나오지 않습니다.',
      });
    for (const [id, when] of [
      [c.axeResult?.scene, '도끼로 잡았을 때'],
      [c.missed?.scene, '도장을 찍어 속았을 때'],
    ] as const) {
      if (!id || !Object.hasOwn(system.scenes, id)) continue;
      if (!scenes.has(id)) scenes.set(id, new Set());
      scenes.get(id)!.add(when);
    }
    if (c.period !== undefined)
      add({
        kind: 'period',
        icon: '↻',
        short: `${c.period}년에 한 번`,
        title: '등장 주기',
        body: `${c.period}년 단위 구간마다 많아야 한 번, 구간 안의 랜덤한 해에 나옵니다.`,
      });
    if (c.trigger?.from !== undefined) {
      const { from, to } = c.trigger;
      add({
        kind: 'window',
        icon: '⌛',
        short: `${from}~${to}년`,
        title: '기간 안 랜덤 등장',
        body: `${from}년부터 ${to}년 사이 랜덤한 해에 반드시 한 번 나옵니다.`,
      });
    }
  }
  for (const [id, stamps] of grants) {
    const boon = system.boons[id];
    add({
      kind: 'grant',
      icon: '★',
      short: boon.short,
      title: `보상: ${boon.name}`,
      body: `${id === 'hyean' ? 'N번 선택 동안 자원 변화를 정확한 숫자로 보여 줍니다.' : boon.desc}\n\n받는 선택지: ${[...stamps].join(', ')}`,
      preview: { type: 'boon', boon: id },
    });
  }
  for (const [id, when] of scenes) {
    const scene = system.scenes[id as keyof typeof system.scenes];
    add({
      kind: 'scene',
      icon: '▶',
      short: scene.title,
      title: `장면: ${scene.title}`,
      body: `${[...when].map((stamp) => `${stamp} 나오는 장면입니다.`).join('\n')}\n${scene.header}`,
      preview: { type: 'scene', scene: id },
    });
  }
  if (card.kind === 'speaki' && card.mimic)
    add({
      kind: 'mimic',
      icon: '✎',
      short: '흉내',
      title: '스피키의 흉내',
      body: `'${target?.title ?? card.mimic}' 공문을 흉내 낸 가짜 공문입니다. 제목·발신인·선택지·자원 변화는 원본을 따르고, 본문만 따로 씁니다.`,
    });
  if (card.axe === 'bullet')
    add({
      kind: 'bullet',
      icon: '⦿',
      short: '마탄 표적',
      title: '마탄 표적',
      body: '검은 마탄을 가지고 있으면 이 고정 공문을 쏴서 폐기할 수 있습니다. 마탄 한 발을 쓰고, 졸음은 쌓이지 않습니다.',
    });
  const lines = new Set<string>();
  for (const c of sources) {
    const condition = c.conditions;
    if (condition?.minYear !== undefined)
      lines.add(`${condition.minYear}년 이후`);
    if (condition?.maxYear !== undefined)
      lines.add(`${condition.maxYear}년까지`);
    if (condition?.flagsAll?.length)
      lines.add(`기록 있음: ${condition.flagsAll.join(', ')}`);
    if (condition?.flagsNone?.length)
      lines.add(`기록 없음: ${condition.flagsNone.join(', ')}`);
    for (const { key, label } of system.gauges) {
      const range = condition?.gauges?.[key as Gauge];
      if (!range || (range.min === undefined && range.max === undefined))
        continue;
      lines.add(
        `${label} ${range.min === undefined ? `${range.max} 이하` : range.max === undefined ? `${range.min} 이상` : `${range.min}~${range.max}`}`,
      );
    }
  }
  if (lines.size)
    add({
      kind: 'condition',
      icon: '⚑',
      short: '조건',
      title: '등장 조건',
      body: [...lines].join('\n'),
    });
  return features;
}

export function badgeMarkup(features: Feature[], labels = false): string {
  return features
    .map(
      (f, index) =>
        `<button type="button" class="ed-badge" data-badge="${f.kind}" data-feature="${index}" aria-label="${escape(f.title)}" aria-expanded="false">${f.icon}${labels ? `<b>${escape(f.short)}</b>` : ''}</button>`,
    )
    .join('');
}

export function featurePopover(
  resolve: (button: HTMLElement) => Feature | undefined,
  preview: (message: NonNullable<Feature['preview']>) => void,
) {
  const get = (id: string) => document.getElementById(`feature-pop${id}`)!;
  const pop = get('');
  let anchor: HTMLElement | undefined;
  let feature: Feature | undefined;
  const close = (focus = true) => {
    pop.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    if (focus) anchor?.focus();
    anchor = undefined;
    feature = undefined;
  };
  const position = () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12))}px`;
    pop.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - box.height - 12))}px`;
    pop.style.maxHeight = `${Math.max(0, window.innerHeight - 24)}px`;
    pop.style.overflowY = 'auto';
  };
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>('button[data-feature]');
    if (button) {
      event.stopPropagation();
      const next = resolve(button);
      close(false);
      if (!next) return;
      anchor = button;
      feature = next;
      button.setAttribute('aria-expanded', 'true');
      get('-icon').textContent = next.icon;
      get('-icon').dataset.badge = next.kind;
      get('-title').textContent = next.title;
      get('-body').textContent = next.body;
      get('-preview').hidden = !next.preview;
      pop.hidden = false;
      position();
      get('-close').focus();
    } else if (!pop.contains(target)) close();
  });
  get('-close').addEventListener('click', () => close());
  get('-preview').addEventListener('click', () => {
    if (feature?.preview) preview(feature.preview);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && anchor) {
      event.preventDefault();
      close();
    }
  });
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);
  return close;
}
