import { For, createSignal } from 'solid-js'

type Item = { id: string; name: string; price: number }

export function Cart(props: { items: Item[] }) {
  // Quantities and removals are keyed by item id so they survive re-fetches,
  // reordering, and prices changing.
  const [quantities, setQuantities] = createSignal<Record<string, number>>({})
  const [removed, setRemoved] = createSignal<Record<string, true>>({})

  const qty = (id: string) => quantities()[id] ?? 1
  const visibleItems = () => props.items.filter(item => !removed()[item.id])
  const lineTotal = (item: Item) => item.price * qty(item.id)
  const total = () => visibleItems().reduce((sum, item) => sum + lineTotal(item), 0)

  const increase = (id: string) => setQuantities(q => ({ ...q, [id]: qty(id) + 1 }))

  const decrease = (id: string) => {
    const current = qty(id)
    if (current <= 1) {
      setRemoved(r => ({ ...r, [id]: true }))
      setQuantities(q => {
        const next = { ...q }
        delete next[id]
        return next
      })
    } else {
      setQuantities(q => ({ ...q, [id]: current - 1 }))
    }
  }

  return (
    <div>
      <ul aria-label="Cart">
        <For each={visibleItems()}>
          {item => (
            <li>
              <span data-testid="name">{item.name}</span>{' '}
              <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => decrease(item.id)}>
                -
              </button>
              <span data-testid="qty">{qty(item.id)}</span>
              <button type="button" aria-label={`Increase ${item.name}`} onClick={() => increase(item.id)}>
                +
              </button>{' '}
              <span data-testid="line">${lineTotal(item).toFixed(2)}</span>
            </li>
          )}
        </For>
      </ul>
      <p data-testid="total">Total: ${total().toFixed(2)}</p>
    </div>
  )
}
