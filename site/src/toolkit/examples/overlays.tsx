import { derived, state } from '@weft-js/core'
import { Badge, Button, Checkbox, Chip, Drawer, Icon, Input, Modal, Popover, Row, Select, Snippet, Stack, Switch, Text, Tooltip } from '@weft-js/warp'
import { DEPLOYS, TONE_OF, type Status } from '../world'

export function ModalPlay(p: { size: 'sm' | 'md' | 'lg'; placement: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'full'; alert: boolean; tone: 'neutral' | 'critical'; title: string }) {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Open the modal</Button>
      <Modal open={open} size={p.size} placement={p.placement} alert={p.alert} tone={p.tone === 'critical' ? 'critical' : undefined} title={p.title} description="Everyone on the project sees this." footer={<Button data-close="">Done</Button>}>
        <Text subtle>Press Done, the cross, or Escape to close.</Text>
      </Modal>
    </>
  )
}

export function ModalRename() {
  const open = state(false)
  const name = state('storefront')
  const save = (e: Event) => { e.preventDefault(); open.value = false }
  return (
    <Stack gap="related" align="center">
      <Text role="heading">{name.value}</Text>
      <Button emphasis="outline" tone="neutral" icon="pencil" onClick={() => (open.value = true)}>Rename</Button>
      <Modal open={open} size="sm" title="Rename project" footer={<><Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button><Button onClick={save}>Save</Button></>}>
        <Input label="Project name" autofocus value={name.value} onInput={(e: Event) => (name.value = (e.target as HTMLInputElement).value)} />
      </Modal>
    </Stack>
  )
}

export function ModalSizes() {
  const small = state(false)
  const medium = state(false)
  const large = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (small.value = true)}>Small</Button>
      <Button emphasis="outline" tone="neutral" onClick={() => (medium.value = true)}>Medium</Button>
      <Button emphasis="outline" tone="neutral" onClick={() => (large.value = true)}>Large</Button>
      <Modal open={small} size="sm" title="Small"><Text subtle>A question or one field.</Text></Modal>
      <Modal open={medium} title="Medium"><Text subtle>A short form. This is the default.</Text></Modal>
      <Modal open={large} size="lg" title="Large"><Text subtle>A table, a diff or anything wide.</Text></Modal>
    </>
  )
}

export function ModalConfirm() {
  const open = state(false)
  const kept = state(true)
  return (
    <Stack gap="related" align="center">
      <Text subtle>{kept.value ? 'storefront is still here.' : 'storefront is gone.'}</Text>
      <Button tone="critical" onClick={() => (open.value = true)}>Delete project</Button>
      <Modal open={open} alert size="sm" tone="critical" title="Delete storefront?" description="Its 412 deploys and all its logs go too. This can't be undone." footer={<>
        <Button emphasis="ghost" tone="neutral" autofocus data-close="">Keep it</Button>
        <Button tone="critical" data-close="" onClick={() => (kept.value = false)}>Delete project</Button>
      </>} />
    </Stack>
  )
}

export function ModalLongBody() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>See all deploys</Button>
      <Modal open={open} title="Deploys today" description="The header and footer stay put while the middle scrolls." footer={<Button data-close="">Close</Button>}>
        <Stack gap="group">
          {[...DEPLOYS, ...DEPLOYS].map((d, i) => (
            <Stack key={i} gap="hair">
              <Text>{d.message}</Text>
              <Text role="caption" subtle>{d.author}, {d.project}, {d.minutes} min</Text>
            </Stack>
          ))}
        </Stack>
      </Modal>
    </>
  )
}

export function ModalResult() {
  const open = state(false)
  return (
    <>
      <Button icon="rocket" onClick={() => (open.value = true)}>Deploy</Button>
      <Modal open={open} size="sm" mark={<Icon name="check-circle" size={32} />} title="storefront is live" description="Deployed 9f3ac21 to eu-west in 2 minutes." footer={<Button data-close="">Nice</Button>} />
    </>
  )
}

