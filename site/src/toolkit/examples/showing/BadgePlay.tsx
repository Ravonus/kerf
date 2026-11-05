import { Badge } from '@weft-js/warp'

export const BadgePlay = (p: {
  children: string
  tone: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'
  emphasis: 'soft' | 'solid' | 'outline'
  dot: boolean
  count: boolean
}) => (
  <Badge tone={p.tone} emphasis={p.emphasis} dot={p.dot} count={p.count}>
    {p.children}
  </Badge>
)
