// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../data/cards/m1.json';
import { initialState, type Card } from '../src/core/state';
import { SLEEP_TURNS } from '../src/core/config';
import { processDocument } from '../src/core/loop';
import { updateAimPreview } from '../src/ui/aim';
import {
  fillForm,
  initializeForm,
  readForm,
  switchKind,
} from '../src/editor/form';
import { cardFeatures } from '../src/editor/features';
import { validateCards } from '../tools/validate-cards';
import { classifyDeath, playerAction } from '../tools/simulate';

const daily: Card = {
  ...(raw.find((c) => c.kind === 'daily') as Card),
  id: 'daily',
  years: 1,
  conditions: undefined,
  reject: { label: 'no', effects: {} },
  approve: { label: 'yes', effects: {}, drowse: 1 },
};
const resolve = (
  overrides = {},
  action: 'approve' | 'reject' | 'axe' = 'approve',
  card = daily,
) =>
  processDocument(
    { ...initialState(), current: card, ...overrides },
    action,
    [daily],
    () => 0.9,
  );

describe('stamp drowse', () => {
  it.each(['approve', 'reject'] as const)(
    'advances once for the chosen %s stamp',
    (side) => {
      const card = {
        ...daily,
        [side]: daily.approve,
        [side === 'approve' ? 'reject' : 'approve']: daily.reject,
      };
      expect(resolve({}, side, card).drowse.stack).toBe(1);
      expect(
        resolve({ drowse: { stack: 1, left: 1 } }, side, card).drowse.stack,
      ).toBe(2);
      expect(
        resolve({}, side === 'approve' ? 'reject' : 'approve', card).drowse
          .stack,
      ).toBe(0);
      expect(resolve({}, 'axe', card).drowse.stack).toBe(1);
    },
  );

  it('forces normal sleep at stack two', () => {
    const next = resolve({ drowse: { stack: 2, left: 1 } });
    expect(next.sleep).toBe(SLEEP_TURNS);
    expect(next.drowse.stack).toBe(0);
  });

  it.each([0, 1, 2] as const)(
    'forces sleep immediately from stack %i with drowse 3',
    (stack) => {
      const card = {
        ...daily,
        approve: { ...daily.approve, drowse: 3 as const },
      };
      const next = resolve({ drowse: { stack, left: 1 } }, 'approve', card);
      const axeSleep = resolve({ drowse: { stack: 2, left: 1 } }, 'axe');
      expect(next.sleep).toBe(SLEEP_TURNS);
      expect(next.drowse).toEqual(axeSleep.drowse);
      expect(next.drowse).toEqual({ stack: 0, left: 0 });
      const asleep = resolve(
        { sleep: 2, drowse: { stack, left: 1 } },
        'approve',
        card,
      );
      expect(asleep.sleep).toBe(1);
      expect(asleep.drowse).toEqual({ stack, left: 1 });
    },
  );

  it.each([0, 1, 2] as const)(
    'counts drowse 2 as two axe uses from stack %i, stopping at sleep',
    (stack) => {
      const card = {
        ...daily,
        approve: { ...daily.approve, drowse: 2 as const },
      };
      const next = resolve({ drowse: { stack, left: 1 } }, 'approve', card);
      expect(next.sleep).toBe(stack === 0 ? 0 : SLEEP_TURNS);
      expect(next.drowse.stack).toBe(stack === 0 ? 2 : 0);
    },
  );

  it('ignores drowse while Erpin stamps and on free axe documents', () => {
    const drowse = { stack: 2, left: 1 };
    const next = resolve({ drowse, sleep: 2 });
    expect(next.sleep).toBe(1);
    expect(next.drowse).toEqual(drowse);
    expect(resolve({}, 'approve', { ...daily, axe: 'free' }).drowse.stack).toBe(
      1,
    ); // Fooled counts once.
    expect(resolve({}, 'axe', { ...daily, axe: 'free' }).drowse.stack).toBe(0);
  });

  it('keeps simulator policies and death classification working', () => {
    const state = { ...initialState(), current: daily };
    for (const policy of ['careful', 'balanced'] as const)
      expect(['reject', 'approve']).toContain(
        playerAction(state, policy, () => 0.5),
      );
    expect(classifyDeath(state)).toBe('avoidable');
    expect(classifyDeath({ ...state, sleep: 1 })).toBe('asleep');
    expect(
      classifyDeath({
        ...state,
        current: {
          ...daily,
          axe: false,
          reject: { ...daily.approve, effects: { sugar: -20 } },
          approve: { ...daily.approve, effects: { sugar: -20 } },
        },
        gauges: { ...state.gauges, sugar: 10 },
      }),
    ).toBe('unavoidable');
  });
});

describe('drowse validation', () => {
  it.each(['fixed', 'daily', 'special'] as const)(
    'accepts values 1 through 3 on %s',
    (kind) => {
      const card = switchKind(daily, kind);
      for (const drowse of [1, 2, 3] as const)
        expect(
          validateCards([{ ...card, approve: { ...card.approve, drowse } }]),
        ).toEqual([]);
    },
  );
  it.each([0, -1, 4, 1.5, '1', null, undefined, true])(
    'rejects invalid value %s',
    (drowse) => {
      expect(
        validateCards([{ ...daily, approve: { ...daily.approve, drowse } }]),
      ).toContain('[0] drowse must be an integer from 1 to 3');
    },
  );
  it.each(['story', 'speaki'] as const)('forbids drowse on %s', (kind) => {
    const card = switchKind(daily, kind);
    expect(validateCards([{ ...card, approve: daily.approve }])).toContain(
      '[0] drowse is only allowed on fixed/daily/special cards',
    );
  });
  it('rejects choice overrides on mimic cards', () => {
    expect(
      validateCards([
        daily,
        {
          id: 'fake',
          kind: 'speaki',
          mimic: daily.id,
          text: 'fake',
          axe: 'free',
          approve: daily.approve,
        },
      ]),
    ).toContain('[1] mimic cards must not define approve');
  });
});

