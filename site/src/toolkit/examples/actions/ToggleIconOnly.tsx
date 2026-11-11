import { state } from '@kerf-js/core'
import { Toggle } from '@kerf-js/veneer'

export function ToggleIconOnly() {
  const pinned = state(true)
  return (
    <Toggle
      icon="pin"
      label="Pin this project"
      pressed={pinned.value}
      onClick={() => (pinned.value = !pinned.value)}
    />
  )
}
