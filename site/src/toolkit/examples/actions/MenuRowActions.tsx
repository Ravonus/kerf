import { Menu, Row, Stack, Text } from '@weft-js/warp'

export const MenuRowActions = () => (
  <Row
    justify="between"
    gap="group"
  >
    <Stack gap="hair">
      <Text role="heading">checkout</Text>
      <Text subtle>Live in eu-west</Text>
    </Stack>
    <Menu
      label="Manage"
      align="end"
      trigger={{
        emphasis: 'ghost',
        tone: 'neutral',
        size: 'sm',
      }}
      items={[
        { label: 'Open logs', icon: 'external' },
        { label: 'Redeploy', icon: 'rocket' },
        { separator: true },
        { label: 'Pause', tone: 'critical' },
      ]}
    />
  </Row>
)
