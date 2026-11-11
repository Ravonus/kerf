import { state } from '@kerf/core'
import {
  Badge,
  Heading,
  Row,
  Stack,
  Tabs,
} from '@kerf/veneer'
import { SECTIONS, panel } from './shared'

export function TabsProjectPage() {
  const tab = state('overview')
  return (
    <Stack gap="group">
      <Row
        justify="between"
        gap="group"
      >
        <Heading level={3}>storefront</Heading>
        <Badge
          tone="positive"
          dot
        >
          Live
        </Badge>
      </Row>
      <Tabs
        label="storefront"
        value={tab.value}
        onChange={(v) => (tab.value = v)}
        options={SECTIONS}
      >
        {panel}
      </Tabs>
    </Stack>
  )
}
