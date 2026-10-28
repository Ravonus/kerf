import { For, createSignal } from 'solid-js'

type Item = { id: string; name: string; price: number }

export function Cart(props: { items: Item[] }) {
  const [qtys, setQtys] = createSignal<Record<string, number>>({})
  const qty = (id: string) => qtys()[id] ?? 1
  const change = (id: string, delta: number) =>
    setQtys(prev => ({ ...prev, [id]: (prev[id] ?? 1) + delta }))
  const visible = () => props.items.filter(item => qty(item.id) > 0)
  const total = () => visible().reduce((sum, item) => sum + item.price * qty(item.id), 0)
  return (
    <div>
      <ul aria-label="Cart">
        <For each={visible()}>
          {item => (
            <li>
              <span data-testid="name">{item.name}</span>{' '}
              <button aria-label={`Decrease ${item.name}`} onClick={() => change(item.id, -1)}>-</button>
              <span data-testid="qty">{qty(item.id)}</span>
              <button aria-label={`Increase ${item.name}`} onClick={() => change(item.id, 1)}>+</button>{' '}
              <span data-testid="line">${(item.price * qty(item.id)).toFixed(2)}</span>
            </li>
          )}
        </For>
      </ul>
      <p data-testid="total">Total: ${total().toFixed(2)}</p>
    </div>
  )
}
