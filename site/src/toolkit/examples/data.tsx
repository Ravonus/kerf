import { onCleanup, onMount, state } from 'weft'
import { Badge, Button, DataGrid, Feed, Kanban, PivotTable, Row, ScrollGrid, Stack, Table, Text, Toggle, VirtualList } from '@weft/warp'
import type { Column, GridColumn, GridTree, GridView, KanbanCardData, KanbanColumn, PivotMeasure, TableSort, VirtualControl } from '@weft/warp'
import { DEPLOYS, PEOPLE, PROJECTS, TONE_OF, type Status } from '../world'

type Project = (typeof PROJECTS)[number]
type Density = 'compact' | 'cozy' | 'comfortable'

const money = (n: number) => `$${n.toLocaleString('en-US')}`
const badge = (p: { status: string }) => <Badge tone={TONE_OF[p.status as Status]} dot>{p.status}</Badge>

const COLUMNS: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, sort: true, card: 'title' },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: badge },
  { id: 'owner', header: 'Owner', sort: true },
  { id: 'region', header: 'Region', sort: true },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true },
  { id: 'cost', header: 'Cost', numeric: true, sort: true, cell: p => money(p.cost) },
]

/* -- Table -- */

export const TablePlay = (p: { density?: Density; filter?: string; selection?: boolean; picker?: boolean; phone?: 'cards' | 'columns'; captionHidden?: boolean }) => (
  <Table caption="Projects" captionHidden={p.captionHidden} rows={PROJECTS} columns={COLUMNS} density={p.density} filter={p.filter || undefined} selection={p.selection} picker={p.picker} phone={p.phone} />
)

export function TableSortable() {
  const sort = state<TableSort | undefined>({ id: 'cost', dir: 'descending' })
  return (
    <Stack gap="related">
      <Text subtle>Sorted by {sort.value?.id}, {sort.value?.dir}.</Text>
      <Table caption="Projects by cost" captionHidden rows={PROJECTS} columns={COLUMNS} sort={sort} picker={false} />
    </Stack>
  )
}

export const TableFilter = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={COLUMNS} filter="Filter projects" picker={false} />

export function TableSelect() {
  const rows = state(PROJECTS)
  const picked = state<Record<string, boolean>>({})
  const pause = (keys: string[]) => {
    rows.value = rows.value.map(p => (keys.includes(p.id) ? { ...p, status: 'Paused' as const } : p))
    picked.value = {}
  }
  const remove = (keys: string[]) => {
    rows.value = rows.value.filter(p => !keys.includes(p.id))
    picked.value = {}
  }
  return (
    <Table
      caption="Projects" captionHidden rows={rows} columns={COLUMNS} picker={false} selection={picked}
      bulk={keys => (
        <>
          <Button size="sm" emphasis="outline" tone="neutral" icon="pause" onClick={() => pause(keys)}>Pause</Button>
          <Button size="sm" emphasis="outline" tone="critical" icon="trash" onClick={() => remove(keys)}>Delete</Button>
        </>
      )}
    />
  )
}

const FIVE = { size: 5 }

export const TablePaged = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={COLUMNS} page={FIVE} picker={false} />

const details = (p: Project) => (
  <Row gap="section">
    <Stack gap="hair"><Text role="label" subtle>Uptime</Text><Text>{p.uptime}%</Text></Stack>
    <Stack gap="hair"><Text role="label" subtle>Latency</Text><Text>{p.latency} ms</Text></Stack>
    <Stack gap="hair"><Text role="label" subtle>Updated</Text><Text>{p.updated}</Text></Stack>
  </Row>
)

export const TableDetails = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={COLUMNS} expand={details} picker={false} />

const RANKED: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, card: 'title' },
  { id: 'status', header: 'Status', card: 'badge', cell: badge },
  { id: 'owner', header: 'Owner', priority: 2 },
  { id: 'region', header: 'Region', priority: 2 },
  { id: 'latency', header: 'Latency', numeric: true, priority: 3 },
  { id: 'uptime', header: 'Uptime', numeric: true, priority: 3 },
]

export const TablePriority = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={RANKED} picker={false} />

