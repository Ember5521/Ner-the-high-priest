import { decayFor } from './config';
import type { State } from './state';

export function advanceDrowse(
  drowse: State['drowse'],
  counted: boolean,
  yearAdvanced: boolean,
): State['drowse'] {
  if (counted) {
    const stack = drowse.stack === 2 ? 0 : drowse.stack === 0 ? 1 : 2;
    return { stack, left: decayFor(stack) };
  }
  if (!drowse.stack || !yearAdvanced) return drowse;
  if (drowse.left > 1) return { ...drowse, left: drowse.left - 1 };
  return drowse.stack === 2
    ? { stack: 1, left: decayFor(1) }
    : { stack: 0, left: 0 };
}