const ROLES = [{ value: 'Admin', label: 'Admin' }, { value: 'Member', label: 'Member' }, { value: 'Viewer', label: 'Viewer' }]

export function ModalInvite() {
  const open = state(false)
  const email = state('')
  const role = state('Member')
  const sent = state('')
  const send = () => {
    sent.value = `Invited ${email.value} as ${role.value}.`
    email.value = ''
    open.value = false
  }
  return (
    <Stack gap="related" align="center">
      <Button icon="user" onClick={() => (open.value = true)}>Invite a teammate</Button>
      <Text subtle>{sent.value}</Text>
      <Modal open={open} size="sm" title="Invite a teammate" description="They get an email with a link to join Tessel." footer={<>
        <Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button>
        <Button disabled={!email.value.includes('@')} onClick={send}>Send invite</Button>
      </>}>
        <Stack gap="group">
          <Input label="Work email" type="email" placeholder="noor@tessel.dev" autofocus value={email.value} onInput={(e: Event) => (email.value = (e.target as HTMLInputElement).value)} />
          <Select label="Role" value={role} options={ROLES} />
        </Stack>
      </Modal>
    </Stack>
  )
}

export function DrawerPlay(p: { side: 'auto' | 'right' | 'left' | 'top' | 'bottom' }) {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Open the drawer</Button>
      <Drawer open={open} side={p.side} title="Deploy d-4821" description="storefront, on main">
        <Text subtle>Cache product images at the edge.</Text>
      </Drawer>
    </>
  )
}

export function DrawerSides() {
  const left = state(false)
  const right = state(false)
  const bottom = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (left.value = true)}>Left</Button>
      <Button emphasis="outline" tone="neutral" onClick={() => (bottom.value = true)}>Bottom</Button>
      <Button emphasis="outline" tone="neutral" onClick={() => (right.value = true)}>Right</Button>
      <Drawer open={left} side="left" title="Left"><Text subtle>For navigation.</Text></Drawer>
      <Drawer open={bottom} side="bottom" title="Bottom"><Text subtle>For a quick task, and on phones.</Text></Drawer>
      <Drawer open={right} side="right" title="Right"><Text subtle>For details of what you pressed.</Text></Drawer>
    </>
  )
}

export function DrawerFooter() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" icon="settings" onClick={() => (open.value = true)}>Edit build settings</Button>
      <Drawer open={open} title="Build settings" description="Applied on the next deploy." footer={<Row gap="related" justify="end"><Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button><Button data-close="">Save</Button></Row>}>
        <Stack gap="group">
          <Input label="Build command" defaultValue="npm run build" />
          <Input label="Output folder" defaultValue="dist" />
          <Switch defaultChecked>Cache dependencies</Switch>
        </Stack>
      </Drawer>
    </>
  )
}

export function DrawerDeployDetails() {
  const open = state(false)
  const picked = state(DEPLOYS[0])
  const show = (d: typeof DEPLOYS[number]) => { picked.value = d; open.value = true }
  return (
    <Stack gap="related" divided>
      {DEPLOYS.slice(0, 4).map(d => (
        <Row key={d.id} justify="between" gap="group">
          <Stack gap="hair"><Text>{d.project}</Text><Text role="caption" subtle>{d.message}</Text></Stack>
          <Button size="sm" emphasis="ghost" tone="neutral" onClick={() => show(d)}>Details</Button>
        </Row>
      ))}
      <Drawer open={open} title={picked.value.message} description={`${picked.value.project}, ${picked.value.id}`}>
        <Stack gap="related">
          <Row justify="between"><Text subtle>Status</Text><Badge tone={TONE_OF[picked.value.status as Status]} dot>{picked.value.status}</Badge></Row>
          <Row justify="between"><Text subtle>Author</Text><Text>{picked.value.author}</Text></Row>
          <Row justify="between"><Text subtle>Branch</Text><Text>{picked.value.branch}</Text></Row>
          <Row justify="between"><Text subtle>Commit</Text><Text role="code">{picked.value.commit}</Text></Row>
          <Row justify="between"><Text subtle>Took</Text><Text>{picked.value.minutes} min</Text></Row>
        </Stack>
      </Drawer>
    </Stack>
  )
}

