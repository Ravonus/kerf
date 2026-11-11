import { state } from '@kerf-js/core'
import { Button, Heading, Nav, Row } from '@kerf-js/veneer'
import { PAGES } from './shared'

export function NavProductHeader() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => {
    e.preventDefault()
    at.value = name
  }
  return (
    <Row
      justify="between"
      gap="section"
    >
      <Row gap="section">
        <Heading level={3}>kerf</Heading>
        <Nav label="Main">
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
      </Row>
      <Button
        size="sm"
        icon="rocket"
      >
        Deploy
      </Button>
    </Row>
  )
}
