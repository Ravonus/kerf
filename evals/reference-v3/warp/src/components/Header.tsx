import { Toggle } from '@weft-js/warp'

type Tab = 'products' | 'cart'
type Props = { tab: Tab; count: number; onTab: (tab: Tab) => void }

export function Header({ tab, count, onTab }: Props) {
  return (
    <header class="bar">
      <h1>Shop</h1>
      <nav aria-label="Sections" class="tabs">
        <Toggle pressed={tab === 'products'} onClick={() => onTab('products')}>Products</Toggle>
        <Toggle pressed={tab === 'cart'} onClick={() => onTab('cart')}>Cart ({count})</Toggle>
      </nav>
    </header>
  )
}
