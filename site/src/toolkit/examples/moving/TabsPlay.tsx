import { state } from '@kerf/core'
import { Stack, Tabs, Text } from '@kerf/veneer'
import { SECTIONS, WORDS } from './shared'

export function TabsPlay({
  variant,
}: {
  variant: 'line' | 'pill' | 'enclosed'
}) {
  const tab = state('overview')
  return (
    <Stack>
      <Tabs
        label="Project"
        variant={variant}
        value={tab.value}
        onChange={(v) => (tab.value = v)}
        options={SECTIONS}
      >
        {(v) => <Text>{WORDS[v]}</Text>}
      </Tabs>
    </Stack>
  )
}
