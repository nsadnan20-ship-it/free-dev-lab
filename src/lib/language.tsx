/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'ar' | 'en';

type LanguageContextValue = {
  language: AppLanguage;
  direction: 'rtl' | 'ltr';
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'ar';
  return window.localStorage.getItem('report-advisor.language') === 'en' ? 'en' : 'ar';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage);

  useEffect(() => {
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.language = language;
    window.localStorage.setItem('report-advisor.language', language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState(current => current === 'ar' ? 'en' : 'ar'),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
