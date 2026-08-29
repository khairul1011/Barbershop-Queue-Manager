import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DotPattern } from '@/components/ui/dot-pattern';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog';

interface LoginProps {
  shopName: string;
  logoUrl: string | null;
}

export default function Login({ shopName, logoUrl }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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

  // Hanya melakukan validasi dan membuka dialog konfirmasi — BUKAN mengirim email secara langsung.
  // Sebelumnya, tombol ini langsung memanggil resetPasswordForEmail() tanpa
  // konfirmasi sama sekali, sehingga apabila kolom email tidak sengaja terklik
  // bersamaan, email reset password langsung terkirim tanpa disadari.
  const handleForgotPasswordClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    if (!email.trim()) {
      setError('Masukkan email Anda terlebih dahulu untuk mereset password.');
      return;
    }
    setShowResetConfirm(true);
  };

  // Benar-benar mengirim email reset — hanya dipanggil setelah pengguna mengonfirmasi pada dialog.
  const confirmResetPassword = async () => {
    setShowResetConfirm(false);
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
                    onClick={handleForgotPasswordClick}
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
                  disabled={loading} 
                  className="w-full bg-white hover:bg-zinc-200 text-black font-medium" 
                  id="login-submit-btn"
                >
                  {loading ? 'Processing...' : 'Login'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>
              Tautan reset password akan dikirim ke <span className="font-medium text-foreground">{email}</span>. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetPassword}>Kirim Tautan Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
