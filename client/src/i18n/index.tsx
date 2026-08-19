import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'am';

/** Amharic strings are a first pass and should be reviewed by a native speaker before launch. */
const dict = {
  en: {
    'nav.salons': 'Find a salon', 'nav.forOwners': 'For salons', 'nav.signIn': 'Sign in', 'nav.register': 'Create account', 'nav.signOut': 'Sign out',
    'nav.bookings': 'My bookings', 'nav.favorites': 'Favorites', 'nav.notifications': 'Notifications', 'nav.profile': 'Profile', 'nav.manage': 'Salon dashboard', 'nav.admin': 'Admin',
    'hero.title': 'Your beauty appointment, made effortless.',
    'hero.sub': 'See real openings at trusted hair and nail salons across Addis Ababa, compare prices in birr, and book in under a minute.',
    'search.where': 'Where', 'search.what': 'Service', 'search.when': 'Date', 'search.go': 'Search salons', 'search.anywhere': 'All of Addis Ababa', 'search.anything': 'Any service',
    'book.cta': 'Book appointment', 'common.save': 'Save changes', 'common.cancel': 'Cancel', 'common.loading': 'Loading…', 'common.retry': 'Try again', 'common.back': 'Back',
    'common.today': 'Today', 'common.all': 'All', 'common.search': 'Search', 'common.from': 'from',
  },
  am: {
    'nav.salons': 'ሳሎን ፈልግ', 'nav.forOwners': 'ለሳሎኖች', 'nav.signIn': 'ግባ', 'nav.register': 'መለያ ክፈት', 'nav.signOut': 'ውጣ',
    'nav.bookings': 'ቀጠሮዎቼ', 'nav.favorites': 'ተወዳጆች', 'nav.notifications': 'ማሳወቂያዎች', 'nav.profile': 'መገለጫ', 'nav.manage': 'የሳሎን ዳሽቦርድ', 'nav.admin': 'አስተዳዳሪ',
    'hero.title': 'የውበት ቀጠሮዎ፣ ያለ ድካም።',
    'hero.sub': 'በአዲስ አበባ ከሚገኙ ታማኝ የጸጉር እና የጥፍር ሳሎኖች እውነተኛ ክፍት ሰዓቶችን ይመልከቱ፣ ዋጋን በብር ያወዳድሩ፣ በአንድ ደቂቃ ውስጥ ቀጠሮ ይያዙ።',
    'search.where': 'የት', 'search.what': 'አገልግሎት', 'search.when': 'ቀን', 'search.go': 'ሳሎኖችን ፈልግ', 'search.anywhere': 'መላው አዲስ አበባ', 'search.anything': 'ማንኛውም አገልግሎት',
    'book.cta': 'ቀጠሮ ያዝ', 'common.save': 'ለውጦችን አስቀምጥ', 'common.cancel': 'ሰርዝ', 'common.loading': 'በመጫን ላይ…', 'common.retry': 'እንደገና ሞክር', 'common.back': 'ተመለስ',
    'common.today': 'ዛሬ', 'common.all': 'ሁሉም', 'common.search': 'ፈልግ', 'common.from': 'ከ',
  },
} as const;
export type Key = keyof (typeof dict)['en'];

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: (k: Key) => string }>({ locale: 'en', setLocale: () => {}, t: (k) => k });

function initial(): Locale {
  try { const s = localStorage.getItem('belle.locale'); if (s === 'am' || s === 'en') return s; } catch { /* storage blocked */ }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>(initial);
  const setLocale = useCallback((l: Locale) => { set(l); try { localStorage.setItem('belle.locale', l); } catch { /* ignore */ } }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (k: Key) => dict[locale][k] ?? dict.en[k] ?? k }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
