import { Badge } from '@weft-js/warp'

export const BadgeCount = () => (
  <>
    <Badge count tone="accent" srText="unread comments">
      3
    </Badge>
    <Badge count tone="critical" emphasis="solid" srText="failed deploys">
      12
    </Badge>
    <Badge count emphasis="outline" srText="open reviews">
      99+
    </Badge>
  </>
)
