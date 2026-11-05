import { Button, Badge } from '@weft-js/warp'

export const BadgeOnAButton = () => (
  <Button emphasis="outline" tone="neutral" icon="bell">
    Alerts{' '}
    <Badge count tone="critical" emphasis="solid" srText="new">
      2
    </Badge>
  </Button>
)
