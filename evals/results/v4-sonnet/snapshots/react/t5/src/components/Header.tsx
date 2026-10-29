import { memo, useSyncExternalStore } from 'react'
import { money } from '../lib/format'
import type { QuoteStore } from '../store'

export const Header = memo(function Header({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  return (
    <header>
      <h1>Watchlist</h1>
      <p data-testid="count">{count === 1 ? '1 stock' : `${count} stocks`}</p>
      <p data-testid="portfolio">Portfolio: {money(portfolio)}</p>
    </header>
  )
})
