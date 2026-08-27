import * as React from 'react';
import { AlertOctagon, Play, ShieldCheck, Cog, ScrollText, Rocket } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Input, Label } from '../components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { api } from '../lib/api';
import { formatTime, formatDate } from '../lib/utils';
import { useToast } from '../components/ui/toast';
import type { AppSettingsDTO } from '@pc/shared';

export function SettingsPage() {
  const toast = useToast();
  const [s, setS] = React.useState<AppSettingsDTO | null>(null);
  const [audit, setAudit] = React.useState<any[]>([]);
  const [confirmStop, setConfirmStop] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setS(await api.settings());
      const a: { events: any[] } = await api.audit();
      setAudit(a.events ?? []);
    })().catch((e) => toast('error', e.message));
  }, []);

  const update = async (patch: Partial<AppSettingsDTO>) => {
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.saveSettings(patch);
  };

  const emergencyStop = async () => {
    await api.emergencyStop();
    setS((prev) => (prev ? { ...prev, automationEnabled: false } : prev));
    setConfirmStop(false);
    toast('error', '🛑 STOP ALL AUTOMATION — every scheduled DM/comment is halted immediately.');
  };

  const resume = async () => {
    await update({ automationEnabled: true });
    toast('success', '🟢 Automation resumed.');
  };

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Campaign defaults, safety switches, and security. All secrets live in environment variables on the server.</p>
      </div>

      {/* Emergency control */}
      <Card className={s.automationEnabled ? 'border-red-500/40' : 'border-emerald-500/40'}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.automationEnabled ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
            <AlertOctagon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 font-semibold">
              Global automation: <Badge variant={s.automationEnabled ? 'green' : 'red'}>{s.automationEnabled ? '🟢 LIVE' : '🛑 STOPPED'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {s.automationEnabled
                ? 'The worker will send scheduled DMs and comments for active campaigns.'
                : 'All workers skip every scheduled action. No creator will be contacted until you resume.'}
            </p>
          </div>
          {s.automationEnabled ? (
            <Button variant="destructive" size="lg" onClick={() => setConfirmStop(true)}>
              <AlertOctagon className="h-4 w-4" /> STOP ALL AUTOMATION
            </Button>
          ) : (
            <Button variant="success" size="lg" onClick={resume}>
              <Play className="h-4 w-4" /> Resume automation
            </Button>
          )}
        </CardContent>
      </Card>

      {confirmStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setConfirmStop(false)}>
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-red-300">Stop ALL automation?</h3>
            <p className="mt-2 text-sm text-muted-foreground">Every scheduled DM and comment halts immediately, on every connected account. Creators in progress will not be contacted until you resume.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmStop(false)}>Cancel</Button>
              <Button variant="destructive" onClick={emergencyStop}>Yes, stop everything</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cog className="h-4 w-4 text-primary" /> Campaign defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default campaign days</Label>
                <Input type="number" min={1} max={30} value={s.defaultMaxDays} onChange={(e) => update({ defaultMaxDays: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Daily DM time</Label>
                <Input type="time" value={s.defaultDmTime} onChange={(e) => update({ defaultDmTime: e.target.value })} />
              </div>
            </div>
            <Toggle label="Auto-apply campaign to creators I add" checked={s.autoApplyCampaign} onChange={(v) => update({ autoApplyCampaign: v })} hint="Eligible new creators start Day 1 automatically unless on the exclusion list." />
            <Toggle label="Stop when a creator replies" checked={s.stopOnReply} onChange={(v) => update({ stopOnReply: v })} hint="Recommended and always enforced for respectful outreach." />
            <Toggle label="Stop on positive reply" checked={s.stopOnPositive} onChange={(v) => update({ stopOnPositive: v })} />
            <Toggle label="Stop on decline" checked={s.stopOnDecline} onChange={(v) => update({ stopOnDecline: v })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Mission & security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle label="🎯 PC received! (mission complete)" checked={s.pcReceived} onChange={(v) => update({ pcReceived: v })} />
            <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
              <p>✅ HTTP-only secure session cookies · scrypt password hashing</p>
              <p>✅ OAuth tokens encrypted at rest (AES-256-GCM), secrets never sent to browser</p>
              <p>✅ Input validation (zod) + per-endpoint authorization + rate limiting</p>
              <p>✅ Audit logging — access tokens & secrets are never written to logs</p>
              <p>✅ Telegram commands validated against authorized chat/user IDs</p>
              <p>✅ Only official Instagram Graph API — no passwords, cookies, or bypasses</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-xs">
              <div className="mb-1 font-medium">Environment variables (server only)</div>
              <code className="block whitespace-pre-wrap text-muted-foreground">DATABASE_URL · OPENROUTER_API_KEY · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID · META_APP_ID · META_APP_SECRET · META_REDIRECT_URI · SESSION_SECRET · CRON_SECRET</code>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Audit log</CardTitle>
          <CardDescription>Security-relevant actions across the application.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH>When</TH><TH>Action</TH><TH>Entity</TH><TH className="hidden md:table-cell">IP</TH></TR>
            </THead>
            <TBody>
              {audit.map((a) => (
                <TR key={a.id}>
                  <TD className="text-xs text-muted-foreground">{formatDate(a.ts)} {formatTime(a.ts)}</TD>
                  <TD className="font-medium">{a.action.replace(/_/g, ' ')}</TD>
                  <TD className="text-xs text-muted-foreground">{a.entity ?? '—'}{a.entityId ? `:${String(a.entityId).slice(0, 8)}` : ''}</TD>
                  <TD className="hidden text-xs text-muted-foreground md:table-cell">{a.ip ?? '—'}</TD>
                </TR>
              ))}
              {!audit.length && <TR><TD colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No audit events yet.</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Deployment</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="space-y-1.5">
            <li>• <b>Vercel</b> — web app + serverless API + Vercel Cron (/api/cron/tick) + Telegram/Meta webhooks. Push this repo and set the environment variables in Project Settings.</li>
            <li>• <b>Railway</b> — Dockerfile (pc-mission-web) and Dockerfile.worker (pc-mission-worker) plus a Postgres service; worker runs scheduler + long polling.</li>
            <li>• Health check: <code>GET /health</code> → <code>{`{ "status": "ok", "database": "connected", "worker": "running" }`}</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}
