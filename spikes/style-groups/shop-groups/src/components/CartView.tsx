import { derived } from '@weft-js/core'
import type { Product } from '../api'
import type { Cart } from '../App'
import { group } from '@weft-js/core/style'
import { money } from '../format'
import { action } from '../ui'

/** The cart: its lines and the total. */
export const cartView = group('cart', {
  base: { layout: 'stack', gap: 'group' },
  parts: {
    list: { list: 'plain', layout: 'stack' },
    total: { text: 'title', figures: 'tabular' },
    empty: { text: 'body', ink: 'subtle' },
  },
})

/** One line of the cart; `trend` says whether the price moved since it was added. */
export const cartLine = group('cart-line', {
  base: { layout: 'row', gap: 'related', padBlock: 'related', divide: 'hairline' },
  axes: { trend: { same: {}, up: {}, down: {} } },
  parts: {
    name: { text: 'body', grow: 'fill' },
    qty: { text: 'label', figures: 'tabular', css: { minInlineSize: '2ch', textAlign: 'center' } },
    line: { text: 'label', figures: 'tabular' },
    change: { text: 'caption', padInline: 'related', radius: 'round', emphasis: 'soft' },
  },
  compounds: [
    { when: { trend: 'up' }, part: 'change', set: { tone: 'critical' } },
    { when: { trend: 'down' }, part: 'change', set: { tone: 'positive' } },
  ],
  defaults: { trend: 'same' },
})

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView({ products, cart, onChange }: Props) {
  const lines = derived(() => products.filter((p) => cart[p.id]))
  const total = derived(() => lines.value.reduce((sum, p) => sum + p.price * cart[p.id].qty, 0))
  return (
    <>
      {lines.value.length > 0 ? (
        <div {...cartView()}>
          <ul {...cartView.list} aria-label="Cart">
            {lines.value.map((p) => (
              <li
                key={p.id}
                {...cartLine({
                  trend:
                    p.price === cart[p.id].addedPrice
                      ? 'same'
                      : p.price > cart[p.id].addedPrice
                        ? 'up'
                        : 'down',
                })}
              >
                <span {...cartLine.name} data-testid="name">
                  {p.name}
                </span>
                <button
                  {...action({ emphasis: 'ghost' })}
                  aria-label={`Decrease ${p.name}`}
                  onClick={() => onChange(p.id, -1)}
                >
                  -
                </button>
                <span {...cartLine.qty} data-testid="qty">
                  {cart[p.id].qty}
                </span>
                <button
                  {...action({ emphasis: 'ghost' })}
                  aria-label={`Increase ${p.name}`}
                  disabled={cart[p.id].qty >= p.stock}
                  onClick={() => onChange(p.id, 1)}
                >
                  +
                </button>
                <span {...cartLine.line} data-testid="line">
                  {money(p.price * cart[p.id].qty)}
                </span>
                {p.price !== cart[p.id].addedPrice && (
                  <span {...cartLine.change} data-testid="price-change">
                    {p.price > cart[p.id].addedPrice ? 'Price up' : 'Price down'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p {...cartView.total} data-testid="total">
            Total: {money(total.value)}
          </p>
        </div>
      ) : (
        <p {...cartView.empty}>Your cart is empty.</p>
      )}
    </>
  )
}
