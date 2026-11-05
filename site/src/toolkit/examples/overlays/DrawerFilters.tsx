import { derived, state } from '@weft-js/core'
import { Button, Checkbox, Drawer, Row, Stack, Switch, Text } from '@weft-js/warp'
import { FILTER_REGIONS } from './shared'

export function DrawerFilters() {
  const open = state(false)
  const failed = state(false)
  const regions = state(['eu-west'])
  const flip = (r: string) =>
    (regions.value = regions.value.includes(r)
      ? regions.value.filter((x) => x !== r)
      : [...regions.value, r])
  const count = derived(() => regions.value.length + (failed.value ? 1 : 0))
  const clear = () => {
    regions.value = []
    failed.value = false
  }
  return (
    <>
      <Button emphasis="outline" tone="neutral" icon="filter" onClick={() => (open.value = true)}>
        Filters ({count.value})
      </Button>
      <Drawer
        open={open}
        title="Filter deploys"
        footer={
          <Row gap="related" justify="between">
            <Button emphasis="ghost" tone="neutral" onClick={clear}>
              Clear
            </Button>
            <Button data-close="">Show results</Button>
          </Row>
        }
      >
        <Stack gap="section">
          <Stack gap="related">
            <Text role="label">Region</Text>
            {FILTER_REGIONS.map((r) => (
              <Checkbox key={r} checked={regions.value.includes(r)} onChange={() => flip(r)}>
                {r}
              </Checkbox>
            ))}
          </Stack>
          <Switch checked={failed.value} onChange={() => (failed.value = !failed.value)}>
            Failed deploys only
          </Switch>
        </Stack>
      </Drawer>
    </>
  )
}
