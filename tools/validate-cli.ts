import cards from '../data/cards/m1.json';
import en from '../data/i18n/en.json';
import ja from '../data/i18n/ja.json';
import { validateCards, validateTranslations } from './validate-cards';
const errors = validateCards(cards);
for (const [lang, copy] of Object.entries({ en, ja })) {
  const coverage = validateTranslations(copy, cards);
  errors.push(...coverage.errors.map((error) => `${lang}: ${error}`));
  console.log(
    `${lang}: cards ${coverage.cards}/${coverage.totalCards}, system strings ${coverage.system}/${coverage.totalSystem}`,
  );
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Validated ${cards.length} cards.`);
