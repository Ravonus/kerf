import { state } from '@weft-js/core'
import { Badge, Button, Drawer, Row, Stack, Text } from '@weft-js/warp'
import { DEPLOYS, TONE_OF, type Status } from '../../world'

export function DrawerDeployDetails() {
  const open = state(false)
  const picked = state(DEPLOYS[0]!)
  const show = (d: (typeof DEPLOYS)[number]) => {
    picked.value = d
    open.value = true
  }
  return (
    <Stack gap="related" divided>
      {DEPLOYS.slice(0, 4).map((d) => (
        <Row key={d.id} justify="between" gap="group">
          <Stack gap="hair">
            <Text>{d.project}</Text>
            <Text role="caption" subtle>
              {d.message}
            </Text>
          </Stack>
          <Button size="sm" emphasis="ghost" tone="neutral" onClick={() => show(d)}>
            Details
          </Button>
        </Row>
      ))}
      <Drawer
        open={open}
        title={picked.value.message}
        description={`${picked.value.project}, ${picked.value.id}`}
      >
        <Stack gap="related">
          <Row justify="between">
            <Text subtle>Status</Text>
            <Badge tone={TONE_OF[picked.value.status as Status]} dot>
              {picked.value.status}
            </Badge>
          </Row>
          <Row justify="between">
            <Text subtle>Author</Text>
            <Text>{picked.value.author}</Text>
          </Row>
          <Row justify="between">
            <Text subtle>Branch</Text>
            <Text>{picked.value.branch}</Text>
          </Row>
          <Row justify="between">
            <Text subtle>Commit</Text>
            <Text role="code">{picked.value.commit}</Text>
          </Row>
          <Row justify="between">
            <Text subtle>Took</Text>
            <Text>{picked.value.minutes} min</Text>
          </Row>
        </Stack>
      </Drawer>
    </Stack>
  )
}
