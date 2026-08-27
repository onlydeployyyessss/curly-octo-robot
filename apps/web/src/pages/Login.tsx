import * as React from 'react';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { api } from '../lib/api';
import { useToast } from '../components/ui/toast';
import type { UserDTO } from '@pc/shared';

export function Login({ needsSetup, onAuthed }: { needsSetup: boolean; onAuthed: (u: UserDTO) => void }) {
  const toast = useToast();
  const [mode, setMode] = React.useState<'login' | 'setup'>(needsSetup ? 'setup' : 'login');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'setup') {
        const r: { user: UserDTO } = await api.setup({ name, email, password });
        toast('success', `Welcome, ${r.user.name}. Mission control ready.`);
        onAuthed(r.user);
      } else {
        const r: { user: UserDTO } = await api.login(email, password);
        toast('success', `Welcome back, ${r.user.name}.`);
        onAuthed(r.user);
      }
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glow-grid flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-3xl">🎯</div>
          <h1 className="text-2xl font-bold tracking-tight">PC Mission</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Respectful, multi-day creator outreach — every interaction logged, automation pauses the moment they reply.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold">{mode === 'setup' ? 'Create your operator account' : 'Sign in'}</h2>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'setup' && (
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Secured with HTTP-only session cookies. API keys never leave the server.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
