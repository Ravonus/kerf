// The toolkit on one page, every base component in the states a person sees, for looking at (not for tests):
// scripts/shots.mjs photographs it at every dial stop. ?expression=quiet|balanced|vivid ?theme=light|dark
import { render } from 'weft/dom'
import { state } from 'weft'
import { dialsFromUrl } from '@weft/ui-core'
import { Alert, Badge, Button, Card, Checkbox, Chip, CommandPalette, Drawer, Grid, Input, Kbd, Modal, Popover, Progress, Row, Search, Segmented, Select, Skeleton, Spinner, Stack, Switch, Table, Tabs, Tag, Textarea, Toaster, Toggle, Tooltip, toast, Heading, Text, Nav, Link } from '../../src/index'

const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const
const EMPHASES = ['solid', 'soft', 'outline', 'ghost', 'frame', 'link'] as const

function Tile({ name, children }: { name: string; children: any }) {
  return <section data-bench={name} style="display:grid;gap:12px;padding:20px;border:1px dashed color-mix(in oklab,currentColor 18%,transparent);border-radius:4px;min-width:0"><h2 style="margin:0;font:500 11px/1 ui-monospace,monospace;letter-spacing:.06em;opacity:.6">{name}</h2>{children}</section>
}

function App() {
  const tab = state('overview'), tab2 = state('overview'), tab3 = state('overview')
  const seg = state('week')
  const modal = state(false), drawer = state(false), alert = state(false)
  const palette = state(false)
  const pressed = state(true)
  const rows = [
    { id: 'apollo', name: 'Apollo', owner: 'Mara Chen', status: 'Live', spend: 12400 },
    { id: 'hermes', name: 'Hermes', owner: 'Ivo Tan', status: 'Paused', spend: 860 },
    { id: 'iris', name: 'Iris', owner: 'Sana Roy', status: 'Live', spend: 4310 },
    { id: 'atlas', name: 'Atlas', owner: 'Jo Park', status: 'Draft', spend: 0 },
  ]
  return (
    <div style="max-width:1280px;margin:0 auto;padding:24px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))">
      <Tile name="Button emphasis">
        {EMPHASES.map(e => <Row key={e} gap="tight">{TONES.slice(0, 4).map(t => <Button key={t} emphasis={e} tone={t} size="sm">{t}</Button>)}</Row>)}
      </Tile>
      <Tile name="Button states">
        <Row gap="tight"><Button>Save</Button><Button icon="check">Approve</Button><Button loading>Saving</Button><Button disabled>Disabled</Button></Row>
        <Row gap="tight"><Button size="sm">Small</Button><Button size="md">Medium</Button><Button size="lg">Large</Button></Row>
        <Row gap="tight"><Button emphasis="frame">Frame</Button><Button emphasis="frame" fill>Filled</Button><Button emphasis="outline" icon="search" label="Search" /><Button tone="critical">Delete</Button></Row>
      </Tile>
      <Tile name="Toggle + Chip">
        <Row gap="tight"><Toggle pressed={pressed.value} onClick={() => (pressed.value = !pressed.value)}>Bold</Toggle><Toggle pressed={false}>Italic</Toggle><Chip>Filter</Chip><Chip pressed count={4}>Open</Chip></Row>
      </Tile>
      <Tile name="Input / Field">
        <Input label="Full name" />
        <Input label="Email" value="mara@loom.dev" hint="Used for sign in." icon="search" clearable />
        <Input label="Invite code" error="That code has expired." value="WARP-0" />
        <Input label="Classic" variant="classic" placeholder="Label above" />
        <Input label="Disabled" disabled value="Read only" />
      </Tile>
      <Tile name="Search / Textarea">
        <Search label="Search projects" />
        <Textarea label="Notes" counter={120} />
      </Tile>
      <Tile name="Select">
        <Select label="Sort by" options={[{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }, { value: 'az', label: 'A to Z' }]} />
        <Select label="Region" placeholder="Pick one" options={[{ value: 'eu', label: 'Europe' }, { group: 'Americas', options: [{ value: 'us', label: 'United States' }] }]} />
      </Tile>
      <Tile name="Checkbox / Switch">
        <Checkbox>Accept terms</Checkbox><Checkbox checked>Send receipts</Checkbox><Checkbox indeterminate>Partly</Checkbox>
        <Switch>Wi-Fi</Switch><Switch checked>Bluetooth</Switch>
      </Tile>
      <Tile name="Segmented">
        <Segmented label="Range" value={seg.value} onChange={v => (seg.value = v)} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </Tile>
      <Tile name="Tabs">
        <Tabs label="Line" value={tab.value} onChange={v => (tab.value = v)} options={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }, { value: 'settings', label: 'Settings' }]}>{v => <p>{v} panel</p>}</Tabs>
        <Tabs label="Pill" variant="pill" value={tab2.value} onChange={v => (tab2.value = v)} options={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }]}>{v => <p>{v}</p>}</Tabs>
        <Tabs label="Enclosed" variant="enclosed" value={tab3.value} onChange={v => (tab3.value = v)} options={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }]}>{v => <p>{v}</p>}</Tabs>
      </Tile>
      <Tile name="Card">
        <Card eyebrow="Revenue" title="$48,120">Up 12% on last month.</Card>
        <Card eyebrow="Link" title="Open the report" href="#card">Interactive, sweeps at every stop.</Card>
      </Tile>
      <Tile name="Badge / Tag / Kbd">
        <Row gap="tight">{TONES.map(t => <Badge key={t} tone={t}>{t}</Badge>)}</Row>
        <Row gap="tight">{TONES.map(t => <Badge key={t} tone={t} emphasis="solid">{t}</Badge>)}</Row>
        <Row gap="tight"><Tag>design</Tag><Tag tone="accent" swatch onRemove={() => {}}>billing</Tag><Kbd>⌘</Kbd><Kbd>K</Kbd></Row>
      </Tile>
      <Tile name="Alert">
        <Alert tone="info" title="Heads up">The build finishes in about a minute.</Alert>
        <Alert tone="positive" title="Deployed">warp shipped to production.</Alert>
        <Alert tone="critical" title="Failed" actions={<Button size="sm" tone="critical">Retry</Button>} onDismiss={() => {}}>The run stopped.</Alert>
      </Tile>
      <Tile name="Progress / Spinner / Skeleton">
        <Progress label="Upload" value={62} />
        <Progress label="Waiting" />
        <Row gap="group"><Progress label="Ring" shape="circle" value={70} tone="positive" /><Spinner label="Loading" /></Row>
        <Skeleton lines={2} />
      </Tile>
      <Tile name="Tooltip / Popover">
        <Row gap="tight">
          <Tooltip content="Copy the link" kbd="C"><Button emphasis="outline">Copy</Button></Tooltip>
          <Popover label="Details" title="Project" description="Created by Mara.">Body of the popover.</Popover>
        </Row>
      </Tile>
      <Tile name="Overlays">
        <Row gap="tight">
          <Button emphasis="outline" onClick={() => (modal.value = true)}>Modal</Button>
          <Button emphasis="outline" onClick={() => (alert.value = true)}>Alert</Button>
          <Button emphasis="outline" onClick={() => (drawer.value = true)}>Drawer</Button>
          <Button emphasis="outline" onClick={() => (palette.value = true)}>Palette</Button>
        </Row>
        <Row gap="tight">
          <Button emphasis="soft" data-toast="ok" onClick={() => toast.show({ title: 'Saved', description: 'Your changes are live.', tone: 'positive' })}>Toast</Button>
          <Button emphasis="soft" data-toast="undo" onClick={() => toast.show({ title: 'Archived', tone: 'neutral', action: { label: 'Undo', onClick() {} } })}>Undo toast</Button>
        </Row>
        <Modal open={modal} title="Invite a teammate" description="They get access to this workspace right away." footer={<><Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button><Button data-close="">Send invite</Button></>}><Input label="Email" /></Modal>
        <Modal open={alert} alert tone="critical" size="sm" title="Delete project?" description="This cannot be undone." footer={<><Button emphasis="ghost" tone="neutral" data-close="" autofocus>Cancel</Button><Button tone="critical" data-close="">Delete</Button></>}></Modal>
        <Drawer open={drawer} title="Filters" description="Narrow the list." footer={<Button>Apply</Button>}><Input label="Owner" /></Drawer>
        <CommandPalette open={palette} commands={[{ id: 'a', label: 'Open settings', group: 'Go' }, { id: 'b', label: 'Invite teammate', group: 'Team' }, { id: 'c', label: 'Toggle theme', group: 'View' }]} />
      </Tile>
      <Tile name="Nav">
        <Nav label="Site"><Link href="#a" aria-current="page">Docs</Link><Link href="#b">Toolkit</Link><Link href="#c">Examples</Link></Nav>
      </Tile>
      <Tile name="Type">
        <Stack gap="tight"><Heading level={2} role="title">The quick loom</Heading><Text>Body copy sets the sound of the kit.</Text><Text role="caption" subtle>Caption, muted.</Text></Stack>
      </Tile>
      <div data-bench="Table" style="grid-column:1/-1;display:grid;gap:12px;padding:20px;border:1px dashed color-mix(in oklab,currentColor 18%,transparent);border-radius:4px;min-width:0">
        <Table caption="Projects" rows={rows} columns={[{ id: 'name', header: 'Name', sort: true }, { id: 'owner', header: 'Owner' }, { id: 'status', header: 'Status' }, { id: 'spend', header: 'Spend', numeric: true, sort: true }]} filter="Filter" selection page={{ size: 10 }} />
      </div>
      <Toaster />
    </div>
  )
}

dialsFromUrl?.()
render(() => <App />, document.getElementById('root')!)
