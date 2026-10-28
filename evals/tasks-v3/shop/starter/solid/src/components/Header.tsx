type Props = { tab: 'products' | 'cart'; count: number; onTab: (tab: 'products' | 'cart') => void }

export function Header(props: Props) {
  return (
    <header>
      <nav>
        <button aria-pressed={props.tab === 'products'} onClick={() => props.onTab('products')}>Products</button>
        <button aria-pressed={props.tab === 'cart'} onClick={() => props.onTab('cart')}>Cart ({props.count})</button>
      </nav>
    </header>
  )
}
