import { Button, Row, Tooltip } from '@weft-js/warp'

export const TooltipIconBar = () => (
  <Row gap="tight">
    <Tooltip content="Redeploy" kbd="R">
      <Button emphasis="ghost" tone="neutral" icon="rocket" label="Redeploy" />
    </Tooltip>
    <Tooltip content="Open logs" kbd="L">
      <Button emphasis="ghost" tone="neutral" icon="external" label="Open logs" />
    </Tooltip>
    <Tooltip content="Copy commit" kbd="C">
      <Button emphasis="ghost" tone="neutral" icon="copy" label="Copy commit" />
    </Tooltip>
    <Tooltip content="Delete">
      <Button emphasis="ghost" tone="critical" icon="trash" label="Delete" />
    </Tooltip>
  </Row>
)
