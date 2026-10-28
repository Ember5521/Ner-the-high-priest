import source from '../../data/system.json';

export type SystemCopy = typeof source;
export const structuralKeys = new Set([
  'key',
  'id',
  'color',
  'art',
  'portrait',
  'focus',
]);
export const placeholders = (value: string) => [
  ...new Set(value.match(/\{[^{}]+\}/g) ?? []),
];
export const missingPlaceholders = (saved: string, value: string) =>
  placeholders(saved).filter((token) => !value.includes(token));

export function validateSystem(value: unknown, saved: unknown): string[] {
  const errors: string[] = [];
  const visit = (next: unknown, old: unknown, path: string) => {
    const key = path.split('.').at(-1)!;
    if (key === 'focus' && /^tutorial\.steps\.\d+\.focus$/.test(path)) {
      if (![null, 'tools', 'gauges', 'axe'].includes(next as string | null))
        errors.push(`${path}: 강조 대상이 올바르지 않습니다.`);
    } else if (structuralKeys.has(key)) {
      if (JSON.stringify(next) !== JSON.stringify(old))
        errors.push(`${path}: 구조 필드는 변경할 수 없습니다.`);
    } else if (typeof old === 'string') {
      if (typeof next !== 'string' || !next.trim())
        errors.push(`${path}: 필수 문구를 입력하세요.`);
      else
        for (const token of missingPlaceholders(old, next))
          errors.push(`${path}: ${token} 자리표시자를 유지하세요.`);
    } else if (Array.isArray(old)) {
      const flexible =
        path === 'tutorial.steps' ||
        /^(scenes\.[^.]+|rewindPrompt)\.lines$/.test(path);
      if (
        !Array.isArray(next) ||
        (!flexible && next.length !== old.length) ||
        (path === 'tutorial.steps' && !next.length)
      ) {
        errors.push(`${path}: 목록 구조가 올바르지 않습니다.`);
        return;
      }
      next.forEach((item, i) =>
        visit(
          item,
          old[i] ??
            (path === 'tutorial.steps'
              ? { title: '', text: '', focus: null }
              : { name: '', text: '' }),
          `${path}.${i}`,
        ),
      );
    } else if (old && typeof old === 'object') {
      if (
        !next ||
        typeof next !== 'object' ||
        Array.isArray(next) ||
        Object.keys(next).sort().join('\0') !==
          Object.keys(old).sort().join('\0')
      ) {
        errors.push(`${path}: 필드 구조가 올바르지 않습니다.`);
        return;
      }
      for (const [name, child] of Object.entries(old))
        visit(
          (next as Record<string, unknown>)[name],
          child,
          path ? `${path}.${name}` : name,
        );
    } else if (next !== old)
      errors.push(`${path}: 구조 필드는 변경할 수 없습니다.`);
  };
  visit(value, saved, '');
  return errors;
}

// Rebuild objects in saved order, including when a client sends reordered keys.
export function orderedSystem(value: unknown, saved: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item, i) =>
      orderedSystem(item, (saved as unknown[])[i] ?? (saved as unknown[])[0]),
    );
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys((saved ?? value) as object).map((key) => [
        key,
        orderedSystem(
          (value as Record<string, unknown>)[key],
          ((saved ?? value) as Record<string, unknown>)[key],
        ),
      ]),
    );
  return value;
}
