import { ui, defaultLang, type Lang, type UIKeys } from './ui';

export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  if (first === 'th') return 'th';
  return 'en';
}

export function useTranslations(lang: Lang) {
  return function t(key: UIKeys): string {
    return (ui[lang][key] ?? ui[defaultLang][key] ?? key) as string;
  };
}

/** Returns the canonical URL for the same page in another locale */
export function getLocalizedUrl(url: URL, targetLang: Lang): string {
  const pathname = url.pathname;
  const isTH = pathname.startsWith('/th/') || pathname === '/th';

  if (targetLang === 'th') {
    if (isTH) return pathname;
    return '/th' + (pathname === '/' ? '' : pathname);
  } else {
    if (!isTH) return pathname;
    return pathname.replace(/^\/th/, '') || '/';
  }
}

/** Pick the right field based on lang (title vs titleTH etc.) */
export function localize(lang: Lang, en: string | undefined, th: string | undefined): string {
  return (lang === 'th' ? th : en) ?? en ?? th ?? '';
}

export function formatDate(lang: Lang, date: Date, opts?: Intl.DateTimeFormatOptions): string {
  const locale = lang === 'th' ? 'th-TH' : 'en-US';
  return date.toLocaleDateString(locale, opts ?? { year: 'numeric', month: 'long', day: 'numeric' });
}
