import React, { createContext, useContext } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { en } from './en';
import { id } from './id';

export type Lang = 'en' | 'id';
type TranslationKey = keyof typeof en;

const translations = { en, id };

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue>(null!);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useLocalStorageState<Lang>('barberflow_lang', 'id');

  const t = (key: TranslationKey): string => {
    // Return translation if exists, fallback to english, then to key
    return (translations[lang] && translations[lang][key]) 
      || translations['en'][key] 
      || key;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export const useTranslation = () => useContext(LangContext);
