import * as React from 'react';
import { Send, Clock, BellRing, TerminalSquare, FileText, Save, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input, Label } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { api } from '../lib/api';
import { useToast } from '../components/ui/toast';
import { TELEGRAM_COMMANDS, type TelegramSettingsDTO } from '@pc/shared';

export function TelegramPage() {
  const toast = useToast();
  const [s, setS] = React.useState<TelegramSettingsDTO | null>(null);
  const [report, setReport] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState('');

  React.useEffect(() => {
    api.telegramSettings().then(setS).catch((e) => toast('error', e.message));
  }, []);

  const patch = (p: Partial<TelegramSettingsDTO>) => setS((prev) => (prev ? { ...prev, ...p } : prev));

  const save = async () => {
    if (!s) return;
    setBusy('save');
    try {
      await api.saveTelegramSettings({
        chatId: s.chatId ?? '',
        reportTime: s.reportTime,
        dailyReportEnabled: s.dailyReportEnabled,
        instantAlertsEnabled: s.instantAlertsEnabled,
        authorizedIds: s.authorizedIds,
      });
      toast('success', 'Telegram settings saved.');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await api.telegramTest();
      toast('success', 'Test message sent to your Telegram.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const sendReport = async () => {
    setBusy('report');
    try {
      const r = await api.reportNow();
      setReport(r.message);
      toast(r.sent ? 'success' : 'error', r.sent ? 'Daily report sent.' : 'Telegram not configured — showing preview.');
    } finally {
      setBusy('');
    }
  };

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Telegram Bot</h1>
        <p className="text-sm text-muted-foreground">Daily mission reports at your chosen time, plus instant alerts the moment a creator replies.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-sky-400" /> Delivery configuration</CardTitle>
            <CardDescription>Bot token is read from TELEGRAM_BOT_TOKEN (server-side). Commands only respond to the authorized chat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
              <span className="text-sm">Bot connection</span>
              <Badge variant={s.botConfigured ? 'green' : 'red'}>{s.botConfigured ? 'Configured' : 'Missing token'}</Badge>
            </div>

            <div className="space-y-1.5">
              <Label>Telegram chat ID</Label>
              <Input value={s.chatId ?? ''} onChange={(e) => patch({ chatId: e.target.value })} placeholder="e.g. 987654321 — send /start to the bot to register" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Daily report time</Label>
                <Input type="time" value={s.reportTime} onChange={(e) => patch({ reportTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Delivery</Label>
                <div className="flex items-center gap-4 pt-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={s.dailyReportEnabled} onCheckedChange={(v) => patch({ dailyReportEnabled: v })} label="Daily report" /> Daily
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={s.instantAlertsEnabled} onCheckedChange={(v) => patch({ instantAlertsEnabled: v })} label="Instant alerts" /> Alerts
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={busy === 'save'}><Save className="h-4 w-4" /> {busy === 'save' ? 'Saving…' : 'Save settings'}</Button>
              <Button variant="outline" onClick={test} disabled={busy === 'test'}><BellRing className="h-4 w-4" /> Test message</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TerminalSquare className="h-4 w-4 text-emerald-400" /> Bot commands</CardTitle>
            <CardDescription>Send these to your bot. Only the authorized chat/user is accepted.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TELEGRAM_COMMANDS.map((c) => (
              <div key={c.command} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2">
                <code className="rounded bg-secondary px-2 py-0.5 text-sm font-semibold text-sky-300">{c.command}</code>
                <span className="text-xs text-muted-foreground">{c.description}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Daily report preview</CardTitle>
          <Button size="sm" onClick={sendReport} disabled={busy === 'report'}>
            {busy === 'report' ? 'Sending…' : <>Send now <Send className="h-3.5 w-3.5" /></>}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{report ?? `🤖 PC MISSION — DAILY REPORT

📅 27 Aug 2026

👥 CREATORS
• Active: 42
• New: 8
• Completed: 3

📨 OUTREACH
• DMs sent: 37
• Comments sent: 29
• Failed actions: 2

💬 RESPONSES
• Total replies: 5
• Positive replies: 2
• Maybe: 1
• Declined: 2

🔥 CREATOR REPLIES
@creator123
💬 Comment reply: "Bro maybe 😂"

⏳ ACTIVE CAMPAIGNS
• Day 1: 12  • Day 2: 9  • Day 3: 8  • Day 4: 7  • Day 5+: 6

🎯 PC MISSION
PC received: ❌
Positive opportunities: 2

(Click "Send now" to generate a live report)`}
          </pre>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Instant reply alerts are pushed automatically — they look like “🔥 CREATOR REPLIED … 🛑 Automation automatically paused.”
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
