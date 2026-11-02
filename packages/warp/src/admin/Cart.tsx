import { BagIcon, MinusIcon, PlusIcon } from '@weft-js/warp-icons'
import { cartCount, cartTotals, money, type CartLine } from '@weft-js/warp-core'
import { derived, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { toast } from '../Toast'
import { afterFlush } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/app/badge.css' // the count's bump
import '@weft-js/warp-core/styles/flows/line-item.css'
import '@weft-js/warp-core/styles/flows/lines.css'
import '@weft-js/warp-core/styles/flows/qty.css'

export const setQuantity = (cart: State<CartLine[]>, id: string, quantity: number) => (cart.value = cart.value.map(l => (l.id === id ? { ...l, quantity } : l)))

/** Takes a line out, with Undo back to where it was. */
export function removeLine(cart: State<CartLine[]>, line: CartLine) {
  const at = cart.value.findIndex(l => l.id === line.id)
  cart.value = cart.value.filter(l => l.id !== line.id)
  toast.show({ title: 'Removed from cart', description: line.name, action: { label: 'Undo', onClick: () => { const next = [...cart.value]; next.splice(at, 0, line); cart.value = next } } })
}

/** One line: thumb, name, variant, stepper, price (09 §6.1). The stepper's minus at 1 removes, asks nothing, gives Undo. */
export function LineItem({ line, cart, currency, locale, problem }: { line: CartLine; cart: State<CartLine[]>; currency?: string; locale?: string; problem?: any }) {
  const down = () => (line.quantity <= 1 ? removeLine(cart, line) : setQuantity(cart, line.id, line.quantity - 1))
  return (
    <div data-scope="line-item" data-id={line.id}>
      <span data-part="thumb">{line.art && <img src={line.art} alt="" />}</span>
      <span>
        <b id={`li-${line.id}`}>{line.name}</b>
        <small>{line.variant ? `${line.variant} · ` : ''}{money(line.price, currency, locale)}</small>
        {problem && <><br /><Badge tone="critical">{problem}</Badge></>}
      </span>
      <span data-part="price">
        {money(line.price * line.quantity, currency, locale)}
        <span data-scope="qty">
          <button type="button" aria-label={line.quantity <= 1 ? `Remove ${line.name}` : `Fewer ${line.name}`} onClick={down}><MinusIcon /></button>
          <output aria-live="polite" aria-label={`Quantity of ${line.name}`}>{line.quantity}</output>
          <button type="button" aria-label={`More ${line.name}`} onClick={() => setQuantity(cart, line.id, line.quantity + 1)}><PlusIcon /></button>
        </span>
      </span>
    </div>
  )
}

/** The cart button: a count badge, and the count said in words. */
export function CartButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button emphasis="ghost" tone="neutral" data-icon-only="" label={`Cart, ${count} items`} style="position:relative" onClick={onClick}>
      <BagIcon />
      {/* keyed by the count, so a new number is a new node and the bump replays once */}
      {[count].filter(n => n > 0).map(n => <Badge key={n} count emphasis="solid" aria-hidden="true" data-bump="" style="position:absolute;inset:-2px -4px auto auto">{n}</Badge>)}
    </Button>
  )
}

export interface CartDrawerProps {
  open: State<boolean>
  cart: State<CartLine[]>
  currency?: string
  locale?: string
  onCheckout: () => void
}

/** The cart drawer (09 §6.1): a Sheet, right on wide screens and from the bottom on a phone, with the subtotal and Checkout. */
export function CartDrawer({ open, cart, currency, locale, onCheckout }: CartDrawerProps) {
  const lines = derived(() => cart.value)
  const n = derived(() => cartCount(lines.value))
  const subtotal = derived(() => cartTotals(lines.value).subtotal)
  const go = () => { open.value = false; afterFlush(onCheckout) }
  return (
    <Drawer
      open={open}
      title={`Cart · ${n.value} ${n.value === 1 ? 'item' : 'items'}`}
      footer={
        <div data-scope="stack">
          <dl data-scope="lines"><div data-part="total"><dt>Subtotal</dt><dd>{money(subtotal.value, currency, locale)}</dd></div></dl>
          <span class="muted">Shipping and tax at checkout.</span>
          <Button size="lg" full disabled={!n.value} autofocus onClick={go}>Checkout</Button>
        </div>
      }
    >
      {lines.value.length
        ? lines.value.map(l => <LineItem key={l.id} line={l} cart={cart} currency={currency} locale={locale} />)
        : <span class="muted">Your cart is empty.</span>}
    </Drawer>
  )
}
