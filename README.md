# 사제장 네르 · Ner the High Priestess

> 「트릭컬 리바이브」와 「Reigns」를 패러디한 **비공식 · 비상업 팬게임**입니다.
> An unofficial, non-commercial fan parody of *Trickcal Revive* and *Reigns*.

**▶ 플레이하기: <https://ember5521.github.io/Ner-the-high-priestess/>**

설치 없이 PC와 모바일 브라우저에서 바로 플레이할 수 있습니다. 한국어 · English · 日本語를 지원합니다.

## 어떤 게임인가요

요정왕국의 사제장 네르가 되어, 200년 동안 결재실에 올라오는 공문에 도장을 찍는 게임입니다.

- 공문마다 왼쪽 도장과 오른쪽 도장 중 하나를 골라 찍습니다.
- 선택에 따라 **사탕 · 주민 · 신앙 · 에르핀** 네 가지가 오르내립니다. 하나라도 바닥나거나 넘치면 통치가 끝납니다.
- 마음에 들지 않는 공문은 도끼로 버릴 수 있지만, 너무 자주 쓰면 네르가 졸기 시작합니다.
- 일부 공문은 아이템으로 이어집니다. 마탄, 스코프, 반창고처럼 직접 쓰는 아이템과, 갖고만 있어도 돕는 아이템이 있습니다.
- 200년을 버티면 진엔딩입니다. 엔딩은 모두 12가지입니다.

| 모드 | 설명 |
|---|---|
| 견습 사제 [Easy] | 어려운 공문이 적고 위기가 덜합니다. |
| 사제장 [Hard] | 본편 난이도입니다. |
| 주교 [Endless + Extreme] | 끝이 없는 재임. 징조와 축복, 기류가 번갈아 찾아옵니다. 진엔딩을 본 뒤 열립니다. |

진행 상황은 브라우저에 자동으로 저장되어 언제든 이어서 할 수 있습니다. 조작법은 게임 안의 튜토리얼에서 안내합니다.

## 팬게임 고지

- 이 게임은 에피드게임즈의 「트릭컬 리바이브」(해외판 「Trickcal: Chibi Go」, 일본판 「トリッカル・もちもちほっぺ大作戦」)와 Nerial · Devolver Digital의 「Reigns」를 패러디한 2차 창작물입니다. 두 원작의 권리자와는 아무 관계가 없는 비공식 팬게임입니다.
- 캐릭터, 세계관, 명칭 등 원작에 대한 모든 권리는 각 원 권리자에게 있습니다.
- 원작 게임의 이미지, 음성, 음악, 폰트 등 리소스를 추출하거나 사용하지 않았습니다. 게임 안의 그림은 이 팬게임을 위해 새로 만든 것입니다.
- 어떠한 수익도 내지 않습니다. 광고, 후원, 유료 판매가 없습니다.
- 권리자께서 요청하시면 즉시 수정하거나 공개를 중단하겠습니다. [GitHub 이슈](https://github.com/Ember5521/Ner-the-high-priestess/issues)로 연락해 주세요.

**Disclaimer.** This is an unofficial fan work parodying *Trickcal Revive* / *Trickcal: Chibi Go* (EPIDGames) and *Reigns* (Nerial / Devolver Digital). It is not affiliated with or endorsed by either rights holder. All rights to the original characters, settings and names belong to their respective owners. No assets were extracted from the original games, and this project makes no money. If you are a rights holder and want anything changed or removed, please open an issue.

## 이용 범위

이 저장소에는 오픈소스 라이선스가 없습니다. 코드, 그림, 대사를 포함한 저장소의 내용을 허락 없이 재사용, 재배포하거나 상업적으로 이용할 수 없습니다. 원작에 관한 권리는 위 고지와 같습니다.

No license is granted. Please do not reuse, redistribute or commercially use any part of this repository without permission.

## 외부 리소스

- 폰트: [Jua](https://fonts.google.com/specimen/Jua), [Gowun Dodum](https://fonts.google.com/specimen/Gowun+Dodum), 일본어용 [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c), [Zen Maru Gothic](https://fonts.google.com/specimen/Zen+Maru+Gothic) — Google Fonts, SIL Open Font License 1.1
- 배경음 `public/art/sounds/bgm_town.mp3` — cynicmusic, ["Town Theme RPG"](https://opengameart.org/node/20593), CC0. 음량을 맞췄습니다.
- 총소리 `public/art/sounds/shot.mp3` — Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney, ["The Free Firearm Sound Library"](https://opengameart.org/content/the-free-firearm-sound-library) 중 `A_42P.wav`, CC0. 앞부분을 자르고 음색과 음량을 다듬었습니다.
- 그 밖의 효과음은 Web Audio로 직접 합성합니다.

## 개발

Node.js 22 이상이 필요합니다.

```sh
npm install
npm run dev        # 게임 개발 서버
npm run editor     # 이벤트 편집기 (카드와 문구를 편집하고 미리보기)
npm test           # 테스트
npm run validate   # 카드 데이터 검증
npm run sim        # 난이도 시뮬레이션
npm run build      # dist/ 에 정적 빌드
```

- `data/cards/m1.json`: 공문 카드, `data/system.json`: 화면 문구와 엔딩, `data/art.json`: 그림 경로
- `src/core/`: 게임 규칙 (DOM 없음), `src/ui/`: 화면과 연출, `src/editor/`: 이벤트 편집기
- `main` 브랜치에 푸시하면 GitHub Actions가 검증과 테스트를 거쳐 GitHub Pages에 배포합니다. (저장소 Settings → Pages → Source: **GitHub Actions**)