const WIDE: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, resize: true },
  { id: 'status', header: 'Status', resize: true, cell: badge },
  { id: 'owner', header: 'Owner', resize: true },
  { id: 'region', header: 'Region' },
  { id: 'deploys', header: 'Deploys', numeric: true },
  { id: 'uptime', header: 'Uptime', numeric: true },
  { id: 'latency', header: 'Latency', numeric: true },
  { id: 'cost', header: 'Cost', numeric: true, cell: p => money(p.cost) },
  { id: 'updated', header: 'Updated' },
]

export const TablePinned = () => <Table caption="Every field of every project" captionHidden rows={PROJECTS} columns={WIDE} phone="columns" />

export const TableSticky = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={COLUMNS} maxHeight="280px" picker={false} />

const PRICED: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, edit: true, validate: v => String(v).trim() !== '' || 'A project needs a name' },
  { id: 'owner', header: 'Owner', edit: true },
  { id: 'cost', header: 'Budget', numeric: true, cell: p => money(p.cost), edit: text => Number(text.replace(/[$,]/g, '')), validate: v => Number.isFinite(v) && v >= 0 || 'Enter an amount' },
]

export function TableEdit() {
  const rows = state(PROJECTS.slice(0, 5))
  const last = state('Double-click a cell, or focus it and press Enter.')
  const save = (row: Project, column: string, value: any) => {
    rows.value = rows.value.map(p => (p.id === row.id ? { ...p, [column]: value } : p))
    last.value = `Saved ${column} for ${row.name}.`
  }
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <Table caption="Budgets" captionHidden rows={rows} columns={PRICED} onEdit={save} picker={false} />
    </Stack>
  )
}

const WATCHED = PROJECTS.slice(0, 5)

export function TableLive() {
  const ms = state(Object.fromEntries(WATCHED.map(p => [p.id, p.latency])))
  const columns: Column<Project>[] = [
    { id: 'name', header: 'Project', rowHeader: true },
    { id: 'status', header: 'Status', cell: badge },
    { id: 'latency', header: 'Latency (ms)', numeric: true, live: true, value: p => ms.get(p.id) },
  ]
  const tick = () => {
    const next = { ...ms.value }
    for (const id in next) next[id] = Math.max(12, next[id] + Math.round(Math.random() * 24 - 12))
    ms.value = next
  }
  onMount(() => {
    const timer = setInterval(tick, 1200)
    onCleanup(() => clearInterval(timer))
  })
  return <Table caption="Latency now" captionHidden rows={WATCHED} columns={columns} picker={false} />
}

export const TableLoading = () => <Table caption="Projects" captionHidden rows={PROJECTS} columns={COLUMNS} status="loading" picker={false} />

const NONE: Project[] = []

export const TableEmpty = () => (
  <Table caption="Projects" captionHidden rows={NONE} columns={COLUMNS} picker={false} empty={{ title: 'No projects yet', text: 'Connect a repository and your first deploy runs in about a minute.', action: <Button icon="plus">New project</Button> }} />
)

export function TableError() {
  const failed = state(true)
  return <Table caption="Projects" captionHidden rows={WATCHED} columns={COLUMNS} picker={false} status={failed.value ? 'error' : undefined} error={{ title: 'Projects could not load', text: 'The API timed out. Nothing was lost.' }} onRetry={() => (failed.value = false)} />
}

type Deploy = (typeof DEPLOYS)[number]

const DEPLOY_COLUMNS: Column<Deploy>[] = [
  { id: 'message', header: 'Change', rowHeader: true, card: 'title' },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: badge },
  { id: 'project', header: 'Project', sort: true },
  { id: 'author', header: 'Author', sort: true, priority: 2 },
  { id: 'commit', header: 'Commit', priority: 2, cell: d => <Text inline role="code">{d.commit}</Text> },
  { id: 'at', header: 'When', sort: true, value: d => d.at.replace('T', ' ') },
]

export const TableDeploys = () => (
  <Table
    caption="Recent deploys" rows={DEPLOYS} columns={DEPLOY_COLUMNS} filter="Filter deploys" density="cozy"
    actions={<Button icon="rocket">Deploy</Button>}
  />
)

type Person = (typeof PEOPLE)[number]

const TEAM_COLUMNS: Column<Person>[] = [
  { id: 'name', header: 'Name', rowHeader: true, sort: true, card: 'title' },
  { id: 'email', header: 'Email', card: 'hide' },
  { id: 'team', header: 'Team', sort: true },
  { id: 'role', header: 'Role', sort: true, card: 'badge', cell: p => <Badge tone={p.role === 'Owner' ? 'accent' : 'neutral'}>{p.role}</Badge> },
]

