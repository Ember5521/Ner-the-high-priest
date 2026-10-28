import baseSystem from '../data/system.json';
import en from '../data/i18n/en.json';
import ja from '../data/i18n/ja.json';
import type { Card } from './core/state';

export type Lang = 'ko' | 'en' | 'ja';
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
export interface Translation {
  system?: DeepPartial<typeof baseSystem>;
  cards?: Record<
    string,
    { title?: string; text?: string; reject?: string; approve?: string }
  >;
}
export function defaultLanguage(
  language = typeof navigator === 'undefined' ? 'en' : navigator.language,
): Lang {
  return language.toLowerCase().startsWith('ko')
    ? 'ko'
    : language.toLowerCase().startsWith('ja')
      ? 'ja'
      : 'en';
}

// Only strings can be overlaid; the originals own the structure and logic.
export function mergeStrings<T>(base: T, translated: unknown, path = ''): T {
  if (path === 'options.languages') return structuredClone(base);
  if (typeof base === 'string')
    return (typeof translated === 'string' ? translated : base) as T;
  if (base && typeof base === 'object') {
    const overlay =
      translated && typeof translated === 'object'
        ? (translated as Record<string, unknown>)
        : {};
    if (Array.isArray(base))
      return base.map((value, i) =>
        mergeStrings(value, overlay[i], `${path}.${i}`),
      ) as T;
    return Object.fromEntries(
      Object.entries(base).map(([key, value]) => [
        key,
        mergeStrings(value, overlay[key], path ? `${path}.${key}` : key),
      ]),
    ) as T;
  }
  return base;
}
const translations: Record<'en' | 'ja', Translation> = { en, ja };
export let language: Lang = 'ko';
export let system = baseSystem;
export function setLanguage(lang: Lang): void {
  language = lang;
  system = mergeStrings(
    baseSystem,
    lang === 'ko' ? undefined : translations[lang].system,
  );
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    if (lang === 'ja' && !document.getElementById('japanese-fonts')) {
      const link = document.createElement('link');
      link.id = 'japanese-fonts';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800&family=Zen+Maru+Gothic:wght@500;700&display=swap';
      document.head.append(link);
    }
    window.dispatchEvent(new Event('languagechange'));
  }
}
export function format(
  text: string,
  values: Record<string, string | number>,
): string {
  return text.replace(
    /\{(\w+)(?:\|([^{}|]*)\|([^{}|]*))?\}/g,
    (placeholder, key: string, one?: string, other?: string) => {
      if (!Object.hasOwn(values, key)) return placeholder;
      const value = values[key];
      return one === undefined
        ? String(value)
        : value === 1 || value === '1'
          ? one
          : other!;
    },
  );
}
export function localizeCard<T extends Card>(
  card: T,
  translation: Translation | undefined = language === 'ko'
    ? undefined
    : translations[language],
): T {
  const copy = translation?.cards?.[card.id];
  const inherited = card.mimic ? translation?.cards?.[card.mimic] : undefined;
  const title = copy?.title ?? inherited?.title;
  const reject = copy?.reject ?? inherited?.reject;
  const approve = copy?.approve ?? inherited?.approve;
  return {
    ...card,
    title: typeof title === 'string' ? title : card.title,
    text: typeof copy?.text === 'string' ? copy.text : card.text,
    reject: card.reject && {
      ...card.reject,
      label: typeof reject === 'string' ? reject : card.reject.label,
    },
    approve: card.approve && {
      ...card.approve,
      label: typeof approve === 'string' ? approve : card.approve.label,
    },
  };
}
