import system from '../../data/system.json';
import { materializeCard } from '../core/deck';
import type { Card, Gauge, Status } from '../core/state';
import { escape } from '../ui/art';
import { maskUrl } from '../ui/gauges';

export const commaList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
export function uniqueId(cards: Card[], kind: Card['kind']): string {
  let n = 1;
  while (cards.some((c) => c.id === `${kind}_new_${n}`)) n++;
  return `${kind}_new_${n}`;
}
export function switchKind(card: Card, kind: Card['kind']): Card {
  const c = structuredClone(card);
  c.kind = kind;
  if (kind !== 'daily') delete c.tier;
  if (kind !== 'story' && kind !== 'fixed') delete c.look;
  if (kind !== 'special') {
    delete c.repeatable;
    delete c.period;
    delete c.realSpeaker;
  }
  if (kind === 'story' || kind === 'fixed') {
    c.trigger ??= { year: 0, order: 0 };
    if (kind === 'fixed') c.years = Math.max(1, c.years);
    c.axe = false;
    delete c.axeResult;
    if (kind === 'story') {
      c.reject.effects = {};
      c.approve.effects = {};
      delete c.reject.status;
      delete c.approve.status;
    }
  } else {
    delete c.trigger;
    if (kind !== 'daily') delete c.variant;
    delete c.stamps;
    if (kind === 'daily') {
      c.tier = 1;
      c.axe = true;
      delete c.axeResult;
    } else {
      c.axe = 'free';
      c.axeResult ??= {};
      c.axeResult.scene ??= Object.keys(system.scenes)[0]!;
    }
    c.years = Math.max(1, c.years);
  }
  if (kind === 'story' || kind === 'speaki') {
    delete c.reject.drowse;
    delete c.approve.drowse;
  }
  return c;
}
export function newCard(cards: Card[], kind: Card['kind']): Card {
  return switchKind(
    {
      id: uniqueId(cards, kind),
      kind,
      speaker: Object.keys(system.speakers)[0]!,
      faction: Object.keys(system.factions)[0]!,
      title: '',
      text: '',
      years: 1,
      axe: true,
      reject: { label: '', effects: {} },
      approve: { label: '', effects: {} },
    },
    kind,
  );
}
export function duplicateCard(cards: Card[], card: Card): Card {
  return { ...structuredClone(card), id: uniqueId(cards, card.kind) };
}
// Reward documents (look 'special') sit in the special tab and the tricky ones
// (look 'hard') in the hard tab, whatever kind the engine runs them as.
export const listTab = (c: Card): string =>
  c.look === 'special' || c.look === 'hard' ? c.look : c.kind;
