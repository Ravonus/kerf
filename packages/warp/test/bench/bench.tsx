// The toolkit on one page, every base component in the states a person sees, for looking at (not for tests):
// scripts/shots.mjs photographs it at every dial stop. ?expression=quiet|balanced|vivid ?theme=light|dark
import { render } from '@weft-js/core/dom'
import { state, type State } from '@weft-js/core'
import { dialsFromUrl } from '@weft-js/warp-core'
import {
  Accordion,
  Menu,
  RadioGroup,
  Slider,
  Ticker,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  CommandPalette,
  Drawer,
  Input,
  Kbd,
  Modal,
  Popover,
  Progress,
  Row,
  Search,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  Toaster,
  Toggle,
  Tooltip,
  toast,
  Heading,
  Text,
  Nav,
  Link,
} from '../../src/index'

const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const
const EMPHASES = ['solid', 'soft', 'outline', 'ghost', 'frame', 'link'] as const

function Tile({ name, children }: { name: string; children: unknown }) {
  return (
    <section
      data-bench={name}
      style="display:grid;gap:12px;padding:20px;border:1px dashed color-mix(in oklab,currentColor 18%,transparent);border-radius:4px;min-width:0"
    >
      <h2 style="margin:0;font:500 11px/1 ui-monospace,monospace;letter-spacing:.06em;opacity:.6">
        {name}
      </h2>
      {children}
    </section>
  )
}

function App() {
  const tab = state('overview'),
    tab2 = state('overview'),
    tab3 = state('overview')
  const seg = state('week')
  const modal = state(false),
    drawer = state(false),
    alert = state(false)
  const palette = state(false)
  const pressed = state(true)
  const money = state(48120),
    plan = state('pro'),
    vol = state(40)
  const rows = [
    { id: 'apollo', name: 'Apollo', owner: 'Mara Chen', status: 'Live', spend: 12400 },
    { id: 'hermes', name: 'Hermes', owner: 'Ivo Tan', status: 'Paused', spend: 860 },
    { id: 'iris', name: 'Iris', owner: 'Sana Roy', status: 'Live', spend: 4310 },
    { id: 'atlas', name: 'Atlas', owner: 'Jo Park', status: 'Draft', spend: 0 },
  ]
  return (
    <div style="max-width:1280px;margin:0 auto;padding:24px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))">
      <ButtonEmphasisTile />
      <ButtonStatesTile />
      <ToggleChipTile pressed={pressed} />
      <InputFieldTile />
      <SearchTextareaTile />
      <SelectTile />
      <CheckboxSwitchTile />
      <SegmentedTile seg={seg} />
      <TabsTile tab={tab} tab2={tab2} tab3={tab3} />
      <CardTile />
      <BadgeTagKbdTile />
      <AlertTile />
      <ProgressTile />
      <MenuTile />
      <TickerTile money={money} />
      <RadioSliderTile selectedPlan={plan} vol={vol} />
      <AccordionTile />
      <TooltipPopoverTile />
      <OverlaysTile modal={modal} alert={alert} drawerOpen={drawer} palette={palette} />
      <NavTile />
      <TypeTile />
      <div
        data-bench="Table"
        style="grid-column:1/-1;display:grid;gap:12px;padding:20px;border:1px dashed color-mix(in oklab,currentColor 18%,transparent);border-radius:4px;min-width:0"
      >
        <Table
          caption="Projects"
          rows={rows}
          columns={[
            { id: 'name', header: 'Name', sort: true },
            { id: 'owner', header: 'Owner' },
            { id: 'status', header: 'Status' },
            { id: 'spend', header: 'Spend', numeric: true, sort: true },
          ]}
          filter="Filter"
          selection
          page={{ size: 10 }}
        />
      </div>
      <Toaster />
    </div>
  )
}

function ButtonEmphasisTile() {
  return (
    <Tile name="Button emphasis">
      {EMPHASES.map((e) => (
        <Row key={e} gap="tight">
          {TONES.slice(0, 4).map((t) => (
            <Button key={t} emphasis={e} tone={t} size="sm">
              {t}
            </Button>
          ))}
        </Row>
      ))}
    </Tile>
  )
}

