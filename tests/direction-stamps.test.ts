import { expect, it } from 'vitest';
import cards from '../data/cards/m1.json';
import { validateCards } from '../tools/validate-cards';
import { koMessage } from '../src/editor/messages';

it('gives all four escape cards direction stamps', () => {
  expect(
    cards
      .filter(
        (card) =>
          card.stamps === 'direction' && card.id.startsWith('story_escape_'),
      )
      .map((card) => card.id),
  ).toEqual([
    'story_escape_1',
    'story_escape_2',
    'story_escape_3',
    'story_escape_4',
  ]);
  for (let n = 1; n <= 4; n++)
    expect(
      cards.find((card) => card.id === `story_escape_${n}`),
    ).toHaveProperty('stamps', 'direction');
});

it.each(['story', 'fixed'])('accepts direction stamps on %s cards', (kind) => {
  const card = {
    ...cards.find((c) => c.id === 'story_escape_1')!,
    kind,
    years: 1,
  };
  expect(validateCards([card])).toEqual([]);
});

it.each(['left', '', true, null, 1])(
  'rejects invalid stamps value %s',
  (stamps) => {
    const card = { ...cards.find((c) => c.id === 'story_escape_1')!, stamps };
    expect(validateCards([card])).toContain(
      '[0] stamps must be direction, light or meet',
    );
  },
);

it.each(['daily', 'special', 'speaki'])(
  'rejects direction stamps on %s cards',
  (kind) => {
    const card = {
      ...cards.find((c) => c.kind === kind)!,
      stamps: 'direction',
    };
    expect(validateCards([card])).toContain(
      '[0] stamps is only allowed on story/fixed cards',
    );
  },
);

it.each(['reject', 'approve'])(
  'requires the %s choice for direction stamps',
  (side) => {
    const card = {
      ...cards.find((c) => c.id === 'story_escape_1')!,
      [side]: undefined,
    };
    expect(validateCards([card])).toContain(
      '[0] stamps requires both reject and approve',
    );
  },
);

it('translates direction stamp validation errors for the editor', () => {
  for (const message of [
    'stamps must be direction, light or meet',
    'stamps is only allowed on story/fixed cards',
    'stamps requires both reject and approve',
  ])
    expect(koMessage(`[0] ${message}`)).not.toBe(message);
});

it('gives the light finale light stamps', () => {
  expect(cards.find((card) => card.id === 'story_finale_light')).toHaveProperty(
    'stamps',
    'light',
  );
});
it.each(['story', 'fixed'])('accepts light stamps on %s cards', (kind) => {
  const card = {
    ...cards.find((c) => c.id === 'story_escape_1')!,
    stamps: 'light',
    kind,
    years: 1,
  };
  expect(validateCards([card])).toEqual([]);
});

it.each(['daily', 'special', 'speaki'])(
  'rejects light stamps on %s cards',
  (kind) => {
    const card = {
      ...cards.find((c) => c.kind === kind)!,
      stamps: 'light',
    };
    expect(validateCards([card])).toContain(
      '[0] stamps is only allowed on story/fixed cards',
    );
  },
);

it.each(['reject', 'approve'])(
  'requires the %s choice for light stamps',
  (side) => {
    const card = {
      ...cards.find((c) => c.id === 'story_escape_1')!,
      stamps: 'light',
      [side]: undefined,
    };
    expect(validateCards([card])).toContain(
      '[0] stamps requires both reject and approve',
    );
  },
);

it('gives the stranger finale meet stamps', () => {
  expect(
    cards.find((card) => card.id === 'story_finale_stranger'),
  ).toHaveProperty('stamps', 'meet');
});
it.each(['story', 'fixed'])('accepts meet stamps on %s cards', (kind) => {
  const card = {
    ...cards.find((c) => c.id === 'story_escape_1')!,
    stamps: 'meet',
    kind,
    years: 1,
  };
  expect(validateCards([card])).toEqual([]);
});

it.each(['daily', 'special', 'speaki'])(
  'rejects meet stamps on %s cards',
  (kind) => {
    const card = {
      ...cards.find((c) => c.kind === kind)!,
      stamps: 'meet',
    };
    expect(validateCards([card])).toContain(
      '[0] stamps is only allowed on story/fixed cards',
    );
  },
);

it.each(['reject', 'approve'])(
  'requires the %s choice for meet stamps',
  (side) => {
    const card = {
      ...cards.find((c) => c.id === 'story_escape_1')!,
      stamps: 'meet',
      [side]: undefined,
    };
    expect(validateCards([card])).toContain(
      '[0] stamps requires both reject and approve',
    );
  },
);
