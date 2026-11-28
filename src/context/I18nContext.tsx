import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  SupportedLanguage,
  ITranslationDictionary,
  ENGLISH_TRANSLATIONS,
  SINHALA_TRANSLATIONS
} from '../types/i18n';

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: keyof ITranslationDictionary) => string;
  formatCurrency: (amountLkr: number) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'curtiss_language';

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'si') {
        return saved;
      }
    } catch {
      // Ignore localStorage access failures
    }
    return 'en';
  });

  // Fetch school default language on startup if user hasn't explicitly set language preference
  useEffect(() => {
    let isMounted = true;
    const fetchDefault = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved && window.api && typeof window.api.getSchoolSettings === 'function') {
          const settings = await window.api.getSchoolSettings();
          if (isMounted && settings?.defaultLanguage && (settings.defaultLanguage === 'en' || settings.defaultLanguage === 'si')) {
            setLanguageState(settings.defaultLanguage as SupportedLanguage);
          }
        }
      } catch {
        // Fallback gracefully to existing state
      }
    };
    fetchDefault();
    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage error
    }
    // Update html lang attribute for accessibility
    if (document.documentElement) {
      document.documentElement.lang = lang;
    }
  };

  const t = (key: keyof ITranslationDictionary): string => {
    const dict = language === 'si' ? SINHALA_TRANSLATIONS : ENGLISH_TRANSLATIONS;
    return dict[key] || ENGLISH_TRANSLATIONS[key] || key;
  };

  const formatCurrency = (amountLkr: number): string => {
    const formatted = Math.round(amountLkr).toLocaleString('en-US');
    return language === 'si' ? `රු. ${formatted}` : `LKR ${formatted}`;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, formatCurrency }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    // Return graceful fallback when outside provider (e.g. testing or early render)
    return {
      language: 'en',
      setLanguage: () => {},
      t: (key: keyof ITranslationDictionary) => ENGLISH_TRANSLATIONS[key] || key,
      formatCurrency: (amountLkr: number) => `LKR ${Math.round(amountLkr).toLocaleString('en-US')}`
    };
  }
  return context;
};
