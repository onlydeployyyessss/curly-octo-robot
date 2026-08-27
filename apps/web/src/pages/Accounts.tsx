import * as React from 'react';
import { Instagram, Link2, Unlink, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { useToast } from '../components/ui/toast';
import type { InstagramAccountDTO } from '@pc/shared';
import { useSearchParams } from 'react-router-dom';

export function Accounts() {
  const toast = useToast();
  const [accounts, setAccounts] = React.useState<InstagramAccountDTO[]>([]);
  const [max, setMax] = React.useState(5);
  const [configured, setConfigured] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [params] = useSearchParams();

  const load = React.useCallback(async () => {
    const r = await api.accounts();
    setAccounts(r.accounts);
    setMax(r.maxAccounts);
    setConfigured(r.configured);
  }, []);

  React.useEffect(() => {
    load().catch((e) => toast('error', e.message));
    if (params.get('oauth') === 'success') toast('success', 'Instagram account connected via official OAuth. ✅');
    if (params.get('oauth') === 'error') toast('error', 'Instagram connection failed — check the app credentials.');
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await api.connectUrl();
      if (url) window.location.href = url;
      else {
        // demo mode connects in place
        await load();
        toast('success', 'Account connected (demo).');
      }
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id: string) => {
    await api.disconnectAccount(id);
    toast('info', 'Account disconnected.');
    load();
  };

  const connected = accounts.filter((a) => a.status === 'connected').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instagram Accounts</h1>
          <p className="text-sm text-muted-foreground">{connected}/{max} accounts connected. Official Meta OAuth only — passwords and cookies are never requested.</p>
        </div>
        <Button onClick={connect} disabled={busy || connected >= max}>
          <Link2 className="h-4 w-4" /> {busy ? 'Redirecting…' : 'Connect Instagram account'}
        </Button>
      </div>

      {!configured && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">Meta app credentials not configured</p>
              <p className="text-muted-foreground">
                Set META_APP_ID, META_APP_SECRET and META_REDIRECT_URI in your environment to enable the real OAuth flow.
                The app never attempts to bypass Instagram permissions — unsupported actions show “API permission unavailable — manual action required.”
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className={a.status === 'connected' ? '' : 'opacity-70'}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/30 to-amber-500/30">
                  <Instagram className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-sm">@{a.username ?? 'connecting…'}</CardTitle>
                  <CardDescription className="text-xs">{a.accountType ?? 'business'} account</CardDescription>
                </div>
              </div>
              <Badge variant={a.status === 'connected' ? 'green' : a.status === 'expired' ? 'red' : 'gray'}>
                {a.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="Active campaigns" value={a.activeCampaigns} />
                <Metric label="Today's actions" value={a.todayActions} />
                <Metric label="Errors" value={a.errors} danger={a.errors > 0} />
                <Metric label="Last success" value={timeAgo(a.lastSuccessAt)} />
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                <div className="truncate">Account ID: {a.igUserId ?? '—'}</div>
                <div>Token expires: {a.tokenExpiresAt ? new Date(a.tokenExpiresAt).toLocaleDateString() : '—'} · encrypted at rest (AES-256-GCM)</div>
              </div>
              {a.lastError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">{a.lastError}</div>
              )}
              <div className="flex gap-2">
                {a.status !== 'connected' && (
                  <Button size="sm" variant="outline" onClick={connect}><RefreshCw className="h-3.5 w-3.5" /> Reconnect</Button>
                )}
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => disconnect(a.id)}>
                  <Unlink className="h-3.5 w-3.5" /> Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {Array.from({ length: Math.max(0, max - accounts.length) }).map((_, i) => (
          <Card key={`empty-${i}`} className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Link2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Available connection slot</p>
              <p className="text-xs text-muted-foreground">Connect an Instagram Business/Creator account via Meta OAuth.</p>
              <Button size="sm" variant="outline" onClick={connect}><Link2 className="h-3.5 w-3.5" /> Connect</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Compliance & safety</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>✅ Uses official Instagram Graph API + Facebook Login (OAuth) only</p>
          <p>✅ Never stores passwords, session cookies, or browser cookies</p>
          <p>✅ Respects rate limits, permissions & automation policies</p>
          <p>✅ Missing permissions → “API permission unavailable — manual action required”</p>
          <p>✅ Never auto-contacts accounts from followers/following lists</p>
          <p>✅ Stops outreach the instant a creator replies</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className={danger ? 'text-base font-bold text-red-400' : 'text-base font-bold'}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
