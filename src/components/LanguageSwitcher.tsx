import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '../i18n';

export default function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  ] as const;

  const currentLang = languages.find(l => l.code === lang) || languages[1];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#0F0F0F] border border-[#1A1A1A] hover:bg-[#151515] hover:text-amber-500 rounded-xl px-3 py-2 transition-all cursor-pointer text-xs md:text-sm text-gray-300 h-[38px]"
        id="language-switcher-btn"
      >
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="hidden sm:inline font-sans font-medium">{currentLang.label}</span>
        <ChevronDown size={14} className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-40 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-1">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-sans transition-colors cursor-pointer ${
                    lang === l.code 
                      ? 'bg-amber-500/10 text-amber-500 font-bold' 
                      : 'text-gray-400 hover:bg-[#151515] hover:text-white'
                  }`}
                  id={`lang-select-${l.code}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{l.flag}</span>
                    <span>{l.label}</span>
                  </div>
                  {lang === l.code && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
