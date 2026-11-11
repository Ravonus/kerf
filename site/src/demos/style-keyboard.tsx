import { state } from '@kerf/core'
import {
  Button,
  Card,
  Menu,
  Modal,
  Row,
  Stack,
  Tabs,
  Text,
} from '@kerf/veneer'

type Tab = 'details' | 'shipping' | 'returns'

const TABS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'shipping' as const, label: 'Shipping' },
  { value: 'returns' as const, label: 'Returns' },
]

const COPY: Record<Tab, string> = {
  details:
    'A washed coffee with notes of lemon and black tea.',
  shipping: 'Roasted on Monday, shipped on Tuesday.',
  returns:
    'Unopened bags can be returned within 30 days.',
}

export default function Keyboard() {
  const tab = state<Tab>('details')
  const confirm = state(false)
  return (
    <Card title="Yirgacheffe">
      <Stack gap="related">
        <Tabs
          label="Product"
          value={tab.value}
          options={TABS}
          onChange={(next) => (tab.value = next)}
        >
          {(value) => <Text>{COPY[value]}</Text>}
        </Tabs>
        <Row gap="tight">
          <Menu
            label="Share"
            trigger={{
              emphasis: 'outline',
              tone: 'neutral',
            }}
            items={[
              { label: 'Copy link' },
              { label: 'Email' },
            ]}
          />
          <Button
            emphasis="soft"
            onClick={() => (confirm.value = true)}
          >
            Subscribe
          </Button>
        </Row>
      </Stack>
      <Modal
        open={confirm}
        size="sm"
        title="Subscribe monthly?"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Focus moved into this dialog. Escape closes it
          and puts focus back on Subscribe.
        </Text>
      </Modal>
    </Card>
  )
}