function ButtonStatesTile() {
  return (
    <Tile name="Button states">
      <Row gap="tight">
        <Button>Save</Button>
        <Button icon="check">Approve</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Row gap="tight">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row gap="tight">
        <Button emphasis="frame">Frame</Button>
        <Button emphasis="frame" fill>
          Filled
        </Button>
        <Button emphasis="outline" icon="search" label="Search" />
        <Button tone="critical">Delete</Button>
      </Row>
    </Tile>
  )
}

function ToggleChipTile({ pressed }: { pressed: State<boolean> }) {
  return (
    <Tile name="Toggle + Chip">
      <Row gap="tight">
        <Toggle pressed={pressed.value} onClick={() => (pressed.value = !pressed.value)}>
          Bold
        </Toggle>
        <Toggle pressed={false}>Italic</Toggle>
        <Chip>Filter</Chip>
        <Chip pressed count={4}>
          Open
        </Chip>
      </Row>
    </Tile>
  )
}

function InputFieldTile() {
  return (
    <Tile name="Input / Field">
      <Input label="Full name" />
      <Input label="Email" value="mara@loom.dev" hint="Used for sign in." icon="search" clearable />
      <Input label="Invite code" error="That code has expired." value="WARP-0" />
      <Input label="Classic" variant="classic" placeholder="Label above" />
      <Input label="Disabled" disabled value="Read only" />
    </Tile>
  )
}

function SearchTextareaTile() {
  return (
    <Tile name="Search / Textarea">
      <Search label="Search projects" />
      <Textarea label="Notes" counter={120} />
    </Tile>
  )
}

function SelectTile() {
  return (
    <Tile name="Select">
      <Select
        label="Sort by"
        options={[
          { value: 'new', label: 'Newest' },
          { value: 'old', label: 'Oldest' },
          { value: 'az', label: 'A to Z' },
        ]}
      />
      <Select
        label="Region"
        placeholder="Pick one"
        options={[
          { value: 'eu', label: 'Europe' },
          { group: 'Americas', options: [{ value: 'us', label: 'United States' }] },
        ]}
      />
    </Tile>
  )
}

function CheckboxSwitchTile() {
  return (
    <Tile name="Checkbox / Switch">
      <Checkbox>Accept terms</Checkbox>
      <Checkbox checked>Send receipts</Checkbox>
      <Checkbox indeterminate>Partly</Checkbox>
      <Switch>Wi-Fi</Switch>
      <Switch checked>Bluetooth</Switch>
    </Tile>
  )
}

function SegmentedTile({ seg }: { seg: State<string> }) {
  return (
    <Tile name="Segmented">
      <Segmented
        label="Range"
        value={seg.value}
        onChange={(v) => (seg.value = v)}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
    </Tile>
  )
}

function TabsTile({
  tab,
  tab2,
  tab3,
}: {
  tab: State<string>
  tab2: State<string>
  tab3: State<string>
}) {
  return (
    <Tile name="Tabs">
      <Tabs
        label="Line"
        value={tab.value}
        onChange={(v) => (tab.value = v)}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity' },
          { value: 'settings', label: 'Settings' },
        ]}
      >
        {(v) => <p>{v} panel</p>}
      </Tabs>
      <Tabs
        label="Pill"
        variant="pill"
        value={tab2.value}
        onChange={(v) => (tab2.value = v)}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity' },
        ]}
      >
        {(v) => <p>{v}</p>}
      </Tabs>
      <Tabs
        label="Enclosed"
        variant="enclosed"
        value={tab3.value}
        onChange={(v) => (tab3.value = v)}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity' },
        ]}
      >
        {(v) => <p>{v}</p>}
      </Tabs>
    </Tile>
  )
}

function CardTile() {
  return (
    <Tile name="Card">
      <Card eyebrow="Revenue" title="$48,120">
        Up 12% on last month.
      </Card>
      <Card eyebrow="Link" title="Open the report" href="#card">
        Interactive, sweeps at every stop.
      </Card>
    </Tile>
  )
}

