// ============================================================
// OpenRouter — optional AI message personalization.
//
// The AI may only rephrase the approved campaign message while
// preserving its intent (politely asking whether the creator can
// help get a PC). Guardrails are enforced in the system prompt and
// again validated on output. AI is OFF by default; when off, fixed
// approved templates are used.
// ============================================================
import { env } from '../env.js';
import { ExternalApiError } from '../lib/http.js';
import { recordSystemError } from '../lib/audit.js';

export interface PersonalizeInput {
  username: string;
  dayNumber: number;
  channel: 'dm' | 'comment';
  baseTemplate: string;
  creatorNotes?: string | null;
  previousInteraction?: string | null;
  profileInfo?: string | null;
}

const SYSTEM_PROMPT = `You write messages for a respectful, lighthearted Instagram outreach campaign.
The campaign owner is a fan politely asking a creator, once per day over several days, whether the creator could help them get a PC (gaming computer). The tone is self-deprecating and funny, like "Day 3 asking for a PC 🙏".

STRICT RULES — you must NEVER:
- Impersonate anyone else or pretend to be anyone other than the campaign owner.
- Fabricate conversations, fake quotes, or invented history.
- Claim or imply the creator already promised a PC.
- Harass, pressure, guilt-trip, threaten, beg aggressively, or insult.
- Manipulate (no false urgency, no lies about contests/winners/payments).
- Ask for passwords, payment, personal documents, or anything that bypasses platform rules.
- Include links, hashtags spam, @mentions of other people, or calls to action that violate Instagram rules.

You MUST:
- Keep the message SHORT (comments: under 60 characters; DMs: under 220 characters).
- Preserve the exact campaign meaning: "Day N of asking for help getting a PC".
- Stay polite, friendly and humorous.
- Output ONLY the message text — no quotes, no explanation, no labels.`;

export async function personalizeMessage(input: PersonalizeInput): Promise<string> {
  if (!env.openrouterApiKey) {
    throw new ExternalApiError('ai_failure', 'OpenRouter API key is not configured.');
  }
  const context = [
    input.profileInfo ? `Creator public profile: ${input.profileInfo}` : null,
    input.previousInteraction ? `Previous interaction: ${input.previousInteraction}` : null,
    input.creatorNotes ? `Campaign notes: ${input.creatorNotes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = `${context ? context + '\n\n' : ''}Channel: ${input.channel === 'comment' ? 'Instagram comment (must be very short)' : 'Instagram DM'}.
Creator: @${input.username}
Campaign day: ${input.dayNumber}
Approved base message to rephrase: "${input.baseTemplate}"

Write one ${input.channel === 'comment' ? 'comment' : 'DM'} for day ${input.dayNumber}. Keep the "Day ${input.dayNumber} asking for a PC" spirit.`;

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openrouterApiKey}`,
        'Content-Type': 'application/json',
        ...(env.openrouterSiteUrl ? { 'HTTP-Referer': env.openrouterSiteUrl } : {}),
        'X-Title': 'PC Mission',
      },
      body: JSON.stringify({
        model: env.openrouterModel,
        max_tokens: 160,
        temperature: 0.8,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    throw new ExternalApiError('ai_failure', `OpenRouter network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new ExternalApiError('rate_limited', 'OpenRouter rate limit reached.');
    throw new ExternalApiError('ai_failure', `OpenRouter error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: any = await res.json();
  let content: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
  content = content.replace(/^["'“”]+|["'“”]+$/g, '').trim();

  if (!content) {
    throw new ExternalApiError('ai_failure', 'OpenRouter returned an empty message.');
  }
  const violation = guardrailViolation(content, input);
  if (violation) {
    await recordSystemError('openrouter', `AI output rejected: ${violation}`, {
      errorClass: 'ai_failure',
      context: { username: input.username },
    });
    // Fail safe: fall back to the approved template instead of sending bad content.
    return input.baseTemplate;
  }
  return content.slice(0, input.channel === 'comment' ? 300 : 500);
}

/** Output validation — defense in depth on top of the system prompt. */
function guardrailViolation(text: string, input: PersonalizeInput): string | null {
  const lower = text.toLowerCase();
  const banned = [
    'password',
    'i am ',
    'we spoke',
    'you promised',
    'promised me',
    'you said you would',
    'legal action',
    'sue you',
    'will report you',
    'send me your card',
    'credit card',
    'http://',
    'https://',
  ];
  for (const b of banned) {
    if (lower.includes(b)) return `contains banned phrase: ${b}`;
  }
  if (text.length > 600) return 'message too long';
  // Must preserve campaign intent: mention day number and PC context.
  if (!/\bpc\b|computer|gaming setup/i.test(text)) return 'campaign intent not preserved (no PC reference)';
  if (!new RegExp(`day\\s*0?${input.dayNumber}`, 'i').test(text) && !/day/i.test(text)) {
    return 'campaign intent not preserved (no day reference)';
  }
  return null;
}
