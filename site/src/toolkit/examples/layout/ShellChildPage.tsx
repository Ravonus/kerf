import { state } from '@kerf-js/core'
import { Heading, Shell, Text } from '@kerf-js/veneer'
import { AppWindow, ROOT_NAV } from './shared'

export function ShellChildPage() {
  const left = state(false)
  return (
    <AppWindow
      height={420}
      wide={375}
    >
      <Shell
        island
        label="kerf"
        depth="child"
        title="storefront"
        back={{
          label: 'Back to projects',
          onClick: () => (left.value = !left.value),
        }}
        brand={{ name: 'kerf' }}
        nav={ROOT_NAV}
        current="projects"
      >
        <Heading
          level={1}
          role="heading"
        >
          storefront
        </Heading>
        <Text subtle>
          {left.value
            ? 'Back pressed. A real app would route ' +
              'to the list here.'
            : 'On a phone, a child page swaps the ' +
              'brand for a back button.'}
        </Text>
      </Shell>
    </AppWindow>
  )
}
