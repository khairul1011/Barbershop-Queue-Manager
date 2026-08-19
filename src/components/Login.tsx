import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { DotPattern } from '@/components/ui/dot-pattern';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Email atau password salah.');
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center bg-background p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-background/80 to-background" />
      <DotPattern
        className="[mask-image:radial-gradient(1500px_circle_at_center,white,transparent)] z-0"
        cx={1} cy={1} cr={1}
      />

      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <span className="font-display font-bold text-primary-foreground text-lg">G</span>
          </div>
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Golden Shears HQ</h1>
          <p className="text-sm text-muted-foreground">Masuk untuk mengelola antrean & jadwal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-[10px] text-muted-foreground font-mono font-bold uppercase block">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-[10px] text-muted-foreground font-mono font-bold uppercase block">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" variant="default" disabled={loading} className="w-full" id="login-submit-btn">
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </div>
    </div>
  );
}
