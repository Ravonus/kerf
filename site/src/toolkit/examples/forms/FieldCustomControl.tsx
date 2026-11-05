import { state } from '@weft-js/core'
import { Button, Input } from '@weft-js/warp'

export function FieldCustomControl() {
  const token = state('tsl_4f9c2e71')
  const rotate = () => (token.value = `tsl_${Math.random().toString(16).slice(2, 10)}`)
  return (
    <Input
      label="Deploy token"
      hint="Rotating it stops the old one straight away."
      end={
        <Button size="sm" emphasis="ghost" tone="neutral" onClick={rotate}>
          Rotate
        </Button>
      }
      value={token.value}
      readonly
    />
  )
}
