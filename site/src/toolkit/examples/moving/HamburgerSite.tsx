import { state } from '@kerf/core'
import { HamburgerMenu } from '@kerf/veneer'
import { follow } from './shared'

const LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#docs', label: 'Docs' },
  { href: '#blog', label: 'Blog' },
]

export function HamburgerSite() {
  const at = state('#home')
  return (
    <header
      onClick={follow(at)}
      style="display:flex;justify-content:space-between"
    >
      <strong>Acme</strong>
      <HamburgerMenu
        label="Site"
        links={LINKS}
        current={at.value}
        brand={<strong>Acme</strong>}
      />
    </header>
  )
}
