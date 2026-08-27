import * as React from 'react';
import { Rocket, Clock, Save, ListChecks, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input, Label, Textarea } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { StatusBadge } from '../components/StatusBadge';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { api } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { useToast } from '../components/ui/toast';
import type { CampaignDTO } from '@pc/shared';

const EMOJIS = ['😭', '😂', '🙏', '💀', '👀'];

export function Campaigns() {
  const toast = useToast();
  const [campaigns, setCampaigns] = React.useState<CampaignDTO[]>([]);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [maxDays, setMaxDays] = React.useState(5);
  const [dmTime, setDmTime] = React.useState('10:00');
  const [dmEnabled, setDmEnabled] = React.useState(true);
  const [commentEnabled, setCommentEnabled] = React.useState(true);
  const [templates, setTemplates] = React.useState<{ day: number; dm: string; comment: string }[]>([]);

  React.useEffect(() => {
    (async () => {
      const [cs, q, tpls] = await Promise.all([api.campaigns(), api.queue() as Promise<{ queue: any[] }>, api.templates()]);
      setCampaigns(cs);
      setQueue(q.queue ?? []);
      const days = Array.from({ length: 5 }, (_, i) => i + 1);
      setTemplates(
        days.map((d) => ({
          day: d,
          dm: tpls.find((t) => t.channel === 'dm' && t.dayNumber === d)?.content ?? `Day ${d} asking for a PC ${EMOJIS[d - 1] ?? '🙏'}`,
          comment: tpls.find((t) => t.channel === 'comment' && t.dayNumber === d)?.content ?? `Day ${d} asking for a PC ${EMOJIS[d - 1] ?? '🙏'}`,
        })),
      );
    })().catch((e) => toast('error', e.message));
  }, []);

  const rebuildDays = (n: number) => {
    setMaxDays(n);
    setTemplates((prev) => {
      const map = new Map(prev.map((t) => [t.day, t]));
      return Array.from({ length: n }, (_, i) => {
        const d = i + 1;
        const existing = map.get(d);
        return existing ?? { day: d, dm: `Day ${d} asking for a PC ${EMOJIS[d - 1] ?? '🙏'}`, comment: `Day ${d} asking for a PC ${EMOJIS[d - 1] ?? '🙏'}` };
      });
    });
  };

  const save = async () => {
    try {
      await api.saveConfig({
        maxDays,
        dmTime,
        dmEnabled,
        commentEnabled,
        templates: templates.map((t) => ({ dayNumber: t.day, dm: t.dm, comment: t.comment })),
      });
      toast('success', 'Campaign configuration saved and applied to waiting campaigns.');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Campaign System</h1>
        <p className="text-sm text-muted-foreground">Independent multi-day plan per creator — idempotent scheduling, auto-stop on reply.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Campaign plan & daily templates</CardTitle>
            <CardDescription>These approved templates are used by every campaign (unless AI personalization is ON).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Number of days</Label>
                <Input type="number" min={1} max={30} value={maxDays} onChange={(e) => rebuildDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
              <div className="space-y-1.5">
                <Label>Daily send time</Label>
                <Input type="time" value={dmTime} onChange={(e) => setDmTime(e.target.value)} />
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={dmEnabled} onCheckedChange={setDmEnabled} label="DMs" /> DMs</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={commentEnabled} onCheckedChange={setCommentEnabled} label="Comments" /> Comments</label>
              </div>
            </div>

            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.day} className="grid gap-2 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-[60px_1fr_1fr] sm:items-start">
                  <Badge variant="default" className="h-fit justify-center py-1">Day {t.day}</Badge>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase">📩 DM template</Label>
                    <Textarea rows={2} value={t.dm} onChange={(e) => setTemplates((p) => p.map((x) => (x.day === t.day ? { ...x, dm: e.target.value } : x)))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase">💬 Comment template</Label>
                    <Textarea rows={2} value={t.comment} onChange={(e) => setTemplates((p) => p.map((x) => (x.day === t.day ? { ...x, comment: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={save}><Save className="h-4 w-4" /> Save configuration</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Upcoming queue</CardTitle>
              <CardDescription>Locked with SKIP LOCKED — no double sends, even with cron + worker.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {queue.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">@{a.creatorUsername}</span>
                  <Badge variant="gray" className="text-[10px]">{a.type === 'dm' ? '📩 DM' : '💬 comment'} · day {a.campaignDay}</Badge>
                  <span className={cn('ml-auto text-[11px]', a.status === 'failed' ? 'text-red-400' : 'text-muted-foreground')}>
                    {a.status === 'failed' ? `${a.attempts} retries` : timeAgo(a.scheduledAt)}
                  </span>
                </div>
              ))}
              {!queue.length && <p className="text-sm text-muted-foreground">Nothing queued — start a campaign to schedule Day 1.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-400" /> Stop conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Creator replies → <b className="text-foreground">all automated outreach stops instantly</b></p>
              <p>• Positive reply or decline → campaign pauses for manual follow-up</p>
              <p>• Max campaign days reached → marked completed</p>
              <p>• Creator excluded → never contacted</p>
              <p>• Global emergency stop → every worker skips all actions</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Active & recent campaigns</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Creator</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH className="hidden md:table-cell">Channels</TH>
                <TH className="hidden lg:table-cell">Started</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">@{c.creatorUsername}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.currentDay / c.maxDays) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{c.currentDay}/{c.maxDays}</span>
                    </div>
                  </TD>
                  <TD className="hidden md:table-cell text-xs">
                    {c.dmEnabled ? '📩 ' : ''}{c.commentEnabled ? '💬' : ''}
                  </TD>
                  <TD className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.startedAt)}</TD>
                </TR>
              ))}
              {!campaigns.length && <TR><TD colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No campaigns yet.</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
