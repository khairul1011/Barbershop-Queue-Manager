import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // server/ punya test runner sendiri (node:test, dijalanin via `npm test` di server/) --
    // exclude di sini biar Vitest cuma nyentuh test frontend.
    include: ['src/**/*.test.{ts,tsx}'],
    env: {
      // dayToDate() (useSupabaseQueue.ts) transitively imports supabaseClient.ts,
      // yang throw kalau env var Supabase kosong -- nilai di sini nggak pernah
      // beneran dipakai buat network call, cuma biar import-nya nggak crash.
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
  },
});
