import { money, products } from './shop-state'
import type { shopState } from './shop-state'

type Model = ReturnType<typeof shopState>
export function cartView(m: Model) {
  const fields = [
    { id: 'name', label: 'Name', value: m.name },
    { id: 'email', label: 'Email', value: m.email },
    { id: 'card', label: 'Card number', value: m.card },
  ]
  return (
    <section>
      {m.thanks.value && <p>Thanks, {m.thanks.value}!</p>}
      {m.count.value === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <ul aria-label="Cart">
          {products
            .filter((p) => (m.cart.value[p.name] ?? 0) > 0)
            .map((p) => (
              <li key={p.name}>
                <span>{p.name}</span> <span>{m.cart.value[p.name]}</span>{' '}
                <span>{money(p.price * (m.cart.value[p.name] ?? 0))}</span>
                <button
                  disabled={(m.cart.value[p.name] ?? 0) >= p.stock}
                  onClick={() => m.change(p, 1)}
                >
                  Increase {p.name}
                </button>
                <button onClick={() => m.change(p, -1)}>Decrease {p.name}</button>
              </li>
            ))}
        </ul>
      )}
      <p>Total: {money(m.total.value)}</p>
      <form noValidate onSubmit={m.order}>
        {fields.map((f, i) => (
          <div key={f.id}>
            <label for={f.id}>{f.label}</label>
            <input
              id={f.id}
              value={f.value.value}
              aria-invalid={!!m.errors.value[i]}
              aria-describedby={m.errors.value[i] ? `${f.id}-error` : undefined}
              onInput={(e) => {
                f.value.value = e.currentTarget.value
              }}
            />
            {m.errors.value[i] && <p id={`${f.id}-error`}>{m.errors.value[i]}</p>}
          </div>
        ))}
        <button>Place order</button>
      </form>
    </section>
  )
}
