import { state } from '@kerf/core'
import { Toggle } from '@kerf/veneer'

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
