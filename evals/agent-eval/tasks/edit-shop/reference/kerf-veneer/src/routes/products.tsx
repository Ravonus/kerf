import { money } from './shop-state'
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
      {favouritesControl(m)}
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
        {m.shown.value.map((p) => {
          return (
            <li key={p.name} data-flash={m.flash.value[p.name] ? 'true' : undefined}>
              <span>{p.name}</span> <span>{money(m.priceOf(p))}</span>
              {p.stock - (m.cart.value[p.name] ?? 0) === 0 ? (
                <span>Out of stock</span>
              ) : (
                p.stock - (m.cart.value[p.name] ?? 0) <= 3 && (
                  <span>Only {p.stock - (m.cart.value[p.name] ?? 0)} left</span>
                )
              )}
              <button
                aria-pressed={m.favourites.value.includes(p.name)}
                onClick={() => m.toggleFavourite(p.name)}
              >
                Favourite {p.name}
              </button>
              <button
                disabled={p.stock - (m.cart.value[p.name] ?? 0) === 0}
                onClick={() => m.change(p, 1)}
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

function favouritesControl(m: Model) {
  return (
    <label>
      <input
        type="checkbox"
        checked={m.favouritesOnly.value}
        onChange={(e) => {
          m.favouritesOnly.value = e.currentTarget.checked
        }}
      />
      Favourites only
    </label>
  )
}