const FILTER_REGIONS = ['eu-west', 'us-east', 'ap-south']

export function DrawerFilters() {
  const open = state(false)
  const failed = state(false)
  const regions = state(['eu-west'])
  const flip = (r: string) => (regions.value = regions.value.includes(r) ? regions.value.filter(x => x !== r) : [...regions.value, r])
  const count = derived(() => regions.value.length + (failed.value ? 1 : 0))
  const clear = () => { regions.value = []; failed.value = false }
  return (
    <>
      <Button emphasis="outline" tone="neutral" icon="filter" onClick={() => (open.value = true)}>Filters ({count.value})</Button>
      <Drawer open={open} title="Filter deploys" footer={<Row gap="related" justify="between"><Button emphasis="ghost" tone="neutral" onClick={clear}>Clear</Button><Button data-close="">Show results</Button></Row>}>
        <Stack gap="section">
          <Stack gap="related">
            <Text role="label">Region</Text>
            {FILTER_REGIONS.map(r => <Checkbox key={r} checked={regions.value.includes(r)} onChange={() => flip(r)}>{r}</Checkbox>)}
          </Stack>
          <Switch checked={failed.value} onChange={() => (failed.value = !failed.value)}>Failed deploys only</Switch>
        </Stack>
      </Drawer>
    </>
  )
}

export const PopoverPlay = (p: { side: 'top' | 'bottom' | 'left' | 'right'; align: 'start' | 'center' | 'end'; title: string }) => (
  <Popover label="Details" side={p.side} align={p.align} title={p.title} description="Deployed 2 minutes ago by Priya." />
)

export const PopoverBasic = () => (
  <Popover label="What is a preview?" title="Preview deploys" description="Every branch gets its own address, so you can try a change before it goes live." />
)

export const PopoverSides = () => (
  <>
    <Popover label="Top" side="top" title="Top" description="Opens above the button." />
    <Popover label="Bottom" side="bottom" title="Bottom" description="Opens below the button." />
    <Popover label="Left" side="left" title="Left" description="Opens before the button." />
    <Popover label="Right" side="right" title="Right" description="Opens after the button." />
  </>
)

export const PopoverAligns = () => (
  <>
    <Popover label="Start" align="start" title="Start" description="Lines up with the left edge. The default." />
    <Popover label="Center" align="center" title="Center" description="Sits in the middle." />
    <Popover label="End" align="end" title="End" description="Lines up with the right edge." />
  </>
)

export const PopoverTrigger = () => (
  <>
    <Popover label="Soft" trigger={{ emphasis: 'soft' }} title="Soft" />
    <Popover label="With an icon" trigger={{ icon: 'info', emphasis: 'ghost', tone: 'neutral' }} title="Ghost" />
    <Popover label="Small" trigger={{ size: 'sm' }} title="Small" />
  </>
)

export function PopoverClose() {
  const on = state('Nobody is on call')
  return (
    <Stack gap="related" align="center">
      <Text subtle>{on.value}</Text>
      <Popover label="Take the pager" title="Go on call?" description="Alerts for every project will come to you tonight.">
        <Row gap="related" justify="end">
          <Button size="sm" emphasis="ghost" tone="neutral" data-close-popover="">Not now</Button>
          <Button size="sm" data-close-popover="" onClick={() => (on.value = 'You are on call')}>Go on call</Button>
        </Row>
      </Popover>
    </Stack>
  )
}

const STATUSES = ['Live', 'Building', 'Failed']

