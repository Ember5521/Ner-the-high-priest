import { GAUGE_KEYS, STATUS_LIMIT } from './config';
import type { ActiveStatus, Gauge, Result, State, Status } from './state';

export function resultStatus(
  result: Result,
  _gauges?: State['gauges'],
): Status | undefined {
  return result.status;
}

export function statusGauges(
  status: Status | Omit<Status, 'turns'>,
): Gauge[] {
  const touched = new Set([
    ...Object.keys(status.tick ?? {}),
    ...Object.keys(status.delayed ?? {}),
    status.scale?.gauge,
    status.freeze,
  ]);
  return GAUGE_KEYS.filter((gauge) => touched.has(gauge));
}

// Pass the surviving statuses after this document's tick/expiry.
export function statusesReplacedBy(
  statuses: ActiveStatus[],
  incoming: Status | undefined,
): ActiveStatus[] {
  if (!incoming) return [];
  if (
    incoming.axeLock ||
    incoming.id === 'sugar_cut' ||
    incoming.id === 'pikora_drift'
  )
    return [];
  statuses = statuses.filter(
    (s) => !s.axeLock && s.id !== 'sugar_cut' && s.id !== 'pikora_drift',
  );
  const gauges = statusGauges(incoming);
  const conflicts = statuses.filter(
    (status) =>
      status.id === incoming.id ||
      statusGauges(status).some((gauge) => gauges.includes(gauge)),
  );
  const remaining = statuses.filter((status) => !conflicts.includes(status));
  const overflow = remaining.slice(
    0,
    Math.max(0, remaining.length + 1 - STATUS_LIMIT),
  );
  return statuses.filter(
    (status) => conflicts.includes(status) || overflow.includes(status),
  );
}