function BadgeTagKbdTile() {
  return (
    <Tile name="Badge / Tag / Kbd">
      <Row gap="tight">
        {TONES.map((t) => (
          <Badge key={t} tone={t}>
            {t}
          </Badge>
        ))}
      </Row>
      <Row gap="tight">
        {TONES.map((t) => (
          <Badge key={t} tone={t} emphasis="solid">
            {t}
          </Badge>
        ))}
      </Row>
      <Row gap="tight">
        <Tag>design</Tag>
        <Tag tone="accent" swatch onRemove={() => {}}>
          billing
        </Tag>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </Row>
    </Tile>
  )
}

function AlertTile() {
  return (
    <Tile name="Alert">
      <Alert tone="info" title="Heads up">
        The build finishes in about a minute.
      </Alert>
      <Alert tone="positive" title="Deployed">
        warp shipped to production.
      </Alert>
      <Alert
        tone="critical"
        title="Failed"
        actions={
          <Button size="sm" tone="critical">
            Retry
          </Button>
        }
        onDismiss={() => {}}
      >
        The run stopped.
      </Alert>
    </Tile>
  )
}

function ProgressTile() {
  return (
    <Tile name="Progress / Spinner / Skeleton">
      <Progress label="Upload" value={62} />
      <Progress label="Waiting" />
      <Row gap="group">
        <Progress label="Ring" shape="circle" value={70} tone="positive" />
        <Spinner label="Loading" />
      </Row>
      <Skeleton lines={2} />
    </Tile>
  )
}

function MenuTile() {
  return (
    <Tile name="Menu">
      <Row gap="tight">
        <Menu
          label="Actions"
          items={[
            { group: 'Project' },
            { label: 'Rename', icon: 'pencil', shortcut: '⌘R' },
            { label: 'Duplicate', shortcut: '⌘D' },
            { label: 'Archived', disabled: true },
            { separator: true },
            { label: 'Delete', tone: 'critical', icon: 'x', shortcut: '⌫' },
          ]}
        />
      </Row>
    </Tile>
  )
}

function TickerTile({ money }: { money: State<number> }) {
  return (
    <Tile name="Ticker">
      <Stack gap="tight">
        <span data-roll="" style="font-size:32px;font-weight:600">
          <Ticker value={money.value} format={{ style: 'currency', currency: 'USD' }} />
        </span>
        <Button emphasis="soft" size="sm" data-bump="" onClick={() => (money.value += 3187)}>
          Add sale
        </Button>
      </Stack>
    </Tile>
  )
}

function RadioSliderTile({
  selectedPlan,
  vol,
}: {
  selectedPlan: State<string>
  vol: State<number>
}) {
  return (
    <Tile name="Radio / Slider">
      <RadioGroup
        label="Plan"
        value={selectedPlan.value}
        onChange={(v) => (selectedPlan.value = v)}
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro', hint: 'Most teams.' },
        ]}
      />
      <Slider
        label="Volume"
        value={vol.value}
        onChange={(v) => (vol.value = v)}
        format={(v) => `${v}%`}
      />
    </Tile>
  )
}

function AccordionTile() {
  return (
    <Tile name="Accordion">
      <Accordion
        defaultOpen={['a']}
        items={[
          {
            value: 'a',
            title: 'General settings',
            content: 'Workspace name and default branch.',
          },
          { value: 'b', title: 'Security', content: 'Require two-factor sign-in.' },
        ]}
      />
    </Tile>
  )
}

function TooltipPopoverTile() {
  return (
    <Tile name="Tooltip / Popover">
      <Row gap="tight">
        <Tooltip content="Copy the link" kbd="C">
          <Button emphasis="outline">Copy</Button>
        </Tooltip>
        <Popover label="Details" title="Project" description="Created by Mara.">
          Body of the popover.
        </Popover>
      </Row>
    </Tile>
  )
}

