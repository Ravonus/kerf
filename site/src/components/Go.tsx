import { Link } from '@weft/start'

const TILES = [
  { href: '/docs/getting-started', big: 'Start', small: 'one command' },
  { href: '/toolkit', big: '227', small: 'components' },
  { href: '/icons', big: '651', small: 'icons' },
]

export function Go() {
  return (
    <section data-site="go">
      {TILES.map(t => <Link key={t.href} href={t.href}><b>{t.big}</b><span>{t.small}</span></Link>)}
    </section>
  )
}
