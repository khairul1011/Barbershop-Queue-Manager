import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DotPattern } from '@/components/ui/dot-pattern';

interface LoginProps {
  shopName: string;
  logoUrl: string | null;
}

function GoogleIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function Login({ shopName, logoUrl }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Email atau password salah.');
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setInfoMessage(null);
    setGoogleLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    setGoogleLoading(false);
    if (oauthError) {
      setError(oauthError.message);
    }
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    if (!email.trim()) {
      setError('Masukkan email Anda terlebih dahulu untuk mereset password.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setInfoMessage('Tautan reset password telah dikirim ke email Anda.');
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center bg-background p-4 sm:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-background/80 to-background" />
      <DotPattern
        className="[mask-image:radial-gradient(1500px_circle_at_center,white,transparent)] z-0"
        cx={1} cy={1} cr={1}
      />

      <Card className="relative z-10 w-full max-w-md shadow-2xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {logoUrl ? (
                <img src={logoUrl} alt={shopName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-bold text-primary-foreground text-base">
                  {shopName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">{shopName} HQ</div>
              <CardTitle className="text-xl">
                Login to your account
              </CardTitle>
            </div>
          </div>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="ml-auto inline-block text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground cursor-pointer"
                  >
                    Forgot your password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white"
                />
              </div>

              {error && <p className="text-xs font-medium text-destructive">{error}</p>}
              {infoMessage && <p className="text-xs font-medium text-emerald-400">{infoMessage}</p>}

              <div className="flex flex-col gap-2">
                <Button 
                  type="submit" 
                  disabled={loading || googleLoading} 
                  className="w-full bg-white hover:bg-zinc-200 text-black font-medium" 
                  id="login-submit-btn"
                >
                  {loading ? 'Processing...' : 'Login'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || googleLoading}
                  className="w-full flex items-center justify-center gap-2"
                  onClick={handleGoogleLogin}
                >
                  <GoogleIcon />
                  {googleLoading ? 'Connecting...' : 'Continue with Google'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