export const TableTeam = () => <Table caption="Team" rows={PEOPLE} columns={TEAM_COLUMNS} filter="Find a person" selection picker={false} />

/* -- DataGrid -- */

const STATUSES = ['Live', 'Building', 'Failed', 'Paused']
const REGION_NAMES = ['eu-west', 'eu-north', 'us-east', 'us-west', 'ap-south', 'global']

const GRID: GridColumn<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, sort: true, filter: 'text' },
  { id: 'status', header: 'Status', sort: true, filter: 'select', options: STATUSES, cell: badge },
  { id: 'region', header: 'Region', sort: true, filter: 'select', options: REGION_NAMES },
  { id: 'owner', header: 'Owner', sort: true, filter: 'text' },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true, filter: 'min', aggregate: 'sum' },
  { id: 'cost', header: 'Cost', numeric: true, sort: true, filter: 'min', aggregate: 'sum', format: money },
]

const once = (rows: Project[]) => [...new Set(rows)]
const spend = (rows: Project[]) => `Total ${money(once(rows).reduce((n, p) => n + p.cost, 0))}`

const GROUPED_GRID: GridColumn<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, sort: true, aggregate: spend },
  { id: 'status', header: 'Status', sort: true, filter: 'select', options: STATUSES, cell: badge },
  { id: 'region', header: 'Region', sort: true, filter: 'select', options: REGION_NAMES },
  { id: 'owner', header: 'Owner', sort: true },
  { id: 'cost', header: 'Cost', numeric: true, sort: true, format: money },
]

export const DataGridPlay = (p: { density?: Density; groupBy?: string; exportName?: string }) => (
  <DataGrid caption="Projects" captionHidden rows={PROJECTS} columns={GROUPED_GRID} density={p.density} groupBy={p.groupBy === 'none' ? undefined : p.groupBy} exportName={p.exportName === 'off' ? false : p.exportName} />
)

export const DataGridBasic = () => <DataGrid caption="Projects" captionHidden rows={PROJECTS} columns={GRID} exportName="tessel-projects" />

const NUMBERS: GridColumn<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, sort: true, edit: true, validate: v => String(v).trim() !== '' || 'A project needs a name' },
  { id: 'owner', header: 'Owner', sort: true, edit: true },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true, aggregate: 'sum' },
  { id: 'cost', header: 'Budget', numeric: true, sort: true, aggregate: 'sum', format: money, edit: text => Number(text.replace(/[$,]/g, '')), validate: v => (Number.isFinite(v) && v >= 0) || 'Enter an amount' },
]

export function DataGridEdit() {
  const rows = state(PROJECTS)
  const last = state('Nothing changed yet.')
  const save = (row: Project, column: string, value: any) => {
    rows.value = rows.value.map(p => (p.id === row.id ? { ...p, [column]: value } : p))
    last.value = `${row.name}: ${column} is now ${value}.`
  }
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <DataGrid caption="Budgets" captionHidden rows={rows} columns={NUMBERS} onEdit={save} exportName={false} />
    </Stack>
  )
}

const ORDER = ['name', 'status', 'region', 'owner', 'deploys', 'cost']
const VIEWS: Record<string, GridView> = {
  'All projects': { order: ORDER, hidden: [], filters: {} },
  'Needs attention': { order: ORDER, hidden: ['deploys'], filters: { status: 'Failed' } },
  'Costly': { order: ['name', 'cost', 'owner', 'region'], hidden: ['status', 'deploys'], filters: { cost: '1000' }, sort: { id: 'cost', dir: 'descending' } },
}

export const DataGridViews = () => <DataGrid caption="Projects" captionHidden rows={PROJECTS} columns={GRID} views={VIEWS} exportName={false} />

export const DataGridGroups = () => <DataGrid caption="Projects by region" captionHidden rows={PROJECTS} columns={GROUPED_GRID} groupBy="region" views={GROUPED} exportName={false} />

const GROUPED: Record<string, GridView> = { 'By region': { order: ['name', 'status', 'region', 'owner', 'cost'], hidden: [], filters: {}, group: true } }

type Spend = { id: string; name: string; deploys: number; cost: number; kids?: Spend[]; hasChildren?: boolean }

