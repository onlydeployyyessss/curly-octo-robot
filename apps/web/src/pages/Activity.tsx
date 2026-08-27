import * as React from 'react';
import { Activity as ActivityIcon, CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { api } from '../lib/api';
import { cn, formatTime, formatDate } from '../lib/utils';
import { useToast } from '../components/ui/toast';
import type { ActivityEventDTO } from '@pc/shared';

const LABELS: Record<string, string> = {
  dm_sent: 'DM sent',
  comment_posted: 'Comment posted',
  dm_received: 'DM received',
  comment_received: 'Comment reply',
  message_prepared: 'Message prepared (stored before send)',
  campaign_started: 'Campaign started',
  campaign_paused: 'Campaign paused',
  campaign_resumed: 'Campaign resumed',
  campaign_stopped: 'Campaign stopped',
  campaign_completed: 'Campaign completed',
  campaign_restarted: 'Campaign restarted',
  day_skipped: 'Day skipped',
  creator_excluded: 'Creator excluded',
  oauth_connected: 'OAuth connected',
  oauth_expired: 'OAuth token expired',
  report_sent: 'Telegram report sent',
  instant_alert_sent: 'Telegram alert sent',
  automation_stopped: 'ALL AUTOMATION STOPPED',
  automation_resumed: 'Automation resumed',
  test_sent: 'Test message',
  ai_generated: 'AI message generated',
  manual_action_required: 'Manual action required',
  error: 'Error',
};

export function Activity() {
  const toast = useToast();
  const [events, setEvents] = React.useState<ActivityEventDTO[]>([]);
  const [errors, setErrors] = React.useState<any[]>([]);
  const [tab, setTab] = React.useState<'activity' | 'errors'>('activity');

  const load = React.useCallback(async () => {
    setEvents(await api.activity({ limit: 200 }));
    const e: { errors: any[] } = await api.errors();
    setErrors(e.errors);
  }, []);
  React.useEffect(() => {
    load().catch((e) => toast('error', e.message));
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-sm text-muted-foreground">Complete event history — every send, reply, pause, and error with idempotency traceability.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          <button onClick={() => setTab('activity')} className={cn('rounded-md px-3 py-1.5 text-sm', tab === 'activity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            Events
          </button>
          <button onClick={() => setTab('errors')} className={cn('rounded-md px-3 py-1.5 text-sm', tab === 'errors' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            Errors {errors.length > 0 && <Badge variant="red" className="ml-1">{errors.length}</Badge>}
          </button>
        </div>
      </div>

      {tab === 'activity' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ActivityIcon className="h-4 w-4 text-primary" /> Event history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>Event</TH>
                  <TH>Creator</TH>
                  <TH>Day</TH>
                  <TH className="hidden md:table-cell">Content</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {events.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-xs text-muted-foreground">
                      <div>{formatDate(e.ts)}</div>
                      <div>{formatTime(e.ts)}</div>
                    </TD>
                    <TD className="font-medium">{LABELS[e.actionType] ?? e.actionType}</TD>
                    <TD className="text-sm">{e.creatorUsername ? `@${e.creatorUsername}` : '—'}</TD>
                    <TD>{e.campaignDay ? <Badge variant="gray">Day {e.campaignDay}</Badge> : '—'}</TD>
                    <TD className="hidden max-w-[320px] truncate text-xs text-muted-foreground md:table-cell">{e.content}</TD>
                    <TD>
                      {e.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : e.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-red-400" />
                      ) : (
                        <Info className="h-4 w-4 text-amber-400" />
                      )}
                    </TD>
                  </TR>
                ))}
                {!events.length && <TR><TD colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No events yet.</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={async () => { await api.resolveErrors(); load(); toast('success', 'Errors marked resolved.'); }}>
              Mark all resolved
            </Button>
          </div>
          {errors.map((e) => (
            <Card key={e.id} className="border-red-500/30">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="red">{e.service}</Badge>
                    {e.errorClass && <Badge variant="orange">{e.errorClass}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(e.ts)} {formatTime(e.ts)}</span>
                  </div>
                  <p className="mt-2 text-sm">{e.message}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!errors.length && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">✅ No unresolved errors. All systems nominal.</CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
