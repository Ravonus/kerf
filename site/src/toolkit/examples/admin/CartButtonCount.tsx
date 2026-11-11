import { state } from '@kerf-js/core'
import { Button, CartButton } from '@kerf-js/veneer'

// -- shop --

export function CartButtonCount() {
  const count = state(3)
  return (
    <>
      <CartButton
        count={count.value}
        onClick={() => (count.value = 0)}
      />
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        onClick={() => count.value++}
      >
        Add a hoodie
      </Button>
    </>
  )
}
