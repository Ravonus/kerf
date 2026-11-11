import { derived } from '@kerf-js/core'
import { interaction } from '@kerf-js/core/interaction'
import { Button, Card } from '@kerf-js/veneer'

export default function Pointer() {
  // No `share`: this row is private to this one button.
  const row = interaction()
  const words = derived(() => {
    const on = [
      row.hover.value && 'hovered',
      row.focus.value && 'focused',
      row.pressed.value && 'pressed',
    ]
    return on.filter(Boolean).join(', ') || 'idle'
  })
  return (
    <Card title="One button, three bits">
      <Button ui={row}>Press me</Button>
      <p>Right now it is {words.value}.</p>
    </Card>
  )
}
