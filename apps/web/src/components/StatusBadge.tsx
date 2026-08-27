import { Badge } from './ui/badge';
import { STATUS_META, type CampaignStatus, type ResponseStatus } from '@pc/shared';

const toneMap: Record<string, 'green' | 'yellow' | 'blue' | 'violet' | 'red' | 'gray' | 'orange'> = {
  active: 'green',
  waiting: 'yellow',
  replied: 'blue',
  positive: 'violet',
  maybe: 'yellow',
  declined: 'red',
  blocked: 'red',
  completed: 'blue',
  paused: 'orange',
  stopped: 'red',
  error: 'red',
  none: 'gray',
};

export function StatusBadge({ status }: { status: CampaignStatus | ResponseStatus | string }) {
  const meta = STATUS_META[status as CampaignStatus];
  const tone = meta?.tone ?? toneMap[status] ?? 'gray';
  const label = meta?.label ?? status;
  const emoji = meta?.emoji ?? '•';
  return (
    <Badge variant={tone}>
      <span>{emoji}</span>
      <span className="capitalize">{label}</span>
    </Badge>
  );
}