const leaf = (p: Project): Spend => ({ id: p.id, name: p.name, deploys: p.deploys, cost: p.cost })
const team = (name: string, ...ids: string[]): Spend => ({ id: name, name, deploys: 0, cost: 0, kids: PROJECTS.filter(p => ids.includes(p.id)).map(leaf) })

const SPEND: Spend[] = [
  team('Platform', 'billing', 'notifier', 'edge-cache', 'auth'),
  team('Web', 'storefront', 'checkout'),
  team('Data', 'search-api', 'reports', 'ingest'),
  team('Mobile', 'mobile-bff'),
]

const SPEND_COLUMNS: GridColumn<Spend>[] = [
  { id: 'name', header: 'Team and project' },
  { id: 'deploys', header: 'Deploys', numeric: true, aggregate: 'sum' },
  { id: 'cost', header: 'Cost', numeric: true, aggregate: 'sum', format: money },
]

const OWN_KIDS: GridTree<Spend> = {}

export const DataGridTree = () => <DataGrid caption="Spend by team" captionHidden rows={SPEND} columns={SPEND_COLUMNS} tree={OWN_KIDS} filter="Filter teams and projects" exportName={false} />

const LAZY: Spend[] = SPEND.map(t => ({ ...t, kids: undefined, hasChildren: true, deploys: t.kids!.reduce((n, k) => n + k.deploys, 0), cost: t.kids!.reduce((n, k) => n + k.cost, 0) }))

const LOAD: GridTree<Spend> = {
  branch: row => !!row.hasChildren,
  load: async row => {
    await new Promise(done => setTimeout(done, 700))
    return SPEND.find(t => t.id === row.id)?.kids ?? []
  },
}

export const DataGridLazyTree = () => <DataGrid caption="Spend by team" captionHidden rows={LAZY} columns={SPEND_COLUMNS} tree={LOAD} exportName={false} />

export function DataGridBulk() {
  const rows = state(PROJECTS)
  const pause = (keys: string[]) => (rows.value = rows.value.map(p => (keys.includes(p.id) ? { ...p, status: 'Paused' as const } : p)))
  return <DataGrid caption="Projects" captionHidden rows={rows} columns={GRID} exportName={false} bulk={keys => <Button size="sm" emphasis="outline" tone="neutral" icon="pause" onClick={() => pause(keys)}>Pause</Button>} />
}

export const DataGridDetails = () => <DataGrid caption="Projects" captionHidden rows={PROJECTS} columns={GRID} expand={details} exportName={false} />

export const DataGridPaged = () => <DataGrid caption="Projects" captionHidden rows={PROJECTS} columns={GRID} page={FOUR} exportName={false} />

const FOUR = { size: 4 }

/* -- ScrollGrid -- */

const room = (text: string) => `${text}\u00a0\u00a0\u00a0`
const HOURS = Array.from({ length: 24 }, (_, h) => ({ id: String(h), header: room(`${String(h).padStart(2, '0')}:00`) }))
const latency = (r: number, h: number) => 40 + ((r + 3) * 37 + h * h * 11) % 260

export const ScrollGridLatency = () => (
  <ScrollGrid label="Latency by hour, in milliseconds" corner="Route" rows={2000} columns={HOURS} rowHeader={r => `${PROJECTS[r % 10].name}/${r}`} cell={(r, c) => latency(r, Number(c.id))} height="400px" />
)

