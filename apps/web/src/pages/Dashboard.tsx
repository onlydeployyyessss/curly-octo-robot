import * as React from 'react';
import {
  Users,
  Rocket,
  CheckCircle2,
  Send,
  MessageSquare,
  Reply,
  Sparkles,
  ThumbsDown,
  AlertTriangle,
  Plus,
  ChevronRight,
  Activity as ActivityIcon,
  Trophy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { StatusBadge } from '../components/StatusBadge';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { api } from '../lib/api';
import { cn, timeAgo, formatTime } from '../lib/utils';
import { DASHBOARD_FILTERS, type CreatorDTO, type DashboardStats, type ActivityEventDTO } from '@pc/shared';
import { useNavigate } from 'react-router-dom';
import { AddCreatorModal } from '../components/AddCreatorModal';
import { useToast } from '../components/ui/toast';

const ACTION_LABELS: Record<string, string> = {
  dm_sent: 'DM sent',
  comment_posted: 'Comment posted',
  dm_received: 'DM received',
  comment_received: 'Comment reply received',
  campaign_started: 'Campaign started',
  campaign_paused: 'Campaign paused',
  campaign_resumed: 'Campaign resumed',
  campaign_stopped: 'Campaign stopped',
  campaign_completed: 'Campaign completed',
  campaign_restarted: 'Campaign restarted',
  day_skipped: 'Day skipped',
  creator_excluded: 'Creator excluded',
  oauth_connected: 'Instagram account connected',
  oauth_expired: 'Instagram token expired',
  report_sent: 'Daily report sent',
  instant_alert_sent: 'Reply alert sent',
  automation_stopped: 'ALL AUTOMATION STOPPED',
  automation_resumed: 'Automation resumed',
  test_sent: 'Test message sent',
  ai_generated: 'AI message generated',
  manual_action_required: 'Manual action required',
  message_prepared: 'Message prepared',
  error: 'Error',
};

export function Dashboard() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [creators, setCreators] = React.useState<CreatorDTO[]>([]);
  const [activity, setActivity] = React.useState<ActivityEventDTO[]>([]);
  const [filter, setFilter] = React.useState('all');
  const [addOpen, setAddOpen] = React.useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const load = React.useCallback(async () => {
    const [s, c, a] = await Promise.all([api.stats(), api.creators({ status: filter }), api.activity({ limit: 12 })]);
    setStats(s);
    setCreators(c);
    setActivity(a);
  }, [filter]);

  React.useEffect(() => {
    load().catch((e) => toast('error', e.message));
    const t = setInterval(() => load().catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const statCards = [
    { label: 'Total creators', value: stats?.totalCreators, icon: Users, tone: 'text-sky-400 bg-sky-500/10' },
    { label: 'Active campaigns', value: stats?.activeCampaigns, icon: Rocket, tone: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Campaigns completed', value: stats?.completedCampaigns, icon: CheckCircle2, tone: 'text-blue-400 bg-blue-500/10' },
    { label: 'DMs sent', value: stats?.dmsSent, icon: Send, tone: 'text-indigo-400 bg-indigo-500/10' },
    { label: 'Comments sent', value: stats?.commentsSent, icon: MessageSquare, tone: 'text-violet-400 bg-violet-500/10' },
    { label: 'Creator replies', value: stats?.creatorReplies, icon: Reply, tone: 'text-cyan-400 bg-cyan-500/10' },
    { label: 'Positive replies', value: stats?.positiveReplies, icon: Sparkles, tone: 'text-fuchsia-400 bg-fuchsia-500/10' },
    { label: 'Declines', value: stats?.declines, icon: ThumbsDown, tone: 'text-orange-400 bg-orange-500/10' },
    { label: 'Errors', value: stats?.errors, icon: AlertTriangle, tone: 'text-red-400 bg-red-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mission Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Day-by-day campaign to get a PC — one polite ask at a time.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Creator
        </Button>
      </div>

      {/* Mission objective banner */}
      <Card className={cn('border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card')}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-2xl">🎯</div>
          <div className="flex-1">
            <div className="text-sm font-semibold">PC Mission objective</div>
            <div className="text-sm text-muted-foreground">
              PC received: {stats?.pcReceived ? '✅ Yes!' : '❌ Not yet'} · Positive opportunities: {stats?.positiveOpportunities ?? 0} · Automation: {stats?.automationEnabled ? '🟢 live' : '🛑 stopped'}
            </div>
          </div>
          <Trophy className="h-5 w-5 text-amber-400" />
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-9">
        {statCards.map((c) => (
          <Card key={c.label} className="transition hover:border-primary/40">
            <CardContent className="p-4">
              <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', c.tone)}>
                <c.icon className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold tabular-nums">{c.value ?? '—'}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current campaigns + today */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Current campaigns</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
                View all <ChevronRight className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats?.currentCampaigns.filter((s) => s.count > 0).map((s) => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <StatusBadge status={s.status} />
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </div>
              ))}
              {!stats?.currentCampaigns.length && <p className="text-sm text-muted-foreground">No campaigns yet — add a creator.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today's activity</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <TodayItem label="DMs" value={stats?.today.dms} />
              <TodayItem label="Comments" value={stats?.today.comments} />
              <TodayItem label="Replies" value={stats?.today.replies} />
              <TodayItem label="New creators" value={stats?.today.newCreators} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><ActivityIcon className="h-4 w-4" /> Live feed</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/activity')}>All</Button>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {activity.slice(0, 7).map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(a.ts)}</span>
                  <span className={cn('shrink-0', a.status === 'failed' ? 'text-red-400' : a.status === 'info' ? 'text-amber-400' : 'text-emerald-400')}>
                    {a.status === 'failed' ? '✕' : a.status === 'info' ? 'ℹ' : '✓'}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{ACTION_LABELS[a.actionType] ?? a.actionType}</span>
                    {a.creatorUsername && <span className="text-muted-foreground"> — @{a.creatorUsername}</span>}
                    {a.campaignDay && <Badge variant="gray" className="ml-1 px-1.5 py-0 text-[10px]">Day {a.campaignDay}</Badge>}
                  </span>
                </div>
              ))}
              {!activity.length && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </CardContent>
          </Card>
        </div>

        {/* Creator table */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
            <CardTitle className="mr-auto">Creators</CardTitle>
            <div className="flex flex-wrap gap-1">
              {DASHBOARD_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition',
                    filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Creator</TH>
                  <TH>Day</TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Account</TH>
                  <TH className="hidden lg:table-cell">Last DM</TH>
                  <TH className="hidden lg:table-cell">Last reply</TH>
                  <TH>Next action</TH>
                </TR>
              </THead>
              <TBody>
                {creators.map((c) => (
                  <TR key={c.id} className="cursor-pointer" onClick={() => navigate(`/creators?thread=${c.id}`)}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/40 text-xs font-bold">
                          {c.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <a href={c.profileUrl ?? '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block font-medium hover:text-primary">
                            @{c.username}
                          </a>
                          <span className="text-[10px] text-muted-foreground">Added {timeAgo(c.createdAt)}</span>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {c.status === 'waiting' ? <span className="text-muted-foreground">—</span> : <Badge variant="gray">Day {c.currentDay}/{c.maxDays}</Badge>}
                    </TD>
                    <TD><StatusBadge status={c.status} /></TD>
                    <TD className="hidden md:table-cell text-xs text-muted-foreground">{c.accountUsername ? `@${c.accountUsername}` : '—'}</TD>
                    <TD className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.lastDmAt)}</TD>
                    <TD className="hidden lg:table-cell text-xs">
                      {c.lastResponseAt ? <span className="text-sky-400">{timeAgo(c.lastResponseAt)}</span> : <span className="text-muted-foreground">—</span>}
                    </TD>
                    <TD className="max-w-[160px] truncate text-xs text-muted-foreground">{c.nextAction}</TD>
                  </TR>
                ))}
                {!creators.length && (
                  <TR>
                    <TD colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No creators match this filter. <button className="text-primary underline" onClick={() => setAddOpen(true)}>Add your first creator</button>
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AddCreatorModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => load().catch(() => {})} />
    </div>
  );
}

function TodayItem({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-xl font-bold tabular-nums">{value ?? 0}</div>
      <div className="text-[11px] text-muted-foreground">{label} today</div>
    </div>
  );
}
