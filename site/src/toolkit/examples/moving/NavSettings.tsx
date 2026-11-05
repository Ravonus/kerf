import { state } from '@weft-js/core'
import { Heading, Nav, Split, Stack, Text } from '@weft-js/warp'

export function NavSettings() {
  const at = state('General')
  const go = (e: Event, name: string) => {
    e.preventDefault()
    at.value = name
  }
  return (
    <Split side="start" width="rail" gap="section">
      <Nav label="Settings" axis="y">
        {['General', 'Domains', 'Billing', 'Team'].map((name) => (
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
      <Stack gap="related">
        <Heading level={3}>{at.value}</Heading>
        <Text subtle>Everything about {at.value.toLowerCase()} for this project lives here.</Text>
      </Stack>
    </Split>
  )
}
