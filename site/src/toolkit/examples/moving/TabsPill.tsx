import { state } from '@kerf-js/core'
import { Tabs, Text } from '@kerf-js/veneer'
import { SECTIONS, WORDS } from './shared'

export function TabsPill() {
  const tab = state('overview')
  return (
    <Tabs
      label="Project"
      variant="pill"
      value={tab.value}
      onChange={(v) => (tab.value = v)}
      options={SECTIONS}
    >
      {(v) => <Text>{WORDS[v]}</Text>}
    </Tabs>
  )
}
