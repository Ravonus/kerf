import { OrderConfirmation } from '@weft-js/warp'
import { PEOPLE } from '../../world'

export const OrderConfirmationPlaced = () => (
  <OrderConfirmation
    orderId="T-2041"
    email={PEOPLE[0]!.email}
    stage="packed"
    note="Standard delivery, arrives Thu 6 Nov."
    onTrack={() => {}}
    onContinue={() => {}}
  />
)
