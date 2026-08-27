import * as React from 'react';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { Input, Label, Textarea, Select } from './ui/input';
import { Switch } from './ui/switch';
import { api } from '../lib/api';
import { useToast } from './ui/toast';
import type { InstagramAccountDTO } from '@pc/shared';

export function AddCreatorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const toast = useToast();
  const [accounts, setAccounts] = React.useState<InstagramAccountDTO[]>([]);
  const [username, setUsername] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [maxDays, setMaxDays] = React.useState('5');
  const [accountId, setAccountId] = React.useState('');
  const [dmEnabled, setDmEnabled] = React.useState(true);
  const [commentEnabled, setCommentEnabled] = React.useState(true);
  const [autoStart, setAutoStart] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      api.accounts().then((r) => {
        setAccounts(r.accounts.filter((a) => a.status === 'connected'));
        if (r.accounts[0]) setAccountId(r.accounts[0].id);
      }).catch(() => {});
      setUsername('');
      setNotes('');
    }
  }, [open]);

  const submit = async () => {
    if (!/^@?[A-Za-z0-9._]{1,30}$/.test(username)) {
      toast('error', 'Enter a valid Instagram username.');
      return;
    }
    setBusy(true);
    try {
      await api.addCreator({
        username,
        notes,
        maxDays: Number(maxDays),
        accountId: accountId || null,
        dmEnabled,
        commentEnabled,
        autoStart,
      });
      toast('success', autoStart ? `@${username.replace(/^@/, '')} added — Day 1 DM scheduled.` : `@${username.replace(/^@/, '')} added (campaign not started).`);
      onClose();
      onCreated?.();
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Creator">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Instagram username *</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@creator123" autoFocus />
          <p className="text-xs text-muted-foreground">We only contact creators you explicitly add — never arbitrary accounts from followers/following lists.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Connected account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.length === 0 && <option value="">No account connected</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Campaign days</Label>
            <Input type="number" min={1} max={30} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
          <ToggleRow label="DM outreach enabled" checked={dmEnabled} onChange={setDmEnabled} />
          <ToggleRow label="Comment outreach enabled" checked={commentEnabled} onChange={setCommentEnabled} />
          <ToggleRow label="Apply campaign automatically (start now)" checked={autoStart} onChange={setAutoStart} />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for AI personalization — niche, recent posts, tone…" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add creator'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}
