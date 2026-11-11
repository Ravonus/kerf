import { state } from '@kerf/core'
import {
  Badge,
  Heading,
  Row,
  Shell,
  Stack,
  Text,
} from '@kerf/veneer'
import { PROJECTS, TONE_OF } from '../../world'
import {
  AppWindow,
  MARK,
  ACCOUNT,
  kerfNav,
  pageOf,
} from './shared'

export function ShellPhone() {
  const page = state('projects')
  const nav = kerfNav((id) => (page.value = id))
  return (
    <AppWindow
      height={560}
      wide={375}
    >
      <Shell
        island
        label="kerf"
        brand={{ name: 'kerf', mark: <MARK /> }}
        title={pageOf[page.value]!}
        nav={nav}
        current={page.value}
        account={ACCOUNT}
      >
        <Heading
          level={1}
          role="heading"
        >
          {pageOf[page.value]!}
        </Heading>
        <Stack
          divided
          gap="related"
        >
          {PROJECTS.slice(0, 5).map((p) => (
            <Row
              key={p.id}
              justify="between"
              gap="tight"
            >
              <Text>{p.name}</Text>
              <Badge
                tone={TONE_OF[p.status]}
                dot
              >
                {p.status}
              </Badge>
            </Row>
          ))}
        </Stack>
      </Shell>
    </AppWindow>
  )
}
