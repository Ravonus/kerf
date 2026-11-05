import { state } from '@weft-js/core'
import { PaymentMethods, Toaster } from '@weft-js/warp'
import type { PaymentMethod } from '@weft-js/warp'
import { CARDS } from '../../world'

export function PaymentMethodsSaved() {
  const cards = state<readonly PaymentMethod[]>(CARDS)
  return (
    <>
      <PaymentMethods
        methods={cards}
        onDefault={(card) =>
          (cards.value = cards.value.map((c) => ({
            ...c,
            default: c.id === card.id,
          })))
        }
        onRemove={(card) =>
          (cards.value = cards.value.filter(
            (c) => c !== card,
          ))
        }
        onRestore={(card) =>
          (cards.value = [...cards.value, card])
        }
      />
      <Toaster />
    </>
  )
}
