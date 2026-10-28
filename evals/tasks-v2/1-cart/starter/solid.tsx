import { For } from 'solid-js'

type Item = { id: string; name: string; price: number }

export function Cart(props: { items: Item[] }) {
  const total = () => props.items.reduce((sum, item) => sum + item.price, 0)
  return (
    <div>
      <ul aria-label="Cart">
        <For each={props.items}>
          {item => (
            <li>
              <span data-testid="name">{item.name}</span> <span data-testid="line">${item.price.toFixed(2)}</span>
            </li>
          )}
        </For>
      </ul>
      <p data-testid="total">Total: ${total().toFixed(2)}</p>
    </div>
  )
}
