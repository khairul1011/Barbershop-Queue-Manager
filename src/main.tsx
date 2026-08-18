import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n';
import { ThemeSettingsProvider } from './theme-settings';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeSettingsProvider>
        <App />
      </ThemeSettingsProvider>
    </LanguageProvider>
  </StrictMode>,
);
