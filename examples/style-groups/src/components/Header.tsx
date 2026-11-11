import { group } from '@kerf-js/core/style'

/** The bar across the top: the tabs. */
export const topBar = group('top-bar', {
  base: { layout: 'row', justify: 'between', padBlock: 'related', divide: 'hairline' },
  parts: { tabs: { layout: 'row', gap: 'tight' } },
})

/** One tab button; `pressed` is the current tab. */
export const tabButton = group('tab', {
  base: {
    control: 'sm',
    padInline: 'control',
    radius: 'control',
    text: 'button',
    border: 'none',
    emphasis: 'ghost',
    cursor: 'pointer',
  },
  states: { pressed: { surface: 'sunken', ink: 'text' }, hover: { surface: 'sunken' } },
})

type Props = { tab: 'products' | 'cart'; count: number; onTab: (tab: 'products' | 'cart') => void }

export function Header({ tab, count, onTab }: Props) {
  return (
    <header {...topBar()}>
      <nav {...topBar.tabs}>
        <button {...tabButton({ pressed: tab === 'products' })} onClick={() => onTab('products')}>
          Products
        </button>
        <button {...tabButton({ pressed: tab === 'cart' })} onClick={() => onTab('cart')}>
          Cart ({count})
        </button>
      </nav>
    </header>
  )
}
