import { answerCard } from '../core/bishop';
import { system, localizeCard } from '../i18n';
import type { Card, State } from '../core/state';
import type { ToolAction as Action } from './tools';
import { updateGaugePreview } from './gauges';
export function updateAimPreview(
  root: HTMLElement,
  card: Card | null,
  aim: Action | null,
  dim = false,
  state?: State,
): void {
  if (card)
    card = card.blessings ? answerCard(card.blessings) : localizeCard(card);
  root
    .querySelectorAll<HTMLElement>('.tool')
    .forEach((el) => el.classList.toggle('aimed', el.dataset.action === aim));
  // the R key aims the wildcard: the paper takes the same purple as a held swap
  root.querySelector('.document')?.classList.toggle('wild-hold', aim === 'alice');
  const label =
    aim === 'scope'
      ? system.boons.scope.short || system.boons.scope.name
        : aim === 'alice'
          ? system.aliceLine
          : aim === 'bullet'
            ? ((system as typeof system & { bulletLine?: string }).bulletLine ??
              system.axeLine)
            : aim === 'axe'
              ? system.axeLine
              : aim && card
                ? card[aim].label
                : '';
  const caption = root.querySelector<HTMLElement>('.choice-caption');
  if (caption) {
    caption.textContent = label;
    caption.className = `choice-caption ${aim ?? ''}`;
  }
  const drowse =
    card &&
    card.axe !== 'free' &&
    !state?.sleep &&
    (aim === 'reject' || aim === 'approve')
      ? card[aim].drowse
      : undefined;
  const indicator = root.querySelector('.drowse');
  indicator?.classList.toggle('threat', Boolean(drowse));
  indicator?.classList.toggle('sleep-threat', drowse === 3);
  updateGaugePreview(root, card, aim, dim, state);
}
