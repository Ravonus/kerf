import { money } from '../lib/format'

export function Header(props: { count: number; portfolio: number }) {
  return (
    <header>
      <h1>Watchlist</h1>
      <p data-testid="count">{props.count === 1 ? '1 stock' : `${props.count} stocks`}</p>
      <p data-testid="portfolio">Portfolio: {money(props.portfolio)}</p>
    </header>
  )
}
