import { Match, Switch } from 'solid-js'
import type { Product } from '../api'
import { money } from '../format'

export function ProductRow(props: { product: Product; left: number; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{props.product.name}</span>
      <span data-testid="price">{money(props.product.price)}</span>
      <Switch>
        <Match when={props.left <= 0}><span>Out of stock</span></Match>
        <Match when={props.left <= 3}><span>Only {props.left} left</span></Match>
      </Switch>
      <button aria-label={`Add ${props.product.name}`} disabled={props.left <= 0} onClick={() => props.onAdd(props.product.id)}>Add</button>
    </li>
  )
}
