import { state } from '@weft-js/core'
import {
  Badge,
  Button,
  Card,
  Grid,
  Heading,
  Row,
  Shell,
  Stack,
  Text,
} from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'
import {
  AppWindow,
  MARK,
  ACCOUNT,
  weftNav,
  pageOf,
} from './shared'

export function ShellApp() {
  const page = state('projects')
  const nav = weftNav((id) => (page.value = id))
  return (
    <AppWindow height={600}>
      <Shell
        island
        label="weft"
        brand={{ name: 'weft', mark: <MARK /> }}
        title={pageOf[page.value]!}
        crumbs={[
          { label: 'Acme', href: '#' },
          { label: pageOf[page.value]! },
        ]}
        nav={nav}
        foot={[
          {
            id: 'settings',
            label: 'Settings',
            icon: 'settings',
            onSelect: () => (page.value = 'settings'),
          },
        ]}
        current={page.value}
        actions={
          <Button
            size="sm"
            icon="rocket"
          >
            Deploy
          </Button>
        }
        account={ACCOUNT}
      >
        <Heading
          level={1}
          role="heading"
        >
          {pageOf[page.value]!}
        </Heading>
        <Grid
          min="sm"
          gap="related"
        >
          {PROJECTS.slice(0, 6).map((p) => (
            <Card key={p.id}>
              <Stack gap="hair">
                <Row
                  justify="between"
                  gap="tight"
                >
                  <Text role="label">{p.name}</Text>
                  <Badge
                    tone={TONE_OF[p.status]}
                    dot
                  >
                    {p.status}
                  </Badge>
                </Row>
                <Text
                  role="caption"
                  subtle
                >
                  {p.region} · {p.latency} ms
                </Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Shell>
    </AppWindow>
  )
}
