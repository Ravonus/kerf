import { state } from '@weft-js/core'
import { Nav } from '@weft-js/warp'
import { PAGES } from './shared'

export function NavAcross() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => {
    e.preventDefault()
    at.value = name
  }
  return (
    <Nav label="Project">
      {PAGES.map((name) => (
        <a
          key={name}
          href={`#${name}`}
          aria-current={at.value === name ? 'page' : undefined}
          onClick={(e) => go(e, name)}
        >
          {name}
        </a>
      ))}
    </Nav>
  )
}
