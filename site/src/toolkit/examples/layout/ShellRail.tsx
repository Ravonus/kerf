import { state } from '@weft-js/core'
import { Heading, Shell, Text } from '@weft-js/warp'
import { AppWindow, MARK, ACCOUNT, weftNav, pageOf } from './shared'

export function ShellRail() {
  const page = state('deploys')
  const folded = state<boolean | 'hidden'>(true)
  const nav = weftNav((id) => (page.value = id))
  return (
    <AppWindow height={420}>
      <Shell
        island
        label="weft"
        brand={{ name: 'weft', mark: <MARK /> }}
        crumbs={[{ label: pageOf[page.value]! }]}
        nav={nav}
        current={page.value}
        collapsed={folded}
        account={ACCOUNT}
      >
        <Heading level={1} role="heading">
          {pageOf[page.value]!}
        </Heading>
        <Text subtle>
          The rail keeps icons and short labels. Its toggle opens the full sidebar.
        </Text>
      </Shell>
    </AppWindow>
  )
}
