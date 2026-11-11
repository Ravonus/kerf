import { state } from '@kerf-js/core'
import { Heading, Shell, Text } from '@kerf-js/veneer'
import {
  AppWindow,
  MARK,
  ACCOUNT,
  kerfNav,
  pageOf,
} from './shared'

export function ShellRail() {
  const page = state('deploys')
  const folded = state<boolean | 'hidden'>(true)
  const nav = kerfNav((id) => (page.value = id))
  return (
    <AppWindow height={420}>
      <Shell
        island
        label="kerf"
        brand={{ name: 'kerf', mark: <MARK /> }}
        crumbs={[{ label: pageOf[page.value]! }]}
        nav={nav}
        current={page.value}
        collapsed={folded}
        account={ACCOUNT}
      >
        <Heading
          level={1}
          role="heading"
        >
          {pageOf[page.value]!}
        </Heading>
        <Text subtle>
          The rail keeps icons and short labels. Its
          toggle opens the full sidebar.
        </Text>
      </Shell>
    </AppWindow>
  )
}
