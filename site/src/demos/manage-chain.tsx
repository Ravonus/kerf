import { derived, state } from '@kerf-js/core'
import { Button, Card, Input, Row } from '@kerf-js/veneer'

const PRICE = 18

export default function Tea() {
  const qty = state(2)
  const code = state('')
  // Total reads subtotal and discount, which read
  // the boxes.
  const subtotal = derived(() => PRICE * qty.value)
  const discount = derived(() => {
    const entered = code.value.trim().toUpperCase()
    return entered === 'TEA10' ? 0.1 : 0
  })
  const total = derived(
    () => subtotal.value * (1 - discount.value),
  )
  return (
    <Card title="Loose-leaf tea">
      <p>
        {qty.value} × ${PRICE} = ${subtotal.value}
      </p>
      <Row gap="tight">
        <Button
          size="sm"
          onClick={() => qty.value++}
        >
          Add one
        </Button>
        <Button
          size="sm"
          emphasis="ghost"
          disabled={qty.value <= 1}
          onClick={() => qty.value--}
        >
          Remove one
        </Button>
      </Row>
      <Input
        label="Discount code"
        hint="Try TEA10"
        value={code.value}
        onInput={(e) =>
          (code.value = e.currentTarget.value)
        }
      />
      <p>
        <strong>Total ${total.value.toFixed(2)}</strong>
        {discount.value > 0 && ' with 10% off'}
      </p>
    </Card>
  )
}
