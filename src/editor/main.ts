import './editor.css';
import { initializeCopyEditor } from './copy';
import system from '../../data/system.json';
import { specialPreviews, type SpecialPreview } from './specials';
import { materializeCard } from '../core/deck';
import type { Action, Card } from '../core/state';
import { escape } from '../ui/art';
import { validateCards } from '../../tools/validate-cards';
import { koMessage } from './messages';
import { badgeMarkup, cardFeatures, featurePopover } from './features';
import {
  duplicateCard,
  fillForm,
  initializeForm,
  listedCards,
  listTab,
  newCard,
  readForm,
} from './form';

const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const form = get('form');
const save = get<HTMLButtonElement>('save');
const frame = get<HTMLIFrameElement>('preview');
const modeControl = get<HTMLSelectElement>('preview-mode');
modeControl.setAttribute('aria-label', system.modes.label);
modeControl.innerHTML = (['apprentice', 'priest', 'bishop'] as const)
  .map((id) => `<option value="${id}">${system.modes[id].name}</option>`)
  .join('');
modeControl.value = 'priest';
modeControl.addEventListener('change', () => {
  clearTimeout(timer);
  post();
});
let cards: Card[] = [];
let selected: Card | undefined;
let kind = 'all';
let rememberedId = '';
let aim: Action | 'none' = 'none';
let armed = false;
// Items the preview desk holds besides the 마탄; the scope is held and
// the blindfold can also sit on a gauge, so those two are selects.
const PREVIEW_ITEMS = [
  'hyean',
  'intuition',
  'understudy',
  'rewind',
  'stitch',
  'alice',
] as const;
let items: string[] = [];
let blindfold = '';
let scope = '';
let bandage = '';
let previewYear = 0;
const yearOverrides = new Map<string, number>();
const yearControl = get<HTMLInputElement>('preview-year');
function updatePreviewYear() {
  previewYear =
    (selected && yearOverrides.get(selected.id)) ??
    (selected && (selected.kind === 'story' || selected.kind === 'fixed')
      ? selected.trigger?.year
      : undefined) ??
    selected?.conditions?.minYear ??
    previewYear;
  yearControl.value = String(previewYear);
  get<HTMLOutputElement>('preview-year-value').value = String(previewYear);
}
yearControl.addEventListener('input', () => {
  previewYear = yearControl.valueAsNumber;
  if (selected) yearOverrides.set(selected.id, previewYear);
  updatePreviewYear();
  clearTimeout(timer);
  post();
});
let dirty = false;
let saving = false;
let errors: string[] = [];
let revision = 0;
let timer: ReturnType<typeof setTimeout>;
const closeFeature = featurePopover(
  (button) => {
    const id = button.closest<HTMLElement>('.ed-item')?.dataset.id;
    const card = id ? cards.find((c) => c.id === id) : selected;
    return card && cardFeatures(card, cards)[Number(button.dataset.feature)];
  },
  (message) => {
    clearTimeout(timer);
    const id =
      message.type === 'special'
        ? message.special
        : message.type === 'boon'
          ? message.boon
          : message.scene;
    if (Object.hasOwn(specialPreviews, id)) playSpecial(id as SpecialPreview);
    else {
      post();
      frame.contentWindow?.postMessage(message, location.origin);
    }
  },
);
try {
  const memory = JSON.parse(localStorage.getItem('event-editor') ?? '{}');
  kind = ['all', 'story', 'fixed', 'daily', 'special', 'hard', 'speaki'].includes(
    memory.kind,
  )
    ? memory.kind
    : 'all';
  rememberedId = memory.id ?? '';
} catch {
  /* Storage is optional. */
}
const remember = () => {
  try {
    localStorage.setItem(
      'event-editor',
      JSON.stringify({ kind, id: selected?.id }),
    );
  } catch {
    /* Storage is optional. */
  }
};
function status(type: string, message: string) {
  const el = get('status');
  el.className = `ed-status ${type}`;
  el.textContent = message;
}
function post() {
  if (copyEditor?.active) {
    copyEditor.post();
    return;
  }
  frame.contentWindow?.postMessage(
    {
      type: 'card',
      card: selected ? materializeCard(selected, cards) : null,
      aim,
      armed,
      items,
      blindfold,
      scope,
      bandage,
      mode: modeControl.value,
      year: previewYear,
    },
    location.origin,
  );
}
function playSpecial(special: SpecialPreview) {
  clearTimeout(timer);
  specialMenu.value = special;
  frame.contentWindow?.postMessage(
    { type: 'special', special },
    location.origin,
  );
}
const specialMenu = get<HTMLSelectElement>('preview-special');
specialMenu.innerHTML += Object.entries(specialPreviews)
  .map(([id, label]) => `<option value="${id}">${label}</option>`)
  .join('');
