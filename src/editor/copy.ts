import { escape } from '../ui/art';
import {
  missingPlaceholders,
  structuralKeys,
  validateSystem,
  type SystemCopy,
} from './copy-data';

type Section = { id: string; label: string; paths: string[] };
type RecordValue = Record<string, any>;
const labels: Record<string, string> = {
  title: '제목',
  text: '본문',
  name: '이름',
  header: '머리말',
  button: '버튼',
  label: '이름',
  desc: '설명',
  short: '짧은 이름',
  yes: '수락',
  no: '거절',
  prev: '이전',
  next: '다음',
  done: '완료',
  skip: '건너뛰기',
  offer: '첫 안내',
  offerAccept: '안내 수락',
  offerSkip: '안내 건너뛰기',
  bestYear: '최장 재임',
  previewUp: '증가 안내',
  previewDown: '감소 안내',
  previewNeutral: '변화 안내',
  endingLine: '엔딩 모드 표시',
  apprentice: '견습 사제',
  priest: '사제장',
  pick: '선택 안내',
  tutorial: '튜토리얼',
  continue: '이어하기',
  continueDetail: '이어하기 상세',
  continueNote: '이어하기 안내',
  backNote: '뒤로 가기 안내',
  fullscreen: '전체 화면',
  fullscreenEnter: '전체 화면 시작',
  fullscreenExit: '전체 화면 종료',
  fullscreenNote: '전체 화면 안내',
  options: '옵션',
  album: '엔딩 도감',
  records: '기록',
  yearUnit: '연도',
  noRecord: '기록 없음',
  cleared: '완주',
  sfx: '효과음',
  bgm: '배경음',
  bgmNote: '배경음 안내',
  language: '언어',
  ko: '한국어',
  en: '영어',
  erase: '수양록 지우기 버튼',
  eraseConfirm: '수양록 지우기 확인',
  eraseYes: '수양록 지우기 수락',
  eraseNo: '수양록 지우기 취소',
  eraseDone: '수양록 지우기 완료',
  unlock: '주교 해금 버튼',
  unlockConfirm: '주교 해금 확인',
  unlockYes: '주교 해금 수락',
  unlockNo: '주교 해금 취소',
  unlockDone: '주교 해금 완료',
  unlocked: '주교 해금됨',
  close: '닫기',
  resume: '계속하기',
  axeLine: '도끼 대사',
  bulletLine: '마탄 대사',
  scopeLine: '스코프 대사',
  aliceLine: '카드 대사',
  notice: '고지',
};
export function copySections(data: SystemCopy): Section[] {
  return [
    { id: 'tutorial', label: '튜토리얼', paths: ['tutorial'] },
    ...Object.entries(data.scenes).map(([key, scene]) => ({
      id: `scenes.${key}`,
      label: `특수 장면 · ${scene.title} (${key})`,
      paths: [`scenes.${key}`],
    })),
    { id: 'rewindPrompt', label: '리뉴아의 역행', paths: ['rewindPrompt'] },
    ...[...Object.keys(data.gameOvers), 'true'].map((id) => ({
      id: `ending.${id}`,
      label: `엔딩 · ${id === 'true' ? data.trueEnding.title : data.gameOvers[id as keyof typeof data.gameOvers].title}`,
      paths: [
        id === 'true' ? 'trueEnding' : `gameOvers.${id}`,
        `endingHints.${id}`,
      ],
    })),
    ...Object.entries(data.extraEndings.items).map(([id, item]) => ({
      id: `ending.${id}`,
      label: `엔딩 · ${item.title}`,
      paths: [`extraEndings.items.${id}`, `endingHints.${id}`],
    })),
    {
      id: 'extraEndings',
      label: '추가 결재 공문',
      paths: [
        'extraEndings.document',
        'extraEndings.stamp',
        'extraEndings.next',
      ],
    },
    { id: 'boons', label: '보상', paths: ['boons'] },
    { id: 'modes', label: '모드', paths: ['modes'] },
    {
      id: 'menu',
      label: '타이틀·옵션·메뉴',
      paths: ['title', 'options', 'menu', 'clear'],
    },
    { id: 'speakers', label: '화자 이름', paths: ['speakers'] },
    { id: 'gauges', label: '게이지·진영 이름', paths: ['gauges', 'factions'] },
    {
      id: 'other',
      label: '기타',
      paths: ['axeLine', 'bulletLine', 'scopeLine', 'aliceLine', 'notice'],
    },
  ];
}
const at = (data: RecordValue, path: string): any =>
  path.split('.').reduce((value, key) => value?.[key], data);
