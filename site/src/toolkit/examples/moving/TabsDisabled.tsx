import { state } from '@kerf/core'
import { Tabs, Text } from '@kerf/veneer'
import { PLANNED } from './shared'

export function TabsDisabled() {
  const tab = state('general')
  return (
    <Tabs
      label="Settings"
      value={tab.value}
      onChange={(v) => (tab.value = v)}
      options={PLANNED}
    >
      {(v) => (
        <Text>
          {v === 'general'
            ? 'Name, region and owner.'
            : 'storefront.kerf.app and two more.'}
        </Text>
      )}
    </Tabs>
  )
}
