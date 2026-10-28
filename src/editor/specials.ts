export const specialPreviews = {
  rewind: '리뉴아의 역행',
  stitch: '클로에의 바늘땀',
  erpinSave: '에르핀의 대신 도장',
  asleep: '네르가 잠들 때',
  speakiCaught: '스피키 적발',
  speakiFooled: '스피키에게 속음',
  alice: '와일드 카드',
  hyean: '디아나의 혜안',
  bullet: '마탄 발사',
  scope: '마탄 스코프',
  axe: '도끼 폐기',
  bossDay1: '불타는 왕국 · 보스 1일차',
  bossDay5: '불타는 왕국 · 보스 5일차',
  bossDay10: '불타는 왕국 · 보스 10일차',
  finaleKingdom: '결말: 텅 빈 왕국',
  finaleEscape: '결말: 탈출',
  finaleLight: '결말: 빛줄기',
  finaleStranger: '결말: 빛 속의 누군가',
  sleep: '강제 수면',
} as const;
export type SpecialPreview = keyof typeof specialPreviews;

export const atmospherePreviews: Partial<
  Record<SpecialPreview, { year: number; card?: string; boss?: number }>
> = {
  // the kingdom burns through the boss month: the smoke thickens day by day
  bossDay1: { year: 200, card: 'daily_guard_empty_posts', boss: 0 },
  bossDay5: { year: 200, card: 'daily_guard_empty_posts', boss: 4 },
  bossDay10: { year: 200, card: 'daily_guard_empty_posts', boss: 9 },
  finaleKingdom: { year: 200, card: 'boss_sugar_rebellion', boss: 9 },
  finaleEscape: { year: 200, card: 'story_escape_3' },
  finaleLight: { year: 200, card: 'story_finale_light' },
  finaleStranger: { year: 200, card: 'story_finale_stranger' },
  // aimed at an elf document, then fired on the approve stamp
  scope: { year: 120, card: 'fixed_rohne_visit' },
};
