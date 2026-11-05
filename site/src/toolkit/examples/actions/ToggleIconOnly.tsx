import { state } from '@weft-js/core'
import { Toggle } from '@weft-js/warp'

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
