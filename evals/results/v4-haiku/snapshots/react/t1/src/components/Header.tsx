import { money } from '../lib/format'
import { usePortfolio, type QuoteStore } from '../quotes'

export function Header({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = usePortfolio(store)
  return (
    <header>
      <h1>Watchlist</h1>
      <p data-testid="count">{count === 1 ? '1 stock' : `${count} stocks`}</p>
      <p data-testid="portfolio">Portfolio: {money(portfolio)}</p>
    </header>
  )
}