function OverlayControls({
  modal,
  alert,
  drawerOpen,
  palette,
}: {
  modal: State<boolean>
  alert: State<boolean>
  drawerOpen: State<boolean>
  palette: State<boolean>
}) {
  return (
    <Row gap="tight">
      <Button emphasis="outline" onClick={() => (modal.value = true)}>
        Modal
      </Button>
      <Button emphasis="outline" onClick={() => (alert.value = true)}>
        Alert
      </Button>
      <Button emphasis="outline" onClick={() => (drawerOpen.value = true)}>
        Drawer
      </Button>
      <Button emphasis="outline" onClick={() => (palette.value = true)}>
        Palette
      </Button>
    </Row>
  )
}

function ToastControls() {
  return (
    <Row gap="tight">
      <Button
        emphasis="soft"
        data-toast="ok"
        onClick={() =>
          toast.show({
            title: 'Saved',
            description: 'Your changes are live.',
            tone: 'positive',
          })
        }
      >
        Toast
      </Button>
      <Button
        emphasis="soft"
        data-toast="undo"
        onClick={() =>
          toast.show({
            title: 'Archived',
            tone: 'neutral',
            action: { label: 'Undo', onClick() {} },
          })
        }
      >
        Undo toast
      </Button>
      <Button
        emphasis="soft"
        data-toast="promise"
        onClick={() =>
          toast.promise(
            new Promise((r) => {
              setTimeout(r, 1400)
            }),
            { pending: 'Deploying…', done: 'Deployed', error: 'Failed' },
          )
        }
      >
        Promise
      </Button>
    </Row>
  )
}

function OverlaysTile({
  modal,
  alert,
  drawerOpen,
  palette,
}: {
  modal: State<boolean>
  alert: State<boolean>
  drawerOpen: State<boolean>
  palette: State<boolean>
}) {
  return (
    <Tile name="Overlays">
      <OverlayControls modal={modal} alert={alert} drawerOpen={drawerOpen} palette={palette} />
      <ToastControls />
      <Modal
        open={modal}
        title="Invite a teammate"
        description="They get access to this workspace right away."
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="">
              Cancel
            </Button>
            <Button data-close="">Send invite</Button>
          </>
        }
      >
        <Input label="Email" />
      </Modal>
      <Modal
        open={alert}
        alert
        tone="critical"
        size="sm"
        title="Delete project?"
        description="This cannot be undone."
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="" autofocus>
              Cancel
            </Button>
            <Button tone="critical" data-close="">
              Delete
            </Button>
          </>
        }
      ></Modal>
      <Drawer
        open={drawerOpen}
        title="Filters"
        description="Narrow the list."
        footer={<Button>Apply</Button>}
      >
        <Input label="Owner" />
      </Drawer>
      <CommandPalette
        open={palette}
        commands={[
          { id: 'a', label: 'Open settings', group: 'Go', icon: 'settings', shortcut: '⌘,' },
          { id: 'd', label: 'Search docs', group: 'Go', icon: 'search', hint: 'warp and weft' },
          { id: 'b', label: 'Invite teammate', group: 'Team', icon: 'user', shortcut: '⌘I' },
          { id: 'c', label: 'Toggle theme', group: 'View', icon: 'moon', shortcut: '⌘T' },
        ]}
      />
    </Tile>
  )
}

function NavTile() {
  return (
    <Tile name="Nav">
      <Nav label="Site">
        <Link href="#a" aria-current="page">
          Docs
        </Link>
        <Link href="#b">Toolkit</Link>
        <Link href="#c">Examples</Link>
      </Nav>
    </Tile>
  )
}

function TypeTile() {
  return (
    <Tile name="Type">
      <Stack gap="tight">
        <Heading level={2} role="title">
          The quick loom
        </Heading>
        <Text>Body copy sets the sound of the kit.</Text>
        <Text role="caption" subtle>
          Caption, muted.
        </Text>
      </Stack>
    </Tile>
  )
}

dialsFromUrl?.()
render(() => <App />, document.getElementById('root')!)