export function listedCards(cards: Card[], kind = 'all', search = ''): Card[] {
  const names = system.speakers as Record<string, { name: string }>;
  const query = search.toLocaleLowerCase();
  const group = (c: Card) => {
    const tab = listTab(c);
    return tab === 'daily'
      ? 1
      : tab === 'special' || tab === 'hard'
        ? 2
        : tab === 'speaki'
          ? 3
          : 0;
  };
  const start = (c: Card) =>
    c.trigger?.from ?? c.trigger?.year ?? c.conditions?.minYear ?? Infinity;
  return cards
    .filter(
      (c) =>
        (kind === 'all' || listTab(c) === kind) &&
        [
          materializeCard(c, cards).title ?? '',
          c.text,
          names[c.speaker]?.name ?? '',
          names[c.realSpeaker ?? '']?.name ?? '',
        ].some((s) => s.toLocaleLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        (group(a) === 0
          ? (a.trigger?.year ?? 0) - (b.trigger?.year ?? 0) ||
            (a.trigger?.order ?? 0) - (b.trigger?.order ?? 0)
          : group(a) === 1
            ? (a.tier ?? 1) - (b.tier ?? 1) ||
              a.title.localeCompare(b.title, 'ko')
            : group(a) === 2
              ? start(a) - start(b) || 0
              : 0),
    );
}
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const field = (root: HTMLElement, id: string) =>
  root.querySelector<Field>(`#${id}`)!;
const textFields = ['id', 'speaker', 'faction', 'title', 'text'] as const;
const replanFields = ['pool', 'boss', 'bossPhase', 'bossAfter', 'bossAt', 'status'] as const;
const resultFields = [
  'mend',
  'witchPress',
  'witchDrift',
  'grant',
  'schedule',
] as const;
export function initializeForm(root: HTMLElement): void {
  if (!field(root, 'f-safe')) root.insertAdjacentHTML('beforeend', '<label><input id="f-safe" type="checkbox" />안전 (이 공문으로는 끝나지 않음)</label>');
  for (const key of [
    ...replanFields,
    ...(['reject', 'approve'] as const).flatMap((side) =>
      resultFields.map((key) => `${side}-${key}`),
    ),
  ]) {
    if (!field(root, `replan-${key}`))
      root.insertAdjacentHTML(
        'beforeend',
        `<label>${key} (JSON)<textarea id="replan-${key}"></textarea></label>`,
      );
  }
  if (!field(root, 'f-variant-group'))
    root.insertAdjacentHTML(
      'beforeend',
      `<fieldset data-kinds="story fixed daily"><legend>엘프 변형 (그룹)</legend>
      <label>그룹 <input id="f-variant-group" /></label>
      <label>? <input id="f-variant-pool" type="number" min="1" step="1" /></label></fieldset>`,
    );
  if (!field(root, 'f-kind').querySelector('[value="speaki"]'))
    field(root, 'f-kind').insertAdjacentHTML(
      'beforeend',
      '<option value="speaki">Speaki</option>',
    );
  const options = (values: Record<string, string>) =>
    Object.entries(values)
      .map(
        ([key, label]) =>
          `<option value="${escape(key)}">${escape(label)}</option>`,
      )
      .join('');
  const speakers = Object.fromEntries(
    Object.entries(system.speakers).map(([k, v]) => [k, v.name]),
  );
  field(root, 'f-speaker').innerHTML = options(speakers);
  field(root, 'f-realSpeaker').innerHTML =
    '<option value=""></option>' + options(speakers);
  field(root, 'f-faction').innerHTML = options(system.factions);
  field(root, 'f-axe-scene').innerHTML = options(
    Object.fromEntries(
      Object.entries(system.scenes).map(([k, v]) => [k, v.title]),
    ),
  );
  for (const side of ['reject', 'approve'] as const) {
    if (!field(root, `${side}-status-id`)) {
      const gauges =
        '<option value=""></option>' +
        system.gauges
          .map((g) => `<option value="${g.key}">${escape(g.label)}</option>`)
          .join('');
      root.querySelector(`.${side}`)!.insertAdjacentHTML(
        'beforeend',
        `<fieldset class="ed-status"><legend>지속 효과</legend>
        <label>효과 <select id="${side}-status-id"><option value="">없음</option>${Object.entries(
          system.statuses,
        )
          .map(
            ([id, copy]) =>
              `<option value="${id}">${escape(copy.name)}</option>`,
          )
          .join('')}</select></label>
        <label>바닥 <input id="${side}-status-floor" type="number" /></label>
        <label>문서 수 <input id="${side}-status-turns" type="number" min="1" max="12" step="1" /></label>
        ${(['tick', 'delayed'] as const).map((key) => `<div>${key === 'tick' ? '매 문서' : '종료 시'} ${system.gauges.map((g) => `<label>${escape(g.label)} <input id="${side}-status-${key}-${g.key}" type="number" min="${key === 'tick' ? -5 : -25}" max="${key === 'tick' ? 5 : 25}" step="${key === 'tick' ? 1 : 5}" /></label>`).join('')}</div>`).join('')}
        <label>배율 자원 <select id="${side}-status-scale">${gauges}</select></label><label>배율 <select id="${side}-status-factor"><option value="0.5">0.5</option><option value="1.5">1.5</option></select></label>
        <label>동결 <select id="${side}-status-freeze">${gauges}</select></label>
        <label><input id="${side}-status-axeLock" type="checkbox" />도끼 잠금</label><label><input id="${side}-status-drowseReset" type="checkbox" />종료 시 졸음 초기화</label></fieldset>`,
      );
    }
    for (const [key, label] of [['witchPress-amount', '프리클: 누르는 양'], ['witchPress-floor', '프리클: 하한'], ['witchDrift-perDoc', '피코라: 공문당 이동'], ['witchDrift-turns', '피코라: 지속 공문 수']] as const)
      if (!field(root, `${side}-${key}`)) root.querySelector(`.${side}`)!.insertAdjacentHTML('beforeend', `<label>${label} <input id="${side}-${key}" type="number" min="0" /></label>`);
    if (!field(root, `${side}-grant-boon`)) {
      root.querySelector(`.${side}`)!.insertAdjacentHTML('beforeend', `<label>아이템 <select id="${side}-grant-boon"><option value="">없음</option>${Object.entries(system.boons).map(([id, boon]) => `<option value="${escape(id)}">${escape(boon.name)}</option>`).join('')}</select></label>`);
      field(root, `${side}-grant-boon`).addEventListener('change', () => {
        const boon = field(root, `${side}-grant-boon`).value;
        field(root, `replan-${side}-grant`).value = boon ? JSON.stringify({ boon, ...(['hyean', 'intuition'].includes(boon) ? { uses: 1 } : {}) }) : '';
        root.querySelector<HTMLElement>(`[data-grant-uses="${side}"]`)!.hidden = !['hyean', 'intuition'].includes(boon);
        field(root, `${side}-grant-uses`).value = boon ? '1' : '';
      });
    }
    if (!field(root, `${side}-grant-uses`))
      root
        .querySelector(`.${side}`)!
        .insertAdjacentHTML(
          'beforeend',
          `<label hidden data-grant-uses="${side}">횟수 <input id="${side}-grant-uses" type="number" min="1" step="1" /></label>`,
        );
  }
  root.querySelectorAll<HTMLElement>('.ed-effects').forEach((el) => {
    el.innerHTML = system.gauges
      .map(
        ({ key, label }) =>
          `<div class="ed-effect" data-gauge="${key}"><span class="ed-icon" style="--icon:url('${maskUrl(key as Gauge)}')"></span><span>${escape(label)}</span><div class="ed-steps">${[-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25].map((v) => `<button type="button" data-value="${v}" aria-pressed="${v === 0}"${Math.abs(v) === 25 ? ' hidden disabled' : ''}>${v > 0 ? '+' + v : v}</button>`).join('')}</div></div>`,
      )
      .join('');
  });
}
export function fillForm(
  root: HTMLElement,
  source: Card,
  cards: Card[] = [],
): void {
  const card = materializeCard(source, cards);
  for (const key of replanFields)
    field(root, `replan-${key}`).value = JSON.stringify(card[key]) ?? '';
  for (const side of ['reject', 'approve'] as const)
    for (const key of resultFields)
      field(root, `replan-${side}-${key}`).value =
        JSON.stringify(card[side][key]) ?? '';
  root
    .querySelectorAll<Field | HTMLButtonElement>('input,select,textarea,button')
    .forEach(
      (el) =>
        (el.disabled =
          !!source.mimic &&
          !['f-id', 'f-text', 'f-minYear', 'f-maxYear'].includes(el.id)),
    );
  root.classList.remove(
    'kind-story',
    'kind-fixed',
    'kind-daily',
    'kind-special',
    'kind-speaki',
  );
  root.classList.add(`kind-${card.kind}`);
  for (const key of textFields) field(root, `f-${key}`).value = card[key];
  for (const [id, value] of Object.entries({
    'variant-group': card.variant?.group,
    'variant-pool': card.variant?.pool,
    kind: card.kind,
    realSpeaker: card.realSpeaker,
    'trigger-type': card.trigger?.onCondition
      ? 'onCondition'
      : card.trigger?.scheduled
        ? 'scheduled'
        : card.trigger?.after !== undefined
          ? 'after'
          : card.trigger?.from !== undefined
            ? 'window'
            : 'year',
    'trigger-year': card.trigger?.year,
    'trigger-order': card.trigger?.order,
    tier: card.tier,
    weight: card.weight,
    years: card.years,
    axe: String(card.axe),
    'axe-scene': card.axeResult?.scene,
    'axe-flags': card.axeResult?.setFlags?.join(', '),
    minYear: card.conditions?.minYear,
    maxYear: card.conditions?.maxYear,
    flagsAll: card.conditions?.flagsAll?.join(', '),
    flagsNone: card.conditions?.flagsNone?.join(', '),
  }))
    field(root, `f-${id}`).value = value === undefined ? '' : String(value);
  (field(root, 'f-safe') as HTMLInputElement).checked = !!card.safe;
  (field(root, 'f-repeatable') as HTMLInputElement).checked =
    card.repeatable ?? false;
  field(root, 'f-look').value = card.look ?? '';
  field(root, 'f-stamps').value = card.stamps ?? '';
  for (const side of ['reject', 'approve'] as const)
    root.querySelector(`.${side} .ed-choice-name`)!.textContent =
      card.stamps === 'meet'
        ? '손을 내민다'
        : card.stamps === 'light'
          ? '빛으로'
          : card.stamps === 'direction'
            ? side === 'reject'
              ? '왼쪽'
              : '오른쪽'
            : side === 'reject' && card.kind !== 'story'
              ? '반려'
              : '승인';
  for (const side of ['reject', 'approve'] as const) {
    for (const [key, value] of Object.entries({ 'witchPress-amount': card[side].witchPress?.amount, 'witchPress-floor': card[side].witchPress?.floor, 'witchDrift-perDoc': card[side].witchDrift?.perDoc, 'witchDrift-turns': card[side].witchDrift?.turns }))
      field(root, `${side}-${key}`).value = value === undefined ? '' : String(value);
    field(root, `${side}-grant-boon`).value = card[side].grant?.boon ?? '';
    const status = card[side].status;
    for (const [key, value] of Object.entries({
      id: status?.id,
      turns: status?.turns ?? 1,
      floor: status?.floor,
      scale: status?.scale?.gauge,
      factor: status?.scale?.factor ?? 0.5,
      freeze: status?.freeze,
    }))
      field(root, `${side}-status-${key}`).value = String(value ?? '');
    for (const key of ['tick', 'delayed'] as const)
      for (const g of system.gauges)
        field(root, `${side}-status-${key}-${g.key}`).value = String(
          status?.[key]?.[g.key as Gauge] ?? '',
        );
    for (const key of ['axeLock', 'drowseReset'] as const)
      (field(root, `${side}-status-${key}`) as HTMLInputElement).checked =
        !!status?.[key];
    root.querySelector<HTMLFieldSetElement>(`.${side} .ed-status`)!.disabled =
      card.kind === 'story' || !!source.mimic;
    root.querySelector<HTMLElement>(`[data-grant-uses="${side}"]`)!.hidden =
      !['hyean', 'intuition'].includes(card[side].grant?.boon ?? '');
    field(root, `${side}-grant-uses`).value = String(
      card[side].grant?.uses ?? '',
    );
    const drowse = field(root, `${side}-drowse`);
    drowse.value = String(card[side].drowse ?? 0);
    drowse.disabled =
      !!source.mimic || card.kind === 'story' || card.kind === 'speaki';
    field(root, `${side}-label`).value = card[side].label;
    field(root, `${side}-flags`).value = card[side].setFlags?.join(', ') ?? '';
    root
      .querySelectorAll<HTMLButtonElement>(
        `.ed-effects[data-side="${side}"] button`,
      )
      .forEach((button) => {
        const gauge = button.closest<HTMLElement>('[data-gauge]')!.dataset
          .gauge as Gauge;
        const adjustOnly = Math.abs(Number(button.dataset.value)) === 25;
        button.hidden =
          adjustOnly &&
          card[side].adjust === undefined &&
          card.look !== 'special';
        button.disabled =
          !!source.mimic || card.kind === 'story' || button.hidden;
        button.setAttribute(
          'aria-pressed',
          String(
            Number(button.dataset.value) ===
              (card.kind === 'story' ? 0 : (card[side].effects[gauge] ?? 0)),
          ),
        );
      });
  }
  field(root, 'f-axe').disabled =
    card.kind === 'story' || card.kind === 'speaki';
  for (const option of (field(root, 'f-axe') as HTMLSelectElement).options)
    option.disabled =
      card.kind === 'fixed'
        ? !['false', 'true', 'bullet'].includes(option.value)
        : option.value === 'bullet';
  root
    .querySelectorAll<HTMLElement>('[data-kinds]')
    .forEach(
      (el) => (el.hidden = !el.dataset.kinds!.split(' ').includes(card.kind)),
    );
  root
    .querySelectorAll<HTMLElement>('[data-axe]')
    .forEach((el) => (el.hidden = card.axe !== 'free'));
}
export function readForm(root: HTMLElement, previous: Card): Card {
  const c = structuredClone(previous);
  const value = (id: string) => field(root, id).value;
  const conditions = { ...c.conditions };
  for (const key of ['minYear', 'maxYear'] as const) {
    if (value(`f-${key}`) !== '') conditions[key] = Number(value(`f-${key}`));
    else delete conditions[key];
  }
  if (Object.keys(conditions).length) c.conditions = conditions;
  else delete c.conditions;
  if (previous.kind === 'speaki' && previous.mimic) {
    c.id = value('f-id');
    c.text = value('f-text');
    return c;
  }
  for (const key of textFields) c[key] = value(`f-${key}`);
  c.years = Number(value('f-years'));
  if (
    (c.kind === 'story' || c.kind === 'fixed' || c.kind === 'daily') &&
    value('f-variant-group').trim()
  )
    c.variant = {
      group: value('f-variant-group').trim(),
      pool: Number(value('f-variant-pool')),
    };
  else delete c.variant;
  const look = value('f-look') as NonNullable<Card['look']> | '';
  if ((c.kind === 'story' || c.kind === 'fixed') && look) c.look = look;
  else delete c.look;
  if (
    (c.kind === 'story' || c.kind === 'fixed') &&
    ['direction', 'light', 'meet'].includes(value('f-stamps'))
  )
    c.stamps = value('f-stamps') as Card['stamps'];
  else delete c.stamps;
  if ((field(root, 'f-safe') as HTMLInputElement).checked) c.safe = true;
  else delete c.safe;
  if (value('f-realSpeaker')) c.realSpeaker = value('f-realSpeaker');
  else delete c.realSpeaker;
  if (c.kind === 'story' || c.kind === 'fixed') {
    const previousTrigger = { ...c.trigger } as Record<string, unknown>;
    for (const key of [
      'year',
      'from',
      'to',
      'after',
      'years',
      'scheduled',
      'onCondition',
      'order',
    ])
      delete previousTrigger[key];
    const type = value('f-trigger-type');
    const order = Number(value('f-trigger-order'));
    if (type === 'onCondition') c.trigger = { onCondition: true, order };
    else if (type === 'year')
      c.trigger = { year: Number(value('f-trigger-year')), order };
    else if (type === 'scheduled') c.trigger = { scheduled: true, order };
    else if (type === 'after')
      c.trigger = {
        after: c.trigger?.after ?? '',
        years: c.trigger?.years ?? 0,
        order,
      };
    else
      c.trigger = { from: c.trigger?.from ?? 0, to: c.trigger?.to ?? 0, order };
    c.trigger = { ...previousTrigger, ...c.trigger };
  }
  if (c.kind === 'daily') c.tier = Number(value('f-tier')) as Card['tier'];
  if (value('f-weight')) c.weight = Number(value('f-weight'));
  else delete c.weight;
  if (
    c.kind === 'special' &&
    ((field(root, 'f-repeatable') as HTMLInputElement).checked ||
      'repeatable' in c)
  )
    c.repeatable = (field(root, 'f-repeatable') as HTMLInputElement).checked;
  c.axe =
    c.kind === 'speaki'
      ? 'free'
      : c.kind === 'story'
        ? false
        : c.kind === 'fixed'
          ? value('f-axe') === 'bullet'
            ? 'bullet'
            : value('f-axe') === 'true'
          : value('f-axe') === 'free'
            ? 'free'
            : value('f-axe') === 'true';
  const assignList = (
    target: { [key: string]: unknown },
    key: string,
    id: string,
  ) => {
    const list = commaList(value(id));
    if (list.length) target[key] = list;
    else delete target[key];
  };
  for (const side of ['reject', 'approve'] as const) {
    const statusId = value(`${side}-status-id`);
    if (statusId && c.kind !== 'story') {
      const status: Status = {
        id: statusId,
        turns: Number(value(`${side}-status-turns`)),
      };
      for (const key of ['tick', 'delayed'] as const) {
        const effects: Partial<Record<Gauge, number>> = {};
        for (const g of system.gauges) {
          const n = Number(value(`${side}-status-${key}-${g.key}`));
          if (n) effects[g.key as Gauge] = n;
        }
        if (Object.keys(effects).length) status[key] = effects;
      }
      if (value(`${side}-status-floor`) !== '') status.floor = Number(value(`${side}-status-floor`));
      const scale = value(`${side}-status-scale`) as Gauge;
      if (scale)
        status.scale = {
          gauge: scale,
          factor: Number(value(`${side}-status-factor`)) as 0.5 | 1.5,
        };
      const freeze = value(`${side}-status-freeze`) as Gauge;
      if (freeze) status.freeze = freeze;
      for (const key of ['axeLock', 'drowseReset'] as const)
        if ((field(root, `${side}-status-${key}`) as HTMLInputElement).checked)
          status[key] = true;
      c[side].status = status;
    } else delete c[side].status;
    if ((c[side].grant?.boon === 'hyean' || c[side].grant?.boon === 'intuition'))
      c[side].grant.uses = Number(value(`${side}-grant-uses`));
    c[side].label = value(`${side}-label`);
    if (
      Number(value(`${side}-drowse`)) &&
      c.kind !== 'story' &&
      c.kind !== 'speaki'
    )
      c[side].drowse = Number(value(`${side}-drowse`)) as 1 | 2 | 3;
    else delete c[side].drowse;
    assignList(
      c[side] as unknown as Record<string, unknown>,
      'setFlags',
      `${side}-flags`,
    );
    if (c.kind === 'story') c[side].effects = {};
    else c[side].effects = { ...c[side].effects };
    if (c.kind !== 'story')
      root
        .querySelectorAll<HTMLButtonElement>(
          `.ed-effects[data-side="${side}"] [aria-pressed="true"]`,
        )
        .forEach((button) => {
          const v = Number(button.dataset.value);
          const gauge = button.closest<HTMLElement>('[data-gauge]')!.dataset
            .gauge as Gauge;
          if (v) c[side].effects[gauge] = v;
          else delete c[side].effects[gauge];
        });
  }
  assignList(conditions, 'flagsAll', 'f-flagsAll');
  assignList(conditions, 'flagsNone', 'f-flagsNone');
  if (Object.keys(conditions).length) c.conditions = conditions;
  else delete c.conditions;
  if (c.axe === 'free') {
    c.axeResult = {
      ...c.axeResult,
      scene: value('f-axe-scene') || Object.keys(system.scenes)[0]!,
    };
    assignList(c.axeResult, 'setFlags', 'f-axe-flags');
  } else delete c.axeResult;
  const assignJSON = (target: object, key: string, id: string) => {
    const input = field(root, id);
    const text = value(id).trim();
    input.setCustomValidity('');
    if (text) {
      try {
        Object.assign(target, { [key]: JSON.parse(text) });
      } catch (error) {
        input.setCustomValidity(String(error));
        throw error;
      }
    } else delete (target as Record<string, unknown>)[key];
  };
  for (const key of replanFields) assignJSON(c, key, `replan-${key}`);
  for (const side of ['reject', 'approve'] as const)
    for (const key of resultFields) {
      if (
        key === 'grant' &&
        (previous[side].grant?.boon === 'hyean' || previous[side].grant?.boon === 'intuition') &&
        value(`replan-${side}-grant`) === JSON.stringify(previous[side].grant)
      )
        continue;
      assignJSON(c[side], key, `replan-${side}-${key}`);
    }
  for (const side of ['reject', 'approve'] as const) {
    if ((c[side].grant?.boon === 'hyean' || c[side].grant?.boon === 'intuition') && field(root, `${side}-grant-boon`).value === c[side].grant?.boon) c[side].grant!.uses = Number(value(`${side}-grant-uses`));
    if (c[side].witchPress) c[side].witchPress = { amount: Number(value(`${side}-witchPress-amount`)), floor: Number(value(`${side}-witchPress-floor`)) };
    if (c[side].witchDrift) c[side].witchDrift = { perDoc: Number(value(`${side}-witchDrift-perDoc`)), turns: Number(value(`${side}-witchDrift-turns`)) };
  }
  const kind = value('f-kind') as Card['kind'];
  return kind === c.kind ? c : switchKind(c, kind);
}
