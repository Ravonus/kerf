import { state } from '@kerf-js/core'
import { Nav } from '@kerf-js/veneer'
import { PAGES } from './shared'

export function NavDown() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => {
    e.preventDefault()
    at.value = name
  }
  return (
    <Nav
      label="Project"
      axis="y"
    >
      {PAGES.map((name) => (
        <a
          key={name}
          href={`#${name}`}
          aria-current={
            at.value === name ? 'page' : undefined
          }
          onClick={(e) => go(e, name)}
        >
          {name}
        </a>
      ))}
    </Nav>
  )
}