specialMenu.addEventListener('change', () => {
  if (Object.hasOwn(specialPreviews, specialMenu.value))
    playSpecial(specialMenu.value as SpecialPreview);
});
get('preview-replay').addEventListener('click', () => {
  if (Object.hasOwn(specialPreviews, specialMenu.value))
    playSpecial(specialMenu.value as SpecialPreview);
});
function preview() {
  clearTimeout(timer);
  timer = setTimeout(post, 100);
}
function renderList() {
  try {
    renderListContents();
  } catch (error) {
    console.error(error);
  }
}
function renderListContents() {
  closeFeature(false);
  document
    .querySelectorAll<HTMLElement>('.ed-kinds [data-kind]')
    .forEach((tab) =>
      tab.setAttribute('aria-selected', String(tab.dataset.kind === kind)),
    );
  get('card-list').innerHTML = listedCards(
    cards,
    kind,
    get<HTMLInputElement>('search').value,
  )
    .map((c) => {
      const meta =
        c.kind === 'story' || c.kind === 'fixed'
          ? c.trigger?.onCondition
            ? '조건부'
            : c.trigger?.scheduled
              ? '예약 전용'
              : c.trigger?.from !== undefined
                ? `${c.trigger.from}~${c.trigger.to}년`
                : c.trigger?.year !== undefined
                  ? `${c.trigger.year}년`
                  : ''
          : c.kind === 'daily'
            ? `난이도 ${c.tier}`
            : c.kind === 'speaki'
              ? '스피키'
              : '특수';
      const bad = errors.some((e) => e.startsWith(`[${cards.indexOf(c)}]`));
      return `<li><button class="ed-item" data-id="${escape(c.id)}" data-kind="${listTab(c)}" aria-current="${c === selected}"><span class="ed-dot"></span><b>${escape(materializeCard(c, cards).title ?? '')}</b><small>${meta}</small>${bad ? '<em class="ed-bad">!</em>' : ''}</button></li>`;
    })
    .join('');
  get('card-list')
    .querySelectorAll<HTMLElement>('.ed-item')
    .forEach((item) => {
      const card = cards.find((c) => c.id === item.dataset.id)!;
      const badges = document.createElement('span');
      badges.className = 'ed-badges';
      badges.innerHTML = badgeMarkup(cardFeatures(card, cards));
      // The HTML parser would move nested badge buttons outside the item button.
      item.querySelector('b')!.after(badges);
    });
  get('features').innerHTML = selected
    ? badgeMarkup(cardFeatures(selected, cards), true)
    : '';
}
function validate() {
  errors = validateCards(cards);
  const index = selected ? cards.indexOf(selected) : -1;
  const current = errors.filter(
    (e) => e.startsWith(`[${index}]`) || !e.startsWith('['),
  );
  get('errors').hidden = !current.length;
  get('errors').innerHTML = current
    .map((e) => `<li>${escape(koMessage(e))}</li>`)
    .join('');
  form
    .querySelectorAll('.invalid')
    .forEach((el) => el.classList.remove('invalid'));
  form
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('[id]')
    .forEach((el) => {
      const key = el.id.replace(/^f-/, '');
      const tokens = key.split('-');
      if (
        current.some(
          (message) =>
            tokens.every((token) => message.includes(token)) ||
            (key.startsWith('trigger-') && message.includes('trigger')) ||
            (key.startsWith('axe-') && message.includes('axeResult')) ||
            (key.startsWith('flags') && message.includes('condition flags')),
        )
      )
        el.closest('.ed-field')?.classList.add('invalid');
    });
  if (current.some((e) => /effects|delta|gauge/.test(e)))
    form
      .querySelectorAll('.ed-effects')
      .forEach((el) => el.closest('.ed-field')?.classList.add('invalid'));
  if (!copyEditor?.active) save.disabled = saving || errors.length > 0;
  renderList();
}
function select(card: Card | undefined) {
  try {
    closeFeature();
    selected = card;
    updatePreviewYear();
    form
      .querySelectorAll<
        | HTMLInputElement
        | HTMLButtonElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >('input,select,textarea,button')
      .forEach((el) => (el.disabled = !card));
    if (card) fillForm(form, card, cards);
    get('form-title').textContent = card
      ? (materializeCard(card, cards).title ?? '')
      : '';
    remember();
    validate();
  } catch (error) {
    console.error(error);
  } finally {
    preview();
  }
}
function changed() {
  dirty = true;
  revision++;
  status('dirty', '저장 안 된 변경 있음');
  remember();
  validate();
  preview();
}
function edit() {
  if (!selected) return;
  const oldKind = selected.kind;
  const oldAxe = selected.axe;
  const oldStamps = selected.stamps;
  let next: Card;
  try {
    next = readForm(form, selected);
  } catch (error) {
    errors = [String(error)];
    save.disabled = true;
    return;
  }
  cards[cards.indexOf(selected)] = next;
  selected = next;
  updatePreviewYear();
  if (oldKind !== next.kind || oldAxe !== next.axe || oldStamps !== next.stamps)
    fillForm(form, next, cards);
  else
    form
      .querySelectorAll<HTMLElement>('[data-axe]')
      .forEach((el) => (el.hidden = next.axe !== 'free'));
  get('form-title').textContent = materializeCard(next, cards).title ?? '';
  changed();
}
async function saveAll() {
  if (copyEditor.active) return copyEditor.save();
  if (saving || errors.length) return;
  saving = true;
  save.disabled = true;
  const version = revision;
  try {
    const response = await fetch('/__editor/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cards),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(
        result.errors?.map(koMessage).join(' / ') ?? response.statusText,
      );
    }
    if (version === revision) {
      dirty = false;
      status('saved', '저장됨');
    }
  } catch (error) {
    status(
      'error',
      `저장 실패: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    saving = false;
    validate();
  }
}
initializeForm(form);
form.addEventListener('input', edit);
form.addEventListener('change', edit);
form.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '.ed-steps button',
  );
  if (!button || button.disabled) return;
  button
    .parentElement!.querySelectorAll('button')
    .forEach((el) => el.setAttribute('aria-pressed', String(el === button)));
  edit();
});
get('card-list').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('.ed-badge')) return;
  const button = (event.target as HTMLElement).closest<HTMLElement>('.ed-item');
  if (button) select(cards.find((c) => c.id === button.dataset.id));
});
document.querySelectorAll<HTMLElement>('.ed-kinds [data-kind]').forEach((tab) =>
  tab.addEventListener('click', () => {
    kind = tab.dataset.kind!;
    remember();
    renderList();
  }),
);
get('search').addEventListener('input', renderList);
document.querySelectorAll<HTMLElement>('[data-new]').forEach((button) =>
  button.addEventListener('click', () => {
    const card = newCard(cards, button.dataset.new as Card['kind']);
    cards.push(card);
    kind = listTab(card);
    get<HTMLInputElement>('search').value = '';
    select(card);
    changed();
  }),
);
get('duplicate').addEventListener('click', () => {
  if (!selected) return;
  const card = duplicateCard(cards, selected);
  cards.push(card);
  kind = listTab(card);
  get<HTMLInputElement>('search').value = '';
  select(card);
  changed();
});
get('delete').addEventListener('click', () => {
  if (!selected || !confirm('이 이벤트를 삭제할까요?')) return;
  const index = cards.indexOf(selected);
  cards.splice(index, 1);
  select(cards[Math.min(index, cards.length - 1)]);
  changed();
});
document.querySelectorAll<HTMLElement>('[data-aim]').forEach((button) => {
  button.setAttribute('aria-pressed', String(button.dataset.aim === aim));
  button.addEventListener('click', () => {
    aim = button.dataset.aim as typeof aim;
    document
      .querySelectorAll<HTMLElement>('[data-aim]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el === button)));
    post();
  });
});
get('preview-bullet').addEventListener('click', () => {
  armed = !armed;
  get('preview-bullet').setAttribute('aria-pressed', String(armed));
  post();
});
{
  // 보유 shows the tag under 민심; "→ gauge" plays it on that gauge
  const select = get<HTMLSelectElement>('preview-bandage');
  select.insertAdjacentHTML(
    'beforeend',
    system.gauges
      .map((g) => `<option value="${g.key}">반창고 → ${g.label}</option>`)
      .join(''),
  );
  select.addEventListener('change', () => {
    bandage = select.value;
    post();
  });
}
get<HTMLSelectElement>('preview-scope').addEventListener('change', (event) => {
  scope = (event.target as HTMLSelectElement).value;
  post();
});
{
  const select = get<HTMLSelectElement>('preview-blindfold');
  select.insertAdjacentHTML(
    'beforeend',
    system.gauges
      .map((g) => `<option value="${g.key}">눈가리개 → ${g.label}</option>`)
      .join(''),
  );
  select.addEventListener('change', () => {
    blindfold = select.value;
    post();
  });
  for (const id of PREVIEW_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.item = id;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = system.boons[id].name;
    button.addEventListener('click', () => {
      items = items.includes(id)
        ? items.filter((i) => i !== id)
        : [...items, id];
      button.setAttribute('aria-pressed', String(items.includes(id)));
      post();
    });
    select.before(button);
  }
}
frame.addEventListener('load', post);
save.addEventListener('click', saveAll);
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveAll();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (dirty || copyEditor.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
const copyEditor = initializeCopyEditor({
  frame,
  save,
  status,
  switched: () => {
    status(
      dirty ? 'dirty' : 'saved',
      dirty ? '저장 안 된 변경 있음' : '저장됨',
    );
    validate();
    post();
  },
});
select(undefined);
save.disabled = true;
fetch('/__editor/cards')
  .then(async (response) => {
    if (!response.ok) throw new Error(response.statusText);
    cards = await response.json();
  })
  .catch((error) => {
    save.disabled = true;
    console.error(error);
  })
  .then(() => {
    if (!cards.length) return;
    select(
      cards.find((c) => c.id === rememberedId) ??
        listedCards(cards, kind)[0] ??
        cards[0],
    );
    status('saved', '저장됨');
  });