export function PopoverFilter() {
  const on = state(['Failed'])
  const flip = (s: string) => (on.value = on.value.includes(s) ? on.value.filter(x => x !== s) : [...on.value, s])
  return (
    <Row gap="related">
      <Popover label={`Status (${on.value.length})`} trigger={{ icon: 'filter' }} title="Show deploys that are">
        <Row gap="tight">
          {STATUSES.map(s => <Chip key={s} pressed={on.value.includes(s)} onClick={() => flip(s)}>{s}</Chip>)}
        </Row>
      </Popover>
      <Text subtle>{on.value.join(', ') || 'Everything'}</Text>
    </Row>
  )
}

export const PopoverShare = () => (
  <Popover label="Share" trigger={{ icon: 'link' }} title="Share this preview" description="Anyone with the link can look. It stops working when the branch is deleted.">
    <Snippet prompt="" code="https://ranking-v2.search-api.tessel.app" />
  </Popover>
)

export const TooltipPlay = (p: { content: string; side: 'top' | 'bottom' | 'left' | 'right'; kbd: string }) => (
  <Tooltip content={p.content} side={p.side} kbd={p.kbd}><Button emphasis="outline" tone="neutral">Hover or focus me</Button></Tooltip>
)

export const TooltipBasic = () => (
  <Tooltip content="Runs on every region"><Button emphasis="outline" tone="neutral">Deploy everywhere</Button></Tooltip>
)

export const TooltipSides = () => (
  <>
    <Tooltip content="Above" side="top"><Button emphasis="outline" tone="neutral">Top</Button></Tooltip>
    <Tooltip content="Below" side="bottom"><Button emphasis="outline" tone="neutral">Bottom</Button></Tooltip>
    <Tooltip content="Before" side="left"><Button emphasis="outline" tone="neutral">Left</Button></Tooltip>
    <Tooltip content="After" side="right"><Button emphasis="outline" tone="neutral">Right</Button></Tooltip>
  </>
)

export const TooltipShortcut = () => (
  <Tooltip content="Search commands" kbd="⌘K"><Button emphasis="outline" tone="neutral" icon="search" label="Search" /></Tooltip>
)

export const TooltipIconBar = () => (
  <Row gap="tight">
    <Tooltip content="Redeploy" kbd="R"><Button emphasis="ghost" tone="neutral" icon="rocket" label="Redeploy" /></Tooltip>
    <Tooltip content="Open logs" kbd="L"><Button emphasis="ghost" tone="neutral" icon="external" label="Open logs" /></Tooltip>
    <Tooltip content="Copy commit" kbd="C"><Button emphasis="ghost" tone="neutral" icon="copy" label="Copy commit" /></Tooltip>
    <Tooltip content="Delete"><Button emphasis="ghost" tone="critical" icon="trash" label="Delete" /></Tooltip>
  </Row>
)

export const TooltipWhyDisabled = () => (
  <Tooltip content="Only owners can delete a project"><Button tone="critical" aria-disabled="true">Delete project</Button></Tooltip>
)

export const TooltipStatusRow = () => (
  <Row justify="between" gap="group">
    <Text>mobile-bff</Text>
    <Row gap="tight">
      <Badge tone="critical" dot>Failed</Badge>
      <Tooltip content="Retry timed out upstream calls" side="left"><Button size="sm" emphasis="ghost" tone="neutral" icon="info" label="Why it failed" /></Tooltip>
    </Row>
  </Row>
)


export function ModalDefault() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Open modal</Button>
      <Modal open={open} title="Rename project" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Press Done, the cross or Escape to close.</Text>
      </Modal>
    </>
  )
}

export function ModalCenter() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Center</Button>
      <Modal open={open} placement="center" title="Rename project" footer={<Button data-close="">Done</Button>}>
        <Text subtle>The default: centred on the page.</Text>
      </Modal>
    </>
  )
}

