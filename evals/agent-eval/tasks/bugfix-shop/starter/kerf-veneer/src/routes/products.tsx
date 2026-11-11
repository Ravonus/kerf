import { money, products } from './shop-state'
import type { shopState } from './shop-state'

type Model = ReturnType<typeof shopState>
export function productView(m: Model) {
  return (
    <section>
      <label>
        Search
        <input
          value={m.search.value}
          onInput={(e) => {
            m.search.value = e.currentTarget.value
          }}
        />
      </label>
      <label>
        Category
        <select
          value={m.category.value}
          onChange={(e) => {
            m.category.value = e.currentTarget.value
          }}
        >
          {['All', 'fruit', 'bakery', 'dairy'].map((x) => (
            <option>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select
          value={m.sort.value}
          onChange={(e) => {
            m.sort.value = e.currentTarget.value
          }}
        >
          {['Name', 'Price: low to high', 'Price: high to low'].map((x) => (
            <option>{x}</option>
          ))}
        </select>
      </label>
      <p>
        {m.shown.value.length} {m.shown.value.length === 1 ? 'product' : 'products'}
      </p>
      <ul aria-label="Products">
        {m.shown.value.map((p, index) => {
          return (
            <li key={p.name}>
              <span>{p.name}</span> <span>{money(p.price)}</span>
              {p.stock - (m.cart.value[p.name] ?? 0) === 0 ? (
                <span>Out of stock</span>
              ) : (
                p.stock - (m.cart.value[p.name] ?? 0) <= 3 && (
                  <span>Only {p.stock - (m.cart.value[p.name] ?? 0)} left</span>
                )
              )}
              <button
                disabled={p.stock - (m.cart.value[p.name] ?? 0) === 0}
                onClick={() => m.change(products[index] ?? p, 1)}
              >
                Add {p.name}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
