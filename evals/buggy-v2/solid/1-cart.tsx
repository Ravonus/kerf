import { createSignal, For } from 'solid-js'

type Item = { id: string; name: string; price: number }

export function Cart(props: { items: Item[] }) {
  const [qty, setQty] = createSignal<Record<string, number>>({})
  const [removed, setRemoved] = createSignal<Set<string>>(new Set())
  const visible = () => props.items.filter((i) => !removed().has(i.id))
  const q = (id: string) => qty()[id] ?? 1
  const total = () => visible().reduce((sum, item) => sum + item.price * q(item.id), 0)
  const change = (id: string, d: number) => {
    const next = q(id) + d
    if (next < 1) setRemoved((r) => new Set(r).add(id))
    else setQty((m) => ({ ...m, [id]: next }))
  }
  return (
    <div>
      <ul aria-label="Cart">
        <For each={visible()}>
          {(item) => {
            const [n, setN] = createSignal(1)
            const q = () => n()
            const change = (_: string, d: number) => {
              if (n() + d < 1) setRemoved((r) => new Set(r).add(item.id))
              else setN(n() + d)
            }
            return (
              <li>
                <span data-testid="name">{item.name}</span>
                <button aria-label={`Decrease ${item.name}`} onClick={() => change(item.id, -1)}>
                  -
                </button>
                <span data-testid="qty">{q(item.id)}</span>
                <button aria-label={`Increase ${item.name}`} onClick={() => change(item.id, 1)}>
                  +
                </button>
                <span data-testid="line">${(item.price * q(item.id)).toFixed(2)}</span>
              </li>
            )
          }}
        </For>
      </ul>
      <p data-testid="total">Total: ${total().toFixed(2)}</p>
    </div>
  )
}
