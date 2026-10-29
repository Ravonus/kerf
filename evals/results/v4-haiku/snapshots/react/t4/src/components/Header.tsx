import { useMemo } from 'react'
import { money } from '../lib/format'
import { usePortfolio, type QuoteStore } from '../quotes'

export function Header({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = usePortfolio(store)
  // Only a change in the portfolio value formats it again (not a search changing the count).
  const text = useMemo(() => money(portfolio), [portfolio])
  return (
    <header>
      <h1>Watchlist</h1>
      <p data-testid="count">{count === 1 ? '1 stock' : `${count} stocks`}</p>
      <p data-testid="portfolio">Portfolio: {text}</p>
    </header>
  )
}
