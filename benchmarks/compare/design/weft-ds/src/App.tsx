import { state, derived, onMount, onCleanup } from '@weft-js/core'
import { Center, Heading, Row, Spacer, Stack, Text } from '@weft-js/warp'
import { Settings } from './Settings'
import { Customers } from './Customers'
import { Pricing } from './Pricing'

const pages = [
  { id: 'settings', label: 'Settings' },
  { id: 'customers', label: 'Customers' },
  { id: 'pricing', label: 'Pricing' },
]

const read = () => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return pages.some((p) => p.id === id) ? id : 'settings'
}

export function App() {
  const page = state(read())
  onMount(() => {
    const sync = () => (page.value = read())
    window.addEventListener('hashchange', sync)
    onCleanup(() => window.removeEventListener('hashchange', sync))
  })
  return (
    <Stack gap="section">
      <header>
        <Center max="wide" gutter>
          <Row gap="group" align="baseline" wrap>
            <Heading level={2} role="heading">
              Northwind
            </Heading>
            <Spacer />
            <nav aria-label="Main">
              <Row gap="group" wrap>
                {pages.map((p) => (
                  <a
                    key={p.id}
                    href={`#/${p.id}`}
                    aria-current={page.value === p.id ? 'page' : undefined}
                  >
                    <Text role="label" inline>
                      {p.label}
                    </Text>
                  </a>
                ))}
              </Row>
            </nav>
          </Row>
        </Center>
      </header>
      <main>
        <Center max="wide" gutter>
          {page.value === 'settings' && <Settings />}
          {page.value === 'customers' && <Customers />}
          {page.value === 'pricing' && <Pricing />}
        </Center>
      </main>
    </Stack>
  )
}
