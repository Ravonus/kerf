import {
  Badge,
  Button,
  Row,
  Text,
  Tooltip,
} from '@kerf/veneer'

export const TooltipStatusRow = () => (
  <Row
    justify="between"
    gap="group"
  >
    <Text>mobile-bff</Text>
    <Row gap="tight">
      <Badge
        tone="critical"
        dot
      >
        Failed
      </Badge>
      <Tooltip
        content="Retry timed out upstream calls"
        side="left"
      >
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
          icon="info"
          label="Why it failed"
        />
      </Tooltip>
    </Row>
  </Row>
)
