// The toolkit page's demos. Each sits between // #id and the next marker, and the page shows that text as its code, so
// what you read is what is running.
import { state } from '@weft-js/core'
import { Accordion, Alert, Badge, Button, Canvas, Card, Checkbox, Chip, CommandPalette, Dither, DitherField, DitherGlyph, Drawer, Input, Kbd, Menu, Modal, Popover, Progress, RadioGroup, Search, Segmented, Select, Skeleton, Slider, Spinner, Switch, Table, Tabs, Tag, Textarea, Ticker, Toaster, Toggle, Tooltip, toast } from '@weft-js/warp'

// #button
export function ButtonDemo() {
  return (
    <>
      <Button>Save</Button>
      <Button emphasis="outline" tone="neutral">Cancel</Button>
      <Button emphasis="frame">Deploy</Button>
      <Button loading>Saving</Button>
    </>
  )
}

// #toggle
export function ToggleDemo() {
  const bold = state(true)
  return <Toggle pressed={bold.value} onClick={() => (bold.value = !bold.value)}>Bold</Toggle>
}

// #chip
export function ChipDemo() {
  const open = state(true)
  return <Chip pressed={open.value} onClick={() => (open.value = !open.value)} count={4}>Open</Chip>
}

// #menu
export function MenuDemo() {
  return (
    <Menu label="Actions" items={[
      { label: 'Rename', icon: 'pencil', shortcut: '⌘R' },
      { label: 'Duplicate', shortcut: '⌘D' },
      { separator: true },
      { label: 'Delete', tone: 'critical', icon: 'trash' },
    ]} />
  )
}

// #input
export function InputDemo() {
  return <Input label="Email" type="email" hint="We only use this to sign you in." />
}

// #search
export function SearchDemo() {
  return <Search label="Search projects" />
}

// #textarea
export function TextareaDemo() {
  return <Textarea label="Notes" maxLength={120} />
}

// #select
export function SelectDemo() {
  return <Select label="Sort by" options={[{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }, { value: 'az', label: 'A to Z' }]} />
}

// #checkbox
export function CheckboxDemo() {
  return <Checkbox defaultChecked>Send receipts</Checkbox>
}

// #radio
export function RadioDemo() {
  const plan = state('pro')
  return <RadioGroup label="Plan" value={plan.value} onChange={v => (plan.value = v)} options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro', hint: 'Most teams.' }]} />
}

// #switch
export function SwitchDemo() {
  return <Switch defaultChecked>Bluetooth</Switch>
}

// #slider
export function SliderDemo() {
  const volume = state(40)
  return <Slider label="Volume" value={volume.value} onChange={v => (volume.value = v)} format={v => `${v}%`} />
}

// #segmented
export function SegmentedDemo() {
  const range = state('week')
  return <Segmented label="Range" value={range.value} onChange={v => (range.value = v)} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
}

// #tabs
export function TabsDemo() {
  const tab = state('overview')
  return (
    <Tabs label="Project" value={tab.value} onChange={v => (tab.value = v)} options={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }, { value: 'settings', label: 'Settings' }]}>
      {v => <p>Showing {v}.</p>}
    </Tabs>
  )
}

// #accordion
export function AccordionDemo() {
  return (
    <Accordion defaultOpen={['general']} items={[
      { value: 'general', title: 'General', content: 'Workspace name and default branch.' },
      { value: 'security', title: 'Security', content: 'Require two-factor sign-in.' },
    ]} />
  )
}

// #modal
export function ModalDemo() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" onClick={() => (open.value = true)}>Invite someone</Button>
      <Modal open={open} title="Invite a teammate" description="They get access right away." footer={<Button data-close="">Send invite</Button>}>
        <Input label="Email" type="email" />
      </Modal>
    </>
  )
}

// #drawer
export function DrawerDemo() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" onClick={() => (open.value = true)}>Filters</Button>
      <Drawer open={open} title="Filters" footer={<Button data-close="">Apply</Button>}>
        <Input label="Owner" />
      </Drawer>
    </>
  )
}

// #popover
export function PopoverDemo() {
  return <Popover label="Details" title="Project" description="Created by Mara.">Last deployed an hour ago.</Popover>
}

// #tooltip
export function TooltipDemo() {
  return <Tooltip content="Copy the link" kbd="C"><Button emphasis="outline">Copy</Button></Tooltip>
}

// #palette
export function PaletteDemo() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" onClick={() => (open.value = true)}>Open the palette</Button>
      <CommandPalette open={open} commands={[
        { id: 'settings', label: 'Open settings', group: 'Go', icon: 'settings', shortcut: '⌘,' },
        { id: 'invite', label: 'Invite teammate', group: 'Team', icon: 'user' },
      ]} />
    </>
  )
}

// #toast
export function ToastDemo() {
  const save = () => toast.promise(new Promise(done => { setTimeout(done, 1200) }), { pending: 'Deploying', done: 'Deployed', error: 'That failed' })
  return (
    <>
      <Button emphasis="soft" onClick={() => toast.show({ title: 'Saved' })}>Show a toast</Button>
      <Button emphasis="soft" onClick={save}>Run a task</Button>
      <Toaster />
    </>
  )
}

// #alert
export function AlertDemo() {
  return <Alert tone="positive" title="Deployed">Your changes are live.</Alert>
}

// #progress
export function ProgressDemo() {
  return <Progress label="Upload" value={62} />
}

// #spinner
export function SpinnerDemo() {
  return <Spinner />
}

// #skeleton
export function SkeletonDemo() {
  return <Skeleton lines={3} />
}

// #ticker
export function TickerDemo() {
  const sales = state(48120)
  return (
    <>
      <span style="font-size:2rem;font-weight:600"><Ticker value={sales.value} format={{ style: 'currency', currency: 'USD' }} /></span>
      <Button emphasis="soft" size="sm" onClick={() => (sales.value += 3187)}>Add a sale</Button>
    </>
  )
}

// #card
export function CardDemo() {
  return <Card eyebrow="Revenue" title="$48,120">Up 12% on last month.</Card>
}

// #badge
export function BadgeDemo() {
  return (
    <>
      <Badge tone="positive">Live</Badge>
      <Tag>design</Tag>
      <Kbd>⌘K</Kbd>
    </>
  )
}

// #table
export function TableDemo() {
  const rows = [{ id: 1, name: 'Apollo', status: 'Live' }, { id: 2, name: 'Hermes', status: 'Paused' }]
  return <Table caption="Projects" rows={rows} columns={[{ id: 'name', header: 'Name', sort: true }, { id: 'status', header: 'Status' }]} />
}

// #dither-field
export function DitherFieldDemo() {
  return <DitherField ratio="3 / 1" pointer="pull"><strong style="position:relative">Move your pointer here</strong></DitherField>
}

// #dither
export function DitherDemo() {
  return <Dither label="A dithered gradient" ratio="3 / 1" />
}

// #dither-glyph
export function DitherGlyphDemo() {
  return <DitherGlyph text="warp" />
}

// #canvas
export function CanvasDemo() {
  return (
    <Canvas animate label="A wave of dots" style="block-size:96px;color:var(--warp-color-accent-text)" draw={({ ctx, width, height, time }) => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = getComputedStyle(ctx.canvas).color
      for (let x = 6; x < width; x += 12) {
        const y = height / 2 + Math.sin(x / 40 + time * 2) * height * 0.35
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
    }} />
  )
}
