import * as React from 'react';
import {
  Plus,
  Play,
  Pause,
  Square,
  SkipForward,
  RotateCcw,
  Ban,
  Eye,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { StatusBadge } from '../components/StatusBadge';
import { Input } from '../components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { Modal } from '../components/ui/modal';
import { api } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { DASHBOARD_FILTERS, type CreatorDTO } from '@pc/shared';
import { AddCreatorModal } from '../components/AddCreatorModal';
import { useToast } from '../components/ui/toast';

export function Creators() {
  const toast = useToast();
  const [creators, setCreators] = React.useState<CreatorDTO[]>([]);
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [thread, setThread] = React.useState<CreatorDTO | null>(null);

  const load = React.useCallback(async () => {
    setCreators(await api.creators({ status: filter, q }));
  }, [filter, q]);

  React.useEffect(() => {
    load().catch((e) => toast('error', e.message));
  }, [load]);

  const control = async (c: CreatorDTO, action: string) => {
    try {
      await api.creatorControl(c.id, action);
      toast('success', `@${c.username}: ${action.replace('_', ' ')} done.`);
      load();
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Creators</h1>
          <p className="text-sm text-muted-foreground">Every creator gets an independent campaign. Automation stops the moment they reply.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Creator
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search username…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ml-auto flex flex-wrap gap-1">
            {DASHBOARD_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? 'rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Creator</TH>
              <TH>Day</TH>
              <TH>Status</TH>
              <TH className="hidden md:table-cell">DMs</TH>
              <TH className="hidden md:table-cell">Comments</TH>
              <TH className="hidden lg:table-cell">Last interaction</TH>
              <TH className="text-right">Controls</TH>
            </TR>
          </THead>
          <TBody>
            {creators.map((c) => (
              <TR key={c.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/40 text-xs font-bold">
                      {c.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <a href={c.profileUrl ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium hover:text-primary">
                        @{c.username} <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                      <span className="text-[10px] text-muted-foreground">
                        {c.excluded ? 'Excluded · ' : ''}via @{c.accountUsername ?? 'no account'}
                      </span>
                    </div>
                  </div>
                </TD>
                <TD>{c.status === 'waiting' ? <span className="text-muted-foreground">—</span> : <Badge variant="gray">{c.currentDay}/{c.maxDays}</Badge>}</TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD className="hidden md:table-cell">{c.dmEnabled ? '✅' : '⛔'}</TD>
                <TD className="hidden md:table-cell">{c.commentEnabled ? '✅' : '⛔'}</TD>
                <TD className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.lastInteractionAt)}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="View conversation" onClick={() => setThread(c)}><Eye className="h-4 w-4" /></IconBtn>
                    {['waiting', 'stopped', 'paused'].includes(c.status) && !['replied', 'positive', 'declined', 'maybe', 'blocked'].includes(c.responseStatus) && (
                      <IconBtn title="Start / Resume" onClick={() => control(c, 'start')} tone="text-emerald-400"><Play className="h-4 w-4" /></IconBtn>
                    )}
                    {c.status === 'active' && <IconBtn title="Pause" onClick={() => control(c, 'pause')}><Pause className="h-4 w-4" /></IconBtn>}
                    <IconBtn title="Skip day" onClick={() => control(c, 'skip_day')}><SkipForward className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Restart campaign" onClick={() => control(c, 'restart')}><RotateCcw className="h-4 w-4" /></IconBtn>
                    {c.status !== 'stopped' && <IconBtn title="Stop" tone="text-red-400" onClick={() => control(c, 'stop')}><Square className="h-4 w-4" /></IconBtn>}
                    {!c.excluded && <IconBtn title="Exclude creator" tone="text-orange-400" onClick={() => control(c, 'exclude')}><Ban className="h-4 w-4" /></IconBtn>}
                  </div>
                </TD>
              </TR>
            ))}
            {!creators.length && (
              <TR><TD colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No creators found. Add one to start the mission.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <AddCreatorModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <ConversationModal creator={thread} onClose={() => setThread(null)} />
    </div>
  );
}

function IconBtn({ children, title, onClick, tone = 'text-muted-foreground' }: { children: React.ReactNode; title: string; onClick: () => void; tone?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 hover:bg-secondary ${tone}`}
    >
      {children}
    </button>
  );
}

function ConversationModal({ creator, onClose }: { creator: CreatorDTO | null; onClose: () => void }) {
  const [data, setData] = React.useState<any>(null);
  React.useEffect(() => {
    if (creator) api.conversation(creator.id).then(setData).catch(() => setData(null));
  }, [creator]);

  return (
    <Modal open={!!creator} onClose={onClose} title={creator ? `Conversation with @${creator.username}` : ''} wide>
      {creator && (
        <div className="space-y-4">
          {creator.responseStatus !== 'none' && (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
              🛑 Creator replied — <b>automation paused</b>. Status: <StatusBadge status={creator.responseStatus} />
            </div>
          )}
          <div className="space-y-3">
            {data?.thread?.map((m: any) => (
              <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={
                    m.direction === 'in'
                      ? 'max-w-[75%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm'
                      : 'max-w-[75%] rounded-2xl rounded-tr-sm bg-primary/90 px-4 py-2.5 text-sm text-primary-foreground'
                  }
                >
                  <div className="mb-1 flex items-center gap-2 text-[10px] opacity-70">
                    <span>{m.channel === 'comment' ? '💬 comment' : '📩 DM'}</span>
                    {m.day && <span>Day {m.day}</span>}
                    <span>{timeAgo(m.ts)}</span>
                  </div>
                  {m.text}
                </div>
              </div>
            ))}
            {!data?.thread?.length && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — Day 1 goes out when the campaign starts.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
