import * as React from 'react';
import { Reply as ReplyIcon, PauseCircle, Plus, Send, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input, Label, Select, Textarea } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { useToast } from '../components/ui/toast';
import type { ReplyDTO, ResponseStatus } from '@pc/shared';

const SENTIMENT_BADGE: Record<string, 'violet' | 'yellow' | 'red' | 'blue' | 'gray'> = {
  positive: 'violet',
  maybe: 'yellow',
  declined: 'red',
  blocked: 'red',
  replied: 'blue',
  none: 'gray',
};

export function Replies() {
  const toast = useToast();
  const [replies, setReplies] = React.useState<ReplyDTO[]>([]);
  const [manualOpen, setManualOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setReplies(await api.replies());
  }, []);
  React.useEffect(() => {
    load().catch((e) => toast('error', e.message));
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Creator Replies</h1>
          <p className="text-sm text-muted-foreground">Any reply immediately stops automation for that creator. You follow up manually.</p>
        </div>
        <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" /> Log a reply manually</Button>
      </div>

      <div className="grid gap-4">
        {replies.map((r) => (
          <Card key={r.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-5 sm:flex-row">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
                  {r.platform === 'dm' ? <Send className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">@{r.creatorUsername}</span>
                    <Badge variant={SENTIMENT_BADGE[r.sentiment] ?? 'blue'}>{r.sentiment}</Badge>
                    <Badge variant="gray">{r.platform === 'dm' ? '📩 DM reply' : '💬 comment reply'}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.ts)}</span>
                  </div>

                  {r.ourText && (
                    <div className="rounded-lg rounded-tl-sm bg-secondary px-3 py-2 text-sm text-muted-foreground">
                      <span className="mr-1 text-[10px] uppercase opacity-70">Your message:</span>“{r.ourText}”
                    </div>
                  )}
                  <div className="rounded-lg rounded-tl-sm border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-sm">
                    “{r.text}”
                  </div>
                  {r.mediaRef && (
                    <a href={r.mediaRef} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">📍 View post/reel</a>
                  )}

                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <PauseCircle className="h-4 w-4 text-amber-400" />
                    <span>
                      <b>Creator replied — automation paused.</b> Campaign: <StatusBadge status={r.sentiment as ResponseStatus} />
                    </span>
                    {r.notified ? <Badge variant="green" className="ml-auto">Telegram alert sent</Badge> : <Badge variant="yellow" className="ml-auto">Alert pending</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {!replies.length && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <ReplyIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No replies yet. When a creator responds, it appears here and automation for them pauses instantly.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <ManualReplyModal open={manualOpen} onClose={() => setManualOpen(false)} onSaved={load} />
    </div>
  );
}

function ManualReplyModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [username, setUsername] = React.useState('');
  const [text, setText] = React.useState('');
  const [platform, setPlatform] = React.useState<'dm' | 'comment'>('dm');
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!username || !text) return toast('error', 'Username and reply text are required.');
    setBusy(true);
    try {
      await api.manualReply({ username, text, platform });
      toast('success', 'Reply logged — automation paused for that creator.');
      onClose();
      setText('');
      onSaved();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log a creator reply">
      <div className="space-y-4">
        <CardDescription>If you saw a reply in the Instagram app (webhooks can be delayed), log it here — automation pauses immediately.</CardDescription>
        <div className="space-y-1.5">
          <Label>Creator username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@creator123" />
        </div>
        <div className="space-y-1.5">
          <Label>Where they replied</Label>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value as 'dm' | 'comment')}>
            <option value="dm">📩 DM</option>
            <option value="comment">💬 Comment</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Their reply</Label>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Sure bro, send me your details…" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Log reply & pause automation'}</Button>
        </div>
      </div>
    </Modal>
  );
}