export function copyFormMarkup(data: SystemCopy, paths: string[]): string {
  const walk = (value: any, path: string): string => {
    const key = path.split('.').at(-1)!;
    if (key === 'focus')
      return `<label class="ed-field"><span>강조 대상</span><small>${path}</small><select data-copy-focus="${path}">${['', 'tools', 'gauges', 'axe'].map((focus) => `<option value="${focus}" ${focus === (value ?? '') ? 'selected' : ''}>${({ tools: '도장', gauges: '게이지', axe: '도끼' } as Record<string, string>)[focus] ?? '없음'}</option>`).join('')}</select></label>`;
    if (structuralKeys.has(key)) return '';
    if (typeof value === 'string') {
      const long =
        value.length > 60 ||
        value.includes('\n') ||
        /text|desc|notice|Line|offer|Confirm/.test(key);
      return `<label class="ed-field"><span>${escape(labels[key] ?? key)}</span><small>${escape(path)}</small>${long ? `<textarea rows="4" data-copy-path="${path}">${escape(value)}</textarea>` : `<input type="text" data-copy-path="${path}" value="${escape(value)}">`}<small class="ed-copy-warning" data-warning="${path}" role="status"></small></label>`;
    }
    if (Array.isArray(value)) {
      const editable = path === 'tutorial.steps' || path.endsWith('.lines');
      return (
        value
          .map(
            (item, index) =>
              `<fieldset><legend>${path === 'tutorial.steps' ? '단계' : '항목'} ${index + 1}</legend>${walk(item, `${path}.${index}`)}${editable ? `<div class="ed-copy-actions">${path === 'tutorial.steps' ? `<button type="button" data-copy-preview="${index}">이 단계 미리보기</button><button type="button" data-copy-action="up" data-path="${path}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>위로</button><button type="button" data-copy-action="down" data-path="${path}" data-index="${index}" ${index === value.length - 1 ? 'disabled' : ''}>아래로</button>` : ''}<button type="button" data-copy-action="remove" data-path="${path}" data-index="${index}">삭제</button></div>` : ''}</fieldset>`,
          )
          .join('') +
        (editable
          ? `<button type="button" class="ed-btn" data-copy-action="add" data-path="${path}">${path === 'tutorial.steps' ? '단계' : '대사'} 추가</button>`
          : '')
      );
    }
    return Object.entries(value)
      .map(([name, child]) => walk(child, `${path}.${name}`))
      .join('');
  };
  return paths
    .map(
      (path) =>
        `<fieldset><legend>${escape(path)}</legend>${walk(at(data, path), path)}</fieldset>`,
    )
    .join('');
}
export function initializeCopyEditor(options: {
  frame: HTMLIFrameElement;
  save: HTMLButtonElement;
  status: (type: string, message: string) => void;
  switched: () => void;
}) {
  let active = false,
    dirty = false,
    saving = false,
    revision = 0;
  let saved: SystemCopy | undefined, data: SystemCopy | undefined;
  let selected = 'tutorial',
    step = 0;
  let loadError = '';
  let loading = false;
  const list = document.createElement('aside');
  list.className = 'ed-list ed-copy-list';
  list.hidden = true;
  list.setAttribute('aria-label', '문구 목록');
  const form = document.createElement('section');
  form.className = 'ed-form ed-copy-form';
  form.hidden = true;
  form.setAttribute('aria-label', '문구 편집');
  document.querySelector('.ed-main')!.prepend(list, form);
  const cardList = document.querySelector<HTMLElement>(
    '.ed-list:not(.ed-copy-list)',
  )!;
  const cardForm = document.getElementById('form')!;
  const section = () =>
    data && copySections(data).find((entry) => entry.id === selected)!;
  const post = () => {
    if (!active || !data) return;
    options.frame.contentWindow?.postMessage(
      { type: 'copy', system: data, section: selected, step },
      location.origin,
    );
  };
  const validate = () => {
    const errors =
      data && saved
        ? validateSystem(data, saved)
        : [loadError || '문구를 불러오는 중입니다.'];
    if (active) options.save.disabled = saving || errors.length > 0;
    const el = form.querySelector<HTMLElement>('.ed-errors');
    if (el) {
      el.hidden = !errors.length;
      el.innerHTML = errors.map((e) => `<li>${escape(e)}</li>`).join('');
    }
    form
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        '[data-copy-path]',
      )
      .forEach((input) => {
        const path = input.dataset.copyPath!;
        const old = saved && at(saved, path);
        const missing =
          typeof old === 'string' ? missingPlaceholders(old, input.value) : [];
        form.querySelector<HTMLElement>(
          `[data-warning="${path}"]`,
        )!.textContent = missing.length
          ? `자리표시자를 유지하세요: ${missing.join(', ')}`
          : '';
        input.closest('.ed-field')!.classList.toggle(
          'invalid',
          errors.some((e) => e.startsWith(`${path}:`)),
        );
      });
    return errors;
  };
  const render = () => {
    if (!data) {
      form.textContent = loadError || '문구를 불러오는 중입니다.';
      return;
    }
    list.innerHTML = `<ul class="ed-items">${copySections(data)
      .map(
        (entry) =>
          `<li><button type="button" class="ed-item" data-copy-section="${entry.id}" aria-current="${selected === entry.id}">${escape(entry.label)}</button></li>`,
      )
      .join('')}</ul>`;
    form.innerHTML = `<h2>${escape(section()!.label)}</h2><ul class="ed-errors" hidden></ul>${copyFormMarkup(data, section()!.paths)}`;
    validate();
  };
  const changed = () => {
    dirty = true;
    revision++;
    options.status('dirty', '저장 안 된 변경 있음');
    validate();
    post();
  };
  form.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const path = input.dataset.copyPath;
    if (!data || !path) return;
    const parts = path.split('.');
    const key = parts.pop()!;
    const parent = parts.length ? at(data, parts.join('.')) : data;
    parent[key] = input.value;
    if (path.startsWith('tutorial.steps.')) step = Number(path.split('.')[2]);
    changed();
  });
  form.addEventListener('change', (event) => {
    const input = event.target as HTMLSelectElement;
    const path = input.dataset.copyFocus;
    if (!data || !path) return;
    at(data, path.slice(0, path.lastIndexOf('.'))).focus = input.value || null;
    step = Number(path.split('.')[2]);
    changed();
  });
  form.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button',
    );
    if (!button || button.disabled || !data) return;
    if (button.dataset.copyPreview !== undefined) {
      step = Number(button.dataset.copyPreview);
      post();
      return;
    }
    const action = button.dataset.copyAction,
      path = button.dataset.path;
    if (!action || !path) return;
    const items = at(data, path) as RecordValue[],
      index = Number(button.dataset.index);
    if (action === 'add') {
      items.push(
        path === 'tutorial.steps'
          ? { title: '', text: '', focus: null }
          : { name: '', text: '' },
      );
      step = items.length - 1;
    } else if (action === 'remove') {
      items.splice(index, 1);
      step = Math.max(0, Math.min(step, items.length - 1));
    } else {
      const target = index + (action === 'up' ? -1 : 1);
      [items[index], items[target]] = [items[target]!, items[index]!];
      step = target;
    }
    render();
    changed();
  });
  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-copy-section]',
    );
    if (button) {
      selected = button.dataset.copySection!;
      step = 0;
      render();
      post();
    }
  });
  async function load() {
    if (loading) return;
    loading = true;
    loadError = '';
    try {
      const response = await fetch('/__editor/system');
      if (!response.ok) throw new Error(response.statusText);
      data = await response.json();
      saved = structuredClone(data);
    } catch (error) {
      loadError = `문구 불러오기 실패: ${error}`;
    }
    loading = false;
    if (active) {
      render();
      validate();
      post();
      if (loadError) options.status('error', loadError);
    }
  }
  async function saveAll() {
    if (saving || validate().length || !data) return;
    saving = true;
    validate();
    const version = revision,
      snapshot = structuredClone(data);
    try {
      const response = await fetch('/__editor/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errors?.join(' / ') ?? response.statusText);
      }
      saved = snapshot;
      if (version === revision) dirty = false;
      if (active)
        options.status(
          dirty ? 'dirty' : 'saved',
          dirty ? '저장 안 된 변경 있음' : '저장됨',
        );
    } catch (error) {
      if (active) options.status('error', `저장 실패: ${error}`);
    } finally {
      saving = false;
      validate();
    }
  }
  const tabs = document.createElement('nav');
  tabs.className = 'ed-copy-tabs';
  tabs.setAttribute('aria-label', '편집 모드');
  tabs.innerHTML =
    '<button type="button" data-editor-mode="cards" aria-pressed="true">이벤트 카드</button><button type="button" data-editor-mode="copy" aria-pressed="false">문구</button>';
  document.querySelector('.ed-bar h1')!.after(tabs);
  tabs.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-editor-mode]',
    );
    if (!button) return;
    active = button.dataset.editorMode === 'copy';
    tabs
      .querySelectorAll('button')
      .forEach((el) => el.setAttribute('aria-pressed', String(el === button)));
    list.hidden = form.hidden = !active;
    cardList.hidden = cardForm.hidden = active;
    document
      .querySelectorAll<HTMLElement>('.ed-aim,.ed-preview-year,.ed-special')
      .forEach((el) => (el.hidden = active));
    document.querySelector('.ed-file')!.textContent = active
      ? 'data/system.json'
      : 'data/cards/m1.json';
    if (active) {
      render();
      validate();
      options.status(
        dirty ? 'dirty' : 'saved',
        dirty ? '저장 안 된 변경 있음' : '저장됨',
      );
      if (!data) void load();
      else post();
    } else options.switched();
  });
  options.frame.addEventListener('load', post);
  return {
    get active() {
      return active;
    },
    get dirty() {
      return dirty;
    },
    post,
    save: saveAll,
  };
}