export function ModalTop() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Top</Button>
      <Modal open={open} placement="top" title="Search the workspace" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Sits near the top, for search and quick commands.</Text>
      </Modal>
    </>
  )
}

export function ModalBottom() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Bottom</Button>
      <Modal open={open} placement="bottom" title="Share this deploy" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Rises from the bottom edge.</Text>
      </Modal>
    </>
  )
}

export function ModalLeft() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Left</Button>
      <Modal open={open} placement="left" title="Project menu" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Fills the left side, for navigation.</Text>
      </Modal>
    </>
  )
}

export function ModalRight() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Right</Button>
      <Modal open={open} placement="right" title="Deploy details" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Fills the right side, for details.</Text>
      </Modal>
    </>
  )
}

export function ModalFull() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Full</Button>
      <Modal open={open} placement="full" title="Compare two deploys" footer={<Button data-close="">Done</Button>}>
        <Text subtle>Covers the whole window, for wide work.</Text>
      </Modal>
    </>
  )
}

export function DrawerRight() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Right</Button>
      <Drawer open={open} side="right" title="Deploy d-4821">
        <Text subtle>For details of what you pressed.</Text>
      </Drawer>
    </>
  )
}

export function DrawerLeft() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Left</Button>
      <Drawer open={open} side="left" title="Projects">
        <Text subtle>For navigation.</Text>
      </Drawer>
    </>
  )
}

export function DrawerTop() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Top</Button>
      <Drawer open={open} side="top" title="Search">
        <Text subtle>For a search or a short notice.</Text>
      </Drawer>
    </>
  )
}

export function DrawerBottom() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Bottom</Button>
      <Drawer open={open} side="bottom" title="Share">
        <Text subtle>For a quick task, and on phones.</Text>
      </Drawer>
    </>
  )
}

export const TooltipAligns = () => (
  <>
    <Tooltip content="Lines up with the start" align="start"><Button emphasis="outline" tone="neutral">Start</Button></Tooltip>
    <Tooltip content="Centred on the button" align="center"><Button emphasis="outline" tone="neutral">Center</Button></Tooltip>
    <Tooltip content="Lines up with the end" align="end"><Button emphasis="outline" tone="neutral">End</Button></Tooltip>
  </>
)

// Hub cards: each overlay drawn open in the card with `inline` (in flow, no top layer), so the card shows the surface
// itself, not the button that opens it.
export function ModalTile() {
  const open = state(true)
  return (
    <Modal inline open={open} size="sm" title="Rename project" description="Everyone on the project sees the new name." footer={<><Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button><Button data-close="">Save</Button></>}>
      <Input label="Project name" value="storefront" />
    </Modal>
  )
}

export function DrawerTile() {
  const open = state(true)
  const d = DEPLOYS[0]
  return (
    <div style="display:flex;justify-content:flex-end;min-inline-size:0">
      <Drawer inline open={open} side="right" title={d.message} description={`${d.project}, ${d.id}`}>
        <Stack gap="related">
          <Row justify="between"><Text subtle>Status</Text><Badge tone={TONE_OF[d.status as Status]} dot>{d.status}</Badge></Row>
          <Row justify="between"><Text subtle>Author</Text><Text>{d.author}</Text></Row>
          <Row justify="between"><Text subtle>Branch</Text><Text>{d.branch}</Text></Row>
        </Stack>
      </Drawer>
    </div>
  )
}

export const PopoverTile = () => (
  <div style="display:grid;justify-items:center;inline-size:100%">
    <Popover inline label="Details" title="Preview deploys" description="Every branch gets its own address, so you can try a change before it goes live." />
  </div>
)

export const TooltipTile = () => (
  <div style="display:grid;justify-items:center">
    <Tooltip inline content="Runs on every region" kbd="⌘D"><Button emphasis="outline" tone="neutral">Deploy everywhere</Button></Tooltip>
  </div>
)
