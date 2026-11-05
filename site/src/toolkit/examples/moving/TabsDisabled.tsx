import { state } from '@weft-js/core'
import { Tabs, Text } from '@weft-js/warp'
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
            : 'storefront.weft.app and two more.'}
        </Text>
      )}
    </Tabs>
  )
}
