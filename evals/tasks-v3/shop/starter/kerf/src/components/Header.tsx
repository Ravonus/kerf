type Props = { tab: 'products' | 'cart'; count: number; onTab: (tab: 'products' | 'cart') => void }

export function Header({ tab, count, onTab }: Props) {
  return (
    <header>
      <nav>
        <button aria-pressed={tab === 'products'} onClick={() => onTab('products')}>
          Products
        </button>
        <button aria-pressed={tab === 'cart'} onClick={() => onTab('cart')}>
          Cart ({count})
        </button>
      </nav>
    </header>
  )
}
