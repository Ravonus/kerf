import { state } from '@kerf/core'
import { Toggle } from '@kerf/veneer'

export function ToggleSizes() {
  const small = state(true)
  const medium = state(true)
  const large = state(true)
  return (
    <>
      <Toggle
        size="sm"
        pressed={small.value}
        onClick={() => (small.value = !small.value)}
      >
        Bold
      </Toggle>
      <Toggle
        pressed={medium.value}
        onClick={() => (medium.value = !medium.value)}
      >
        Bold
      </Toggle>
      <Toggle
        size="lg"
        pressed={large.value}
        onClick={() => (large.value = !large.value)}
      >
        Bold
      </Toggle>
    </>
  )
}
