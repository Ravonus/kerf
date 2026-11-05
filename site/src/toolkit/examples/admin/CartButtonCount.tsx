import { state } from '@weft-js/core'
import { Button, CartButton } from '@weft-js/warp'

// -- shop --

export function CartButtonCount() {
  const count = state(3)
  return (
    <>
      <CartButton count={count.value} onClick={() => (count.value = 0)} />
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => count.value++}>
        Add a hoodie
      </Button>
    </>
  )
}