it('adds and clears the shared aim preview threat', () => {
  const root = document.createElement('div');
  root.innerHTML = '<div class="drowse"></div>';
  const indicator = root.querySelector('.drowse')!;
  for (const aim of ['reject', 'axe', 'alice', null] as const) {
    updateAimPreview(root, daily, 'approve');
    expect(indicator.classList.contains('threat')).toBe(true);
    updateAimPreview(root, daily, aim);
    expect(indicator.classList.contains('threat')).toBe(false);
  }
  updateAimPreview(root, null, 'approve');
  expect(indicator.classList.contains('threat')).toBe(false);
  updateAimPreview(root, daily, 'approve', false, {
    ...initialState(),
    sleep: 1,
  });
  expect(indicator.classList.contains('threat')).toBe(false);
  updateAimPreview(root, { ...daily, axe: 'free' }, 'approve');
  expect(indicator.classList.contains('threat')).toBe(false);
});

it('round trips both editor selects, clears them, and strips unsupported kinds', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.getElementById('form')!;
  initializeForm(root);
  const card = { ...daily, reject: { ...daily.reject, drowse: 2 as const } };
  fillForm(root, card);
  expect(readForm(root, card)).toEqual(card);
  for (const side of ['reject', 'approve'] as const) {
    const select = root.querySelector<HTMLSelectElement>(`#${side}-drowse`)!;
    expect(select.value).toBe(String(card[side].drowse));
    select.value = '0';
    expect(readForm(root, card)[side]).not.toHaveProperty('drowse');
    fillForm(root, daily);
    select.value = '1';
    expect(readForm(root, daily)[side].drowse).toBe(1);
  }
  for (const kind of ['story', 'speaki'] as const) {
    const switched = switchKind(card, kind);
    expect(switched.approve).not.toHaveProperty('drowse');
    expect(switched.reject).not.toHaveProperty('drowse');
    fillForm(root, switched);
    expect(
      root.querySelector<HTMLInputElement>('#approve-drowse')!.disabled,
    ).toBe(true);
  }
});

it('shows the drowse badge and the affected stamp', () => {
  const features = cardFeatures({ ...daily, reject: daily.approve }, []).filter(
    (f) => f.kind === 'drowse',
  );
  expect(features).toHaveLength(2);
  for (const [index, side] of ['반려', '승인'].entries()) {
    expect(features[index]).toMatchObject({ icon: '☾', title: '졸음 +1' });
    expect(features[index]!.body).toContain(side);
    expect(features[index]!.body).toContain(
      '이 도장을 찍으면 도끼를 한 번 쓴 것처럼 졸음이 한 칸 쌓입니다. 졸음이 이미 두 칸이면 바로 잠들어 버립니다.',
    );
  }
});

it('round trips every drowse select option on either choice', () => {
  document.body.innerHTML = readFileSync('editor.html', 'utf8');
  const root = document.getElementById('form')!;
  initializeForm(root);
  for (const side of ['reject', 'approve'] as const) {
    for (const drowse of [1, 2, 3] as const) {
      const card = { ...daily, [side]: { ...daily[side], drowse } };
      fillForm(root, card);
      expect(readForm(root, card)).toEqual(card);
    }
  }
});

it('shows forced sleep badges and clears both aim threat classes outside the selected awake stamp', () => {
  const card = { ...daily, approve: { ...daily.approve, drowse: 3 as const } };
  expect(cardFeatures(card, []).find((f) => f.kind === 'drowse')).toMatchObject(
    {
      title: '강제 수면',
      body: '이 도장을 찍으면 네르가 그 자리에서 잠들어 버립니다. 몇 장 동안 에르핀이 대신 도장을 찍습니다.',
    },
  );
  expect(
    cardFeatures({ ...card, approve: { ...card.approve, drowse: 2 } }, []).find(
      (f) => f.kind === 'drowse',
    )?.title,
  ).toBe('졸음 +2');
  const root = document.createElement('div');
  root.innerHTML = '<div class="drowse"></div>';
  const indicator = root.querySelector('.drowse')!;
  for (const aim of ['reject', 'axe', 'alice', null] as const) {
    updateAimPreview(root, card, 'approve');
    expect(indicator.classList.contains('threat')).toBe(true);
    expect(indicator.classList.contains('sleep-threat')).toBe(true);
    updateAimPreview(root, card, aim);
    expect(indicator.className).toBe('drowse');
  }
  updateAimPreview(root, card, 'approve', false, {
    ...initialState(),
    sleep: 1,
  });
  expect(indicator.className).toBe('drowse');
  updateAimPreview(root, daily, 'approve');
  expect(indicator.classList.contains('threat')).toBe(true);
  expect(indicator.classList.contains('sleep-threat')).toBe(false);
});
