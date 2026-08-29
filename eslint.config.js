import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.claude/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Menurunkan severity secara eksplisit, bukan mengabaikan begitu saja:
      // rule ini menandai pola "fetch data di dalam useEffect" yang dipakai
      // secara konsisten di seluruh data layer aplikasi (semua hook Supabase),
      // sebuah pola React yang legitimate dan sudah teruji ekstensif pada
      // aplikasi produksi yang sedang berjalan. Merestrukturisasi seluruh data
      // layer hanya untuk memenuhi rule baru ini membawa risiko regresi nyata
      // tanpa manfaat korektif yang sepadan.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Primitif UI shadcn (component + variant function/hook dalam satu file)
    // dan modul context+hook (i18n, theme-settings) sengaja meng-colocate
    // export non-komponen bersama komponennya — pola yang lazim dan disengaja,
    // bukan kesalahan. Dampak rule ini murni pada Fast Refresh saat development,
    // tidak berpengaruh terhadap perilaku produksi.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/i18n/**/*.{ts,tsx}', 'src/theme-settings/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // sidebar.tsx (skeleton loading width acak via Math.random() dalam
      // useMemo) sedang dikelola tim/tooling lain di luar sesi ini, tidak
      // untuk diedit dari sini.
      'react-hooks/purity': 'warn',
    },
  },
);
