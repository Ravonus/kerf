import { state } from '@kerf-js/core'
import { Tabs, Text } from '@kerf-js/veneer'
import { REGIONS } from './shared'

export function TabsOverflow() {
  const tab = state('eu-west')
  return (
    <Tabs
      label="Region"
      value={tab.value}
      onChange={(v) => (tab.value = v)}
      options={REGIONS}
    >
      {(v) => (
        <Text subtle>Traffic served from {v}.</Text>
      )}
    </Tabs>
  )
}
