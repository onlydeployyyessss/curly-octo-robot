import * as React from 'react';
import { Sparkles, Wand2, Send, Save, Bot, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input, Label, Select, Textarea } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { api } from '../lib/api';
import { useToast } from '../components/ui/toast';

const EMOJIS = ['😭', '😂', '🙏', '💀', '👀'];

export function Messages() {
  const toast = useToast();
  const [aiOn, setAiOn] = React.useState(false);
  const [aiModel, setAiModel] = React.useState('openai/gpt-4o-mini');
  const [templates, setTemplates] = React.useState<{ day: number; dm: string; comment: string }[]>([]);
  const [creators, setCreators] = React.useState<{ id: string; username: string; currentDay: number }[]>([]);
  const [pickCreator, setPickCreator] = React.useState('');
  const [pickChannel, setPickChannel] = React.useState<'dm' | 'comment'>('dm');
  const [pickDay, setPickDay] = React.useState('');
  const [preview, setPreview] = React.useState<{ message: string; source: string; day?: number } | null>(null);
  const [testMsg, setTestMsg] = React.useState('');

  React.useEffect(() => {
    (async () => {
      const [tpls, settings, cs] = await Promise.all([api.templates(), api.settings(), api.creators()]);
      setAiOn(settings.aiPersonalization);
      setAiModel(settings.aiModel);
      setCreators(cs.map((c) => ({ id: c.id, username: c.username, currentDay: c.currentDay })));
      setTemplates(
        [1, 2, 3, 4, 5].map((d) => ({
          day: d,
          dm: tpls.find((t) => t.channel === 'dm' && t.dayNumber === d)?.content ?? `Day ${d} asking for a PC ${EMOJIS[d - 1]}`,
          comment: tpls.find((t) => t.channel === 'comment' && t.dayNumber === d)?.content ?? `Day ${d} asking for a PC ${EMOJIS[d - 1]}`,
        })),
      );
    })().catch((e) => toast('error', e.message));
  }, []);

  const saveTemplates = async () => {
    await api.saveTemplates(templates.flatMap((t) => [
      { channel: 'dm' as const, dayNumber: t.day, content: t.dm },
      { channel: 'comment' as const, dayNumber: t.day, content: t.comment },
    ]));
    toast('success', 'Approved templates saved.');
  };

  const toggleAi = async (v: boolean) => {
    setAiOn(v);
    await api.saveSettings({ aiPersonalization: v });
    toast(v ? 'success' : 'info', v ? 'AI personalization ON — OpenRouter will personalize while preserving the approved message intent.' : 'AI personalization OFF — fixed approved templates will be used.');
  };

  const generate = async () => {
    if (!pickCreator) return toast('error', 'Pick a creator to personalize for.');
    try {
      const r: { message: string; source: string; day?: number } = await api.generateMessage(pickCreator, pickChannel, pickDay ? Number(pickDay) : undefined);
      setPreview(r);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const sendTest = async (toTelegram: boolean) => {
    if (!testMsg.trim()) return toast('error', 'Write a test message first.');
    try {
      await api.sendTest(testMsg, toTelegram);
      toast('success', toTelegram ? 'Test message sent to Telegram.' : 'Test logged in activity (no real creator contacted).');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages & AI</h1>
        <p className="text-sm text-muted-foreground">Approved templates, OpenRouter personalization, and safe test sends. Every generated message is stored in the activity log before sending.</p>
      </div>

      <Card className={aiOn ? 'border-violet-500/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-400" /> AI personalization (OpenRouter)</CardTitle>
          <CardDescription>
            When ON, the AI rephrases the approved day message using the creator's public profile & previous interactions — without fabricating promises, impersonating, or manipulating. Guardrails reject policy-violating output and fall back to the approved template.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={aiOn} onCheckedChange={toggleAi} label="AI personalization" />
            <span className="text-sm font-medium">{aiOn ? 'ON' : 'OFF'}</span>
          </div>
          <div className="w-64 space-y-1.5">
            <Label>Model</Label>
            <Select value={aiModel} onChange={(e) => { setAiModel(e.target.value); api.saveSettings({ aiModel: e.target.value }); }}>
              <option value="openai/gpt-4o-mini">openai/gpt-4o-mini (fast, cheap)</option>
              <option value="openai/gpt-4o">openai/gpt-4o</option>
              <option value="anthropic/claude-3.5-sonnet">anthropic/claude-3.5-sonnet</option>
              <option value="meta-llama/llama-3.1-70b-instruct">meta-llama/llama-3.1-70b</option>
            </Select>
          </div>
          <Badge variant={aiOn ? 'violet' : 'gray'}>{aiOn ? 'Personalized messages' : 'Fixed templates'}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Approved daily templates</CardTitle>
            <Button size="sm" onClick={saveTemplates}><Save className="h-3.5 w-3.5" /> Save</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.map((t) => (
              <div key={t.day} className="grid gap-2 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-[60px_1fr_1fr]">
                <Badge variant="default" className="h-fit justify-center py-1">Day {t.day} {EMOJIS[t.day - 1]}</Badge>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">📩 DM</Label>
                  <Textarea rows={2} value={t.dm} onChange={(e) => setTemplates((p) => p.map((x) => (x.day === t.day ? { ...x, dm: e.target.value } : x)))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">💬 Comment</Label>
                  <Textarea rows={2} value={t.comment} onChange={(e) => setTemplates((p) => p.map((x) => (x.day === t.day ? { ...x, comment: e.target.value } : x)))} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-violet-400" /> Generate message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Creator</Label>
                <Select value={pickCreator} onChange={(e) => setPickCreator(e.target.value)}>
                  <option value="">Select creator…</option>
                  {creators.map((c) => <option key={c.id} value={c.id}>@{c.username} (day {c.currentDay})</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select value={pickChannel} onChange={(e) => setPickChannel(e.target.value as 'dm' | 'comment')}>
                    <option value="dm">📩 DM</option>
                    <option value="comment">💬 Comment</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Day (optional)</Label>
                  <Input type="number" min={1} max={10} value={pickDay} onChange={(e) => setPickDay(e.target.value)} placeholder="auto" />
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={generate}><Sparkles className="h-4 w-4" /> {aiOn ? 'Generate with AI' : 'Preview template'}</Button>
              {preview && (
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
                  <Badge variant={preview.source === 'ai' ? 'violet' : 'gray'} className="mb-2">{preview.source === 'ai' ? 'AI personalized' : 'Approved template'} · day {preview.day}</Badge>
                  <p className="leading-relaxed">{preview.message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Send test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} placeholder="Type a test message…" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => sendTest(false)}>Log only</Button>
                <Button size="sm" onClick={() => sendTest(true)}>Send to Telegram</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Instagram test messages are logged, never sent to real creators.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