export const ScrollGridPlay = (p: { rows: number; headerWidth: number }) => (
  <ScrollGrid label="Latency by hour, in milliseconds" corner="Route" rows={p.rows} headerWidth={p.headerWidth} columns={HOURS} rowHeader={r => `${PROJECTS[r % 10].name}/${r}`} cell={(r, c) => latency(r, Number(c.id))} height="360px" />
)

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_COLUMNS = MONTH_NAMES.map((m, i) => ({ id: String(i), header: room(m) }))
const swing = (r: number, m: number) => (((r + 2) * 53 + (m + 1) * 29) % 41) - 14
const showSwing = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`

export const ScrollGridNegative = () => (
  <ScrollGrid label="Change in spend by month" corner="Project" rows={500} columns={MONTH_COLUMNS} rowHeader={r => `${PROJECTS[r % 10].name}-${r}`} cell={(r, c) => showSwing(swing(r, Number(c.id)))} negative={(r, c) => swing(r, Number(c.id)) < 0} height="320px" />
)

const SIZED = [{ id: 'owner', header: room('Owner'), width: 170 }, { id: 'region', header: room('Region'), width: 110 }, { id: 'status', header: room('Status'), width: 96 }, { id: 'cost', header: room('Cost'), width: 96 }]
const fieldOf = (r: number, id: string) => {
  const p = PROJECTS[r % 10]
  return id === 'cost' ? money(p.cost + r) : p[id as 'owner']
}

export const ScrollGridWidths = () => (
  <ScrollGrid label="Projects" corner="Project" rows={1000} columns={SIZED} rowHeader={r => `${PROJECTS[r % 10].name}-${r}`} cell={(r, c) => fieldOf(r, c.id)} headerWidth={160} height="300px" />
)

/* -- VirtualList -- */

const WORDS = ['GET /checkout 200', 'POST /deploys 201', 'GET /search?q=shoes 200', 'GET /health 200', 'PUT /cache 204', 'GET /cart 304', 'POST /auth 401', 'GET /reports 500']
const pad = (n: number) => String(n).padStart(2, '0')
const clock = (i: number) => `${pad(16 + Math.floor(i / 3600) % 8)}:${pad(Math.floor(i / 60) % 60)}:${pad(i % 60)}`
const LINES = Array.from({ length: 10000 }, (_, i) => ({ id: i, at: clock(i), text: WORDS[(i * 7) % 8], ms: 12 + (i * 13) % 240 }))

function logLine(line: () => (typeof LINES)[number]) {
  return (
    <Row gap="related" justify="between" wrap={false}>
      <Row gap="related" wrap={false}><Text inline role="code" subtle>{line().at}</Text><Text inline role="code">{line().text}</Text></Row>
      <Text inline role="caption" subtle>{line().ms} ms</Text>
    </Row>
  )
}

export const VirtualListPlay = (p: { height: string; gap: number; estimate: number }) => (
  <VirtualList label="Request log" items={LINES} rowKey={l => l.id} height={p.height} gap={p.gap} estimate={p.estimate}>{logLine}</VirtualList>
)

export const VirtualListLog = () => (
  <VirtualList label="Request log" items={LINES} rowKey={l => l.id} estimate={38} height="360px">{logLine}</VirtualList>
)

const NOTES = Array.from({ length: 2000 }, (_, i) => {
  const d = DEPLOYS[i % 6]
  return { id: i, who: d.author, text: `${d.message}. ${'Rolled out to every region after the checks passed, with the old version kept warm for an hour. '.repeat(i % 4)}`.trim() }
})

export const VirtualListTallRows = () => (
  <VirtualList label="Release notes" items={NOTES} rowKey={n => n.id} text={n => n.text} estimate={72} height="360px">
    {note => (
      <Stack gap="hair">
        <Text role="label">{note().who}</Text>
        <Text data-measure="">{note().text}</Text>
      </Stack>
    )}
  </VirtualList>
)

export function VirtualListJump() {
  let list: VirtualControl | undefined
  return (
    <Stack gap="related">
      <Row gap="tight">
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => list?.scrollTo(0, 'start')}>First</Button>
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => list?.scrollTo(5000, 'center')}>Row 5,000</Button>
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => list?.scrollToEnd()}>Last</Button>
      </Row>
      <VirtualList label="Request log" items={LINES} rowKey={l => l.id} estimate={38} height="300px" control={c => (list = c)}>{logLine}</VirtualList>
    </Stack>
  )
}

export function VirtualListKeys() {
  const picked = state(0)
  return (
    <Stack gap="related">
      <Text subtle>Press Tab into the list, then the arrow keys, Home and End. Picked: {PROJECTS[picked.value].name}.</Text>
      <VirtualList label="Projects" items={PROJECTS} rowKey={p => p.id} estimate={38} height="240px" roving onRowKey={(e, c) => { if (e.key === 'Enter') picked.value = PROJECTS.findIndex(p => p.id === c.active()) }}>
        {p => <Row justify="between" gap="tight"><Text inline>{p().name}</Text><Text inline role="caption" subtle>{p().region}</Text></Row>}
      </VirtualList>
    </Stack>
  )
}

export function VirtualListTail() {
  const lines = state(LINES.slice(0, 40))
  const paused = state(false)
  const stuck = state(true)
  let list: VirtualControl | undefined
  const arrive = () => { if (!paused.value) lines.value = [...lines.value, LINES[lines.value.length]] }
  onMount(() => {
    const timer = setInterval(arrive, 700)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Stack gap="related">
      <Row gap="tight">
        <Toggle size="sm" icon="pause" pressed={paused.value} onClick={() => (paused.value = !paused.value)}>Pause</Toggle>
        <Button size="sm" emphasis="ghost" tone="neutral" aria-disabled={stuck.value ? 'true' : undefined} onClick={() => list?.scrollToEnd()}>Jump to latest</Button>
      </Row>
      <VirtualList label="Live log" role="log" open from="end" stick={48} items={lines.value} rowKey={l => l.id} estimate={38} height="280px" onStick={s => (stuck.value = s)} control={c => (list = c)}>{logLine}</VirtualList>
    </Stack>
  )
}

export function VirtualListLoadMore() {
  const shown = state(LINES.slice(0, 30))
  const busy = state(false)
  const more = async () => {
    busy.value = true
    await new Promise(done => setTimeout(done, 600))
    shown.value = LINES.slice(0, shown.value.length + 30)
    busy.value = false
  }
  return (
    <Stack gap="related">
      <Text subtle>{shown.value.length} of {LINES.length} loaded{busy.value ? ', loading more' : ''}.</Text>
      <VirtualList label="Request log" items={shown.value} rowKey={l => l.id} estimate={38} height="280px" busy={busy.value} onEnd={more}>{logLine}</VirtualList>
    </Stack>
  )
}

/* -- Feed -- */

const toneOf = (status: string) => TONE_OF[status as Status]
const verb: Record<string, string> = { Live: 'shipped', Building: 'started', Failed: 'broke' }
const hoursAgo = (i: number) => (i < 24 ? `${i + 1}h` : `${Math.floor(i / 24)}d`)

const ACTIVITY = Array.from({ length: 300 }, (_, i) => {
  const d = DEPLOYS[i % 6]
  return { id: i, what: `${d.author} ${verb[d.status]} ${d.project}`, when: hoursAgo(i), detail: `${d.message}. ${d.branch} at ${d.commit}.`, tone: toneOf(d.status) }
})

export const FeedActivity = () => <Feed label="Activity" items={ACTIVITY} height="400px" />

export const FeedPlay = (p: { height: string; busy: boolean }) => <Feed label="Activity" items={ACTIVITY} height={p.height} busy={p.busy} />

export function FeedLoadMore() {
  const items = state(ACTIVITY.slice(0, 20))
  const busy = state(false)
  const more = async () => {
    if (items.value.length >= ACTIVITY.length) return
    busy.value = true
    await new Promise(done => setTimeout(done, 700))
    items.value = ACTIVITY.slice(0, items.value.length + 20)
    busy.value = false
  }
  return (
    <Stack gap="related">
      <Text subtle>{items.value.length} of {ACTIVITY.length} events{busy.value ? ', loading more' : ''}.</Text>
      <Feed label="Activity" items={items.value} height="340px" busy={busy.value} onEnd={more} />
    </Stack>
  )
}

export const FeedCustom = () => (
  <Feed label="Deploys" items={ACTIVITY} height="340px">
    {item => (
      <>
        <span data-part="knot" style={`--_dc:var(--warp-color-${item().tone}-solid)`}></span>
        <span data-part="what">{item().what}</span>
        <Badge tone={item().tone as 'positive'}>{item().when}</Badge>
        <span data-part="detail" data-measure="">{item().detail}</span>
      </>
    )}
  </Feed>
)

/* -- PivotTable -- */

const MEASURES: PivotMeasure<Project>[] = [
  { id: 'cost', label: 'Cost', value: p => p.cost, format: money },
  { id: 'deploys', label: 'Deploys', value: p => p.deploys },
  { id: 'count', label: 'Projects', value: () => 1 },
]

export const PivotTablePlay = (p: { rowHeader: string }) => (
  <PivotTable caption="Projects by region and status" rows={PROJECTS} row={r => r.region} column={r => r.status} rowHeader={p.rowHeader} measures={MEASURES} />
)

export const PivotTableRegions = () => <PivotTable caption="Projects by region and status" rows={PROJECTS} row={r => r.region} column={r => r.status} rowHeader="Region" measures={MEASURES} />

const ONE: PivotMeasure<(typeof QUARTERS)[number]>[] = [{ id: 'cost', label: 'Cost', value: q => q.cost, format: money }]
const QUARTERS = PROJECTS.slice(0, 6).flatMap(p => ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, n) => ({ project: p.name, quarter, cost: Math.round(p.cost * (0.8 + n * 0.11)) })))

export const PivotTableQuarters = () => <PivotTable caption="Quarterly spend by project" rows={QUARTERS} row={q => q.project} column={q => q.quarter} rowHeader="Project" measures={ONE} />

const HEADS: PivotMeasure<Person>[] = [{ id: 'people', label: 'People', value: () => 1 }]

export const PivotTableTeams = () => <PivotTable caption="People by team and role" rows={PEOPLE} row={p => p.team} column={p => p.role} rowHeader="Team" measures={HEADS} />

/* -- Kanban -- */

const initials = (name: string) => PEOPLE.find(p => p.name.startsWith(name))?.initials
const card = (id: string, title: string, label: string, color: number, who: string, meta?: string): KanbanCardData => ({ id, title, label, color, assignee: initials(who), meta })

const BOARD: KanbanColumn[] = [
  { id: 'todo', title: 'To do', color: 8, cards: [
    card('t1', 'Rotate the edge cache keys', 'Ops', 2, 'Jun', 'Nov 4'),
    card('t2', 'Add Apple Pay to the receipts', 'Web', 1, 'Tomás', 'Nov 6'),
    card('t3', 'Write the ranking rollout notes', 'Docs', 5, 'Lena'),
  ] },
  { id: 'doing', title: 'In progress', color: 1, limit: 3, cards: [
    card('t4', 'Retry timed out upstream calls', 'Mobile', 3, 'Sam', 'Nov 2'),
    card('t5', 'Rank exact matches first', 'Search', 4, 'Lena', 'Nov 3'),
  ] },
  { id: 'review', title: 'In review', color: 4, cards: [card('t6', 'Prorate seats on plan change', 'Billing', 6, 'Mara')] },
  { id: 'done', title: 'Done', color: 7, cards: [
    card('t7', 'Cache product images at the edge', 'Web', 1, 'Priya'),
    card('t8', 'Lower the stale window to 30s', 'Ops', 2, 'Jun'),
  ] },
]

export function KanbanBoard() {
  const columns = state(BOARD)
  return <Kanban label="Release board" columns={columns} height="460px" />
}

export function KanbanPlay(p: { height: string }) {
  const columns = state(BOARD)
  return <Kanban label="Release board" columns={columns} height={p.height} />
}

export function KanbanMoves() {
  const columns = state(BOARD)
  const last = state('Move a card. onMove reports where it landed.')
  const moved = (id: string, column: string, index: number) => (last.value = `${id} moved to ${column}, position ${index + 1}.`)
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <Kanban label="Release board" columns={columns} onMove={moved} height="420px" />
    </Stack>
  )
}

const OVER: KanbanColumn[] = [
  { id: 'todo', title: 'To do', color: 8, cards: [card('o1', 'Rotate the edge cache keys', 'Ops', 2, 'Jun')] },
  { id: 'doing', title: 'In progress', color: 1, limit: 2, cards: [
    card('o2', 'Retry timed out upstream calls', 'Mobile', 3, 'Sam'),
    card('o3', 'Rank exact matches first', 'Search', 4, 'Lena'),
    card('o4', 'Prorate seats on plan change', 'Billing', 6, 'Mara'),
  ] },
]

export function KanbanLimit() {
  const columns = state(OVER)
  return <Kanban label="Over its limit" columns={columns} height="360px" />
}

export function KanbanAdd() {
  const columns = state(BOARD.slice(0, 3))
  let made = 0
  const add = (column: string, title: string) => {
    const next = { id: `new-${made++}`, title }
    columns.value = columns.value.map(c => (c.id === column ? { ...c, cards: [...c.cards, next] } : c))
  }
  return <Kanban label="Release board" columns={columns} onAdd={add} height="440px" />
}

const SPRINT: KanbanColumn[] = ['Backlog', 'Next', 'Doing'].map((title, c) => ({
  id: title,
  title,
  color: c + 1,
  cards: Array.from({ length: 2000 }, (_, i) => ({ id: `${title}-${i}`, title: `${DEPLOYS[(i + c) % 6].message} (${i + 1})`, meta: DEPLOYS[(i + c) % 6].project })),
}))

export function KanbanLong() {
  const columns = state(SPRINT)
  return <Kanban label="2,000 cards a column" columns={columns} height="420px" />
}
