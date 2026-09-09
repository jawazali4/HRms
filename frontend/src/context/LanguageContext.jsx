import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { languages, translations, t as translateFn } from '../i18n';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'hrms_language';

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && languages[stored]) return stored;
      // Detect browser language
      const browserLang = navigator.language?.split('-')[0];
      if (browserLang && languages[browserLang]) return browserLang;
      return 'en';
    } catch {
      return 'en';
    }
  });

  const isRTL = languages[language]?.dir === 'rtl';

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {}
    // Update HTML attributes for RTL support
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    // Add class for styling
    if (isRTL) {
      document.body.classList.add('rtl');
      document.body.classList.remove('ltr');
    } else {
      document.body.classList.add('ltr');
      document.body.classList.remove('rtl');
    }
  }, [language, isRTL]);

  const t = useCallback(
    (key) => {
      return translateFn(language, key);
    },
    [language]
  );

  const changeLanguage = useCallback((newLang) => {
    if (languages[newLang]) {
      setLanguage(newLang);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'en' ? 'ar' : 'en'));
  }, []);

  const value = {
    language,
    isRTL,
    languages,
    t,
    changeLanguage,
    toggleLanguage,
    dir: isRTL ? 'rtl' : 'ltr',
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

export function useTranslation() {
  return useLanguage();
}
