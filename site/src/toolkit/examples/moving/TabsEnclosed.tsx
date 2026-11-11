import { state } from '@kerf/core'
import { Tabs, Text } from '@kerf/veneer'
import { SECTIONS, WORDS } from './shared'

export function TabsEnclosed() {
  const tab = state('overview')
  return (
    <Tabs
      label="Project"
      variant="enclosed"
      value={tab.value}
      onChange={(v) => (tab.value = v)}
      options={SECTIONS}
    >
      {(v) => <Text>{WORDS[v]}</Text>}
    </Tabs>
  )
}
