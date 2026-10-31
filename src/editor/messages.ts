// Plain-Korean wording for the validator's messages, shown in the editor.
const FIELD: Record<string, string> = {
  id: '아이디',
  speaker: '발신인',
  realSpeaker: '진짜 작성자',
  faction: '세력',
  title: '제목',
  text: '본문',
};
const SIDE: Record<string, string> = {
  reject: '왼쪽(반려)',
  approve: '오른쪽(승인)',
};

// 을/를 by whether the word ends in a final consonant.
const eul = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '을' : '를');
};

const RULES: [RegExp, (...m: string[]) => string][] = [
  [
    /^speaker (.+): unknown portrait group$/,
    (key) => `발신인(${key})의 초상화 그룹을 목록에서 골라 주세요.`,
  ],
  [
    /^portrait (.+): array entries must be strings$/,
    (key) => `초상화(${key})의 이미지 경로는 모두 문자열이어야 합니다.`,
  ],
  [
    /^grant uses must be a positive integer for hyean only$/,
    () => '횟수는 혜안에만 정할 수 있고, 1 이상의 정수여야 합니다.',
  ],
  [
    /^disguise must be special on speaki cards only$/,
    () => '다른 종이로 위장하는 설정은 스피키 카드에서 special 값으로만 쓸 수 있습니다.',
  ],
  [
    /^mimic must reference an existing daily card on speaki cards only$/,
    () =>
      '흉내 낼 원본은 스피키 카드에서만, 실제로 있는 일반 이벤트로 골라야 합니다.',
  ],
  [
    /^mimic cards must not define (\w+)$/,
    () =>
      '원본을 흉내 내는 스피키 카드는 본문만 직접 쓰고, 나머지는 원본을 따릅니다.',
  ],
  [
    /^speaki cards must have free axe$/,
    () => '스피키 카드는 도끼 사용을 "가짜 문서 적발용"으로 둬야 합니다.',
  ],
  [
    /^schedule must be an object$/,
    () => '후속 이벤트 예약 형식이 잘못되었습니다.',
  ],
  [
    /^schedule\.card must reference a scheduled-trigger card$/,
    () => '예약할 후속 이벤트는 "예약으로만 등장" 이벤트여야 합니다.',
  ],
  [
    /^schedule\.years must be a positive integer$/,
    () => '후속 이벤트까지의 햇수는 1 이상이어야 합니다.',
  ],
  [
    /^period must be a positive integer on special cards$/,
    () =>
      '등장 주기(몇 년에 한 번)는 특수 이벤트에만, 1 이상의 숫자로 정할 수 있습니다.',
  ],
  [
    /^missed must specify a valid system scene on free axe cards only$/,
    () =>
      '속았을 때 장면은 가짜 문서(도끼 졸음 없음) 카드에만, 있는 장면으로 골라야 합니다.',
  ],
  [
    /^npc must be a string on special cards$/,
    () => '특수 NPC 표시는 특수 이벤트에만 쓸 수 있습니다.',
  ],
  [
    /^invalid condition minYear$/,
    () => '최소 등장 연도는 0 이상의 숫자여야 합니다.',
  ],
  [
    /^invalid condition maxYear$/,
    () => '최대 등장 연도는 0 이상의 정수여야 합니다.',
  ],
  [
    /^condition minYear must not exceed maxYear$/,
    () => '최소 등장 연도는 최대 등장 연도보다 클 수 없습니다.',
  ],
  [
    /^invalid condition gauges$/,
    () => '자원 조건(최소·최대 수치)을 확인해 주세요.',
  ],
  [
    /^invalid grant boon$/,
    () => '선택지 보상으로 줄 수 있는 것은 혜안·역행·바꿔치기뿐입니다.',
  ],
  [
    /^adjust must be a positive integer$/,
    () => '자원 조절 값은 1 이상의 숫자여야 합니다.',
  ],
  [
    /^story adjust is not allowed$/,
    () => '스토리 이벤트에는 자원 조절을 넣을 수 없습니다.',
  ],
  [/^cards must be a nonempty array$/, () => '이벤트가 하나도 없습니다.'],
  [/^card must be an object$/, () => '이벤트 형식이 잘못되었습니다.'],
  [
    /^(\w+) must be a nonempty string$/,
    (k) => `${eul(FIELD[k] ?? k)} 채워 주세요.`,
  ],
  [
    /^duplicate id$/,
    () => '같은 아이디가 이미 있습니다. 다른 아이디로 바꿔 주세요.',
  ],
  [
    /^stamps must be direction, light or meet$/,
    () => '도장 모양은 좌·우 화살표, 빛 또는 손 내밀기를 골라 주세요.',
  ],
  [
    /^stamps is only allowed on story\/fixed cards$/,
    () => '특수 도장은 스토리·고정 이벤트에만 쓸 수 있습니다.',
  ],
  [
    /^stamps requires both reject and approve$/,
    () => '특수 도장은 왼쪽·오른쪽 선택지가 모두 필요합니다.',
  ],
  [/^invalid kind$/, () => '종류를 골라 주세요.'],
  [/^unknown (\w+)$/, (k) => `${eul(FIELD[k] ?? k)} 목록에서 골라 주세요.`],
  [/^invalid axe$/, () => '도끼 사용 설정이 잘못되었습니다.'],
  [
    /^special field is no longer supported$/,
    () => '예전 형식의 표시가 남아 있습니다. 종류를 다시 골라 주세요.',
  ],
  [
    /^story\/fixed cards must forbid axe$/,
    () => '스토리·고정 이벤트는 도끼를 쓸 수 없게 해야 합니다.',
  ],
  [
    /^story cards must forbid axe$/,
    () => '스토리 이벤트는 도끼를 쓸 수 없게 해야 합니다.',
  ],
  [
    /^fixed cards must forbid axe, count axe or require bullet$/,
    () =>
      '고정 이벤트는 도끼를 막거나, 졸음을 쌓거나, ‘마탄으로만’으로 정해야 합니다.',
  ],
  [
    /^drowse must be an integer from 1 to 3$/,
    () => '졸음은 1, 2, 3(강제 수면) 중에서만 고를 수 있습니다.',
  ],
  [
    /^drowse is only allowed on fixed\/daily\/special cards$/,
    () => '졸음 효과는 고정·일반·특수 이벤트에만 붙일 수 있습니다.',
  ],
  [
    /^onCondition requires fixed kind and conditions\.gauges only$/,
    () =>
      '‘조건 충족 시’ 등장은 고정 이벤트에만 쓸 수 있고, 자원 조건이 꼭 있어야 합니다.',
  ],
  [
    /^bullet axe is only allowed on fixed cards$/,
    () => '‘마탄으로만’은 고정 이벤트에만 쓸 수 있습니다.',
  ],
  [
    /^daily tier must be 1, 2 or 3$/,
    () => '일반 이벤트는 난이도(1~3단계)를 골라야 합니다.',
  ],
  [
    /^tier is only allowed on daily cards$/,
    () => '난이도는 일반 이벤트에만 정할 수 있습니다.',
  ],
  [
    /^repeatable must be a boolean on special cards$/,
    () => '"여러 번 등장"은 특수 이벤트에만 정할 수 있습니다.',
  ],
  [
    /^trigger is only allowed on story\/fixed cards$/,
    () => '등장 연도는 스토리·고정 이벤트에만 정할 수 있습니다.',
  ],
  [
    /^years must be/,
    () => '흐르는 햇수는 1 이상이어야 합니다. (스토리 이벤트만 0 가능)',
  ],
  [
    /^nerLine is no longer used$/,
    () => '네르의 혼잣말은 더 이상 쓰지 않습니다. 지워 주세요.',
  ],
  [/^invalid weight$/, () => '등장 비중은 1 이상의 숫자여야 합니다.'],
  [
    /^invalid story\/fixed trigger$/,
    () => '등장 연도와 같은 해 순서를 0 이상의 숫자로 채워 주세요.',
  ],
  [
    /^invalid conditions$|^invalid condition flags$/,
    () => '등장 조건의 기록 이름을 확인해 주세요.',
  ],
  [/^missing (\w+)$/, (s) => `${SIDE[s] ?? s} 선택지가 비어 있습니다.`],
  [
    /^invalid (\w+) label$/,
    (s) => `${SIDE[s] ?? s} 선택지 문구를 채워 주세요.`,
  ],
  [
    /^missing (\w+) effects$/,
    (s) => `${SIDE[s] ?? s} 자원 변화 정보가 없습니다.`,
  ],
  [
    /^story effects must be empty$/,
    () => '스토리 이벤트는 자원을 바꿀 수 없습니다.',
  ],
  [/^unknown gauge (\w+)$/, (g) => `알 수 없는 자원(${g})이 있습니다.`],
  [
    /^invalid delta (.+)$/,
    (d) => `자원 변화 값(${d})은 ±5, ±10, ±20 중 하나여야 합니다.`,
  ],
  [/^invalid setFlags$/, () => '남길 기록 이름을 확인해 주세요.'],
  [/^invalid relations$/, () => '관계도 값이 잘못되었습니다.'],
  [/^invalid axeResult$/, () => '적발 장면 설정을 확인해 주세요.'],
  [
    /^free axe requires axeResult$/,
    () => '가짜 문서 적발용 도끼에는 적발 장면을 골라야 합니다.',
  ],
];

/** "[3] title must be a nonempty string" → "제목을 채워 주세요." */
export function koMessage(raw: string): string {
  const message = raw.replace(/^\[\d+\]\s*/, '');
  for (const [pattern, say] of RULES) {
    const m = message.match(pattern);
    if (m) return say(...m.slice(1));
  }
  return message;
}
