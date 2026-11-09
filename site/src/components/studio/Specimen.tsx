// What the studio's theme lands on: real Warp components, a little of everything the tokens reach.
import { state } from '@weft-js/core'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Input,
  Link,
  Modal,
  Progress,
  Radio,
  Segmented,
  Select,
  Slider,
  Switch,
  Tabs,
  Tag,
} from '@weft-js/warp'

const EMPHASES = ['solid', 'soft', 'outline', 'ghost', 'link'] as const

function Actions(props: { tones: string[] }) {
  const open = state(false)
  return (
    <Card eyebrow="Actions" title="Buttons and tones" sweep={false}>
      <div data-studio="line">
        {EMPHASES.map((e) => (
          <Button key={e} emphasis={e}>
            {e[0]!.toUpperCase() + e.slice(1)}
          </Button>
        ))}
        <Button icon="plus" aria-label="Add" emphasis="outline" />
      </div>
      <div data-studio="line">
        {['neutral', 'positive', 'caution', 'critical', ...props.tones].map((t) => (
          <Button key={t} tone={t} emphasis="soft" size="sm">
            {t}
          </Button>
        ))}
      </div>
      <div data-studio="line">
        <Button onClick={() => (open.value = true)}>Open a dialog</Button>
        <Link href="#studio">A text link</Link>
      </div>
      <Modal
        open={open}
        title="Ship the new look?"
        description="Every page picks it up on the next deploy."
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" onClick={() => (open.value = false)}>
              Not yet
            </Button>
            <Button onClick={() => (open.value = false)}>Ship it</Button>
          </>
        }
      >
        The dialog takes the surface, radius, shadow and motion tokens.
      </Modal>
    </Card>
  )
}

function Fields() {
  const plan = state('team')
  const seats = state(12)
  return (
    <Card eyebrow="Forms" title="Fields and choices" sweep={false}>
      <Input label="Workspace name" defaultValue="Lemonstand" />
      <Select
        label="Region"
        defaultValue="fra"
        options={[
          { value: 'fra', label: 'Frankfurt' },
          { value: 'iad', label: 'Virginia' },
          { value: 'syd', label: 'Sydney' },
        ]}
      />
      <Segmented
        label="Plan"
        value={plan.value}
        onChange={(v) => (plan.value = v)}
        options={[
          { value: 'solo', label: 'Solo' },
          { value: 'team', label: 'Team' },
          { value: 'org', label: 'Org' },
        ]}
      />
      <Slider
        label="Seats"
        value={seats.value}
        min={1}
        max={50}
        onChange={(v) => (seats.value = v)}
      />
      <div data-studio="line">
        <Checkbox checked>Email me</Checkbox>
        <Switch checked>Preview deploys</Switch>
        <Radio name="studio-r" checked>
          Rolling
        </Radio>
      </div>
    </Card>
  )
}

function Status() {
  const tab = state('overview')
  return (
    <Card eyebrow="Status" title="Feedback and data" sweep={false}>
      <Tabs
        label="Project"
        value={tab.value}
        onChange={(v) => (tab.value = v)}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'deploys', label: 'Deploys' },
          { value: 'settings', label: 'Settings' },
        ]}
      >
        {(v) => (
          <div data-studio="line">
            <Badge tone="positive">Live</Badge>
            <Badge>{v}</Badge>
            <Tag>edge</Tag>
            <Chip pressed>Pinned</Chip>
            <Chip>Archived</Chip>
          </div>
        )}
      </Tabs>
      <Progress label="Build" value={64} />
      <Alert tone="info" title="A new region is open">
        Sydney takes deploys from today.
      </Alert>
    </Card>
  )
}

/** The preview board. `tones` are the named colours, shown as tones too. */
export function Specimen(props: { tones: string[] }) {
  return (
    <div data-studio="board">
      <Actions tones={props.tones} />
      <Fields />
      <Status />
    </div>
  )
}
