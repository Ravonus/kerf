import { memo } from 'react'
import { money } from '../lib/format'

export const Header = memo(function Header({ count, portfolio }: { count: number; portfolio: number }) {
  return (
    <header>
      <h1>Watchlist</h1>
      <p data-testid="count">{count === 1 ? '1 stock' : `${count} stocks`}</p>
      <p data-testid="portfolio">Portfolio: {money(portfolio)}</p>
    </header>
  )
})
