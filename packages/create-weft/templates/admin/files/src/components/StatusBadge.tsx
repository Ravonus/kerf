import { Badge, type Tone } from '@weft-js/warp'

const tones: Record<string, Tone> = { pending: 'caution', paid: 'info', shipped: 'positive', refunded: 'critical' }

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={tones[status]}>{status}</Badge>
}
