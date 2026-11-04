type Props = { tab: 'products' | 'cart'; count: number; onTab: (tab: 'products' | 'cart') => void }

export function Header({ tab, count, onTab }: Props) {
  return (
    <header class="top-bar">
      <nav class="top-bar__tabs">
        <button class="tab" aria-pressed={tab === 'products'} onClick={() => onTab('products')}>
          Products
        </button>
        <button class="tab" aria-pressed={tab === 'cart'} onClick={() => onTab('cart')}>
          Cart ({count})
        </button>
      </nav>
    </header>
  )
}
