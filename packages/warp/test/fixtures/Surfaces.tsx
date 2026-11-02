// The last warp components, with fixed data so a server render and a hydration agree.
import { state } from 'weft'
import { Button } from '../../src/Button'
import { CodeInput, JsonEditor } from '../../src/CodeInput'
import { CommandPalette } from '../../src/CommandPalette'
import { DataGrid, PivotTable } from '../../src/DataGrid'
import { KeyValueEditor } from '../../src/KeyValueEditor'
import { Markdown, MarkdownEditor } from '../../src/Markdown'
import { MentionsInput } from '../../src/MentionsInput'
import { LoadMore, PaginationBar } from '../../src/Pagination'
import { RichTextEditor } from '../../src/RichTextEditor'
import { Table } from '../../src/Table'
import { Accordion } from '../../src/Accordion'
import { RadioGroup } from '../../src/Choice'
import { Menu } from '../../src/Menu'
import { Slider } from '../../src/Slider'
import { Ticker } from '../../src/Ticker'

export const PEOPLE = [{ id: 'ada', label: 'Ada Lovelace' }, { id: 'alan', label: 'Alan Turing' }]
const search = async (q: string) => PEOPLE.filter(p => p.label.toLowerCase().includes(q.toLowerCase()))
const rows = [
  { id: 'a', name: 'Apollo', team: 'Core', cost: 10 },
  { id: 'b', name: 'Borealis', team: 'Core', cost: 20 },
  { id: 'c', name: 'Cirrus', team: 'Edge', cost: 5 },
]
const columns: any[] = [
  { id: 'name', header: 'Name', sort: true, edit: true },
  { id: 'team', header: 'Team', sort: true, filter: 'set', options: ['Core', 'Edge'] },
  { id: 'cost', header: 'Cost', sort: true, align: 'end', aggregate: 'sum' },
]

const plain = columns.map(({ edit, aggregate, filter, ...c }) => c)

export function GridCase() {
  const edits = state<string[]>([])
  return <><DataGrid caption="Projects" rows={rows} columns={columns} onEdit={(r: any, c, v) => (edits.value = [...edits.value, `${r.id}.${c}=${v}`])} /><output data-out="">{edits.value.join()}</output></>
}
export function GridGroupedCase() {
  return <DataGrid caption="By team" rows={rows} columns={columns} groupBy="team" />
}
export function TreeGridCase() {
  const tree = [{ id: 'r', name: 'Root', team: 'Core', cost: 1, kids: [{ id: 'k', name: 'Kid', team: 'Core', cost: 2 }] }]
  return <DataGrid caption="Tree" rows={tree} columns={columns} tree={{}} filter="Filter" />
}
export function PivotCase() {
  return <PivotTable caption="Cost" rows={rows} row={r => r.team} column={r => r.name} rowHeader="Team" measures={[{ id: 'cost', label: 'Cost', value: r => r.cost }]} />
}
export function PagesCase() {
  const page = state(3)
  return <><PaginationBar label="Projects" page={page} total={240} size={20} /><output data-out="">{page.value}</output></>
}
export function CursorCase() {
  return <PaginationBar label="Events" mode="cursor" hasMore hasPrev pageIndex={2} size={20} totalFetched={60} />
}
export function LoadMoreCase() {
  return <LoadMore onLoad={() => {}} auto={false} />
}
export function HiddenColumnsCase() {
  return <Table caption="Projects" rows={rows} columns={plain} hiddenColumns={['team']} />
}
export function PaletteCase() {
  const open = state(false)
  const ran = state('')
  return <><Button onClick={() => (open.value = true)}>Open</Button><CommandPalette open={open} commands={[{ id: 'new', label: 'New project', group: 'Create', run: () => (ran.value = 'new') }, { id: 'inv', label: 'Invite member', group: 'Create', keywords: ['teammate'], run: () => (ran.value = 'inv') }, { id: 'set', label: 'Settings', group: 'Go to', run: () => (ran.value = 'set') }]} /><output data-out="">{ran.value}</output></>
}
/** A row with children: "Move to…" opens a level of places. */
export function PaletteNested() {
  const open = state(false)
  const ran = state('')
  const places = () => ['Inbox', 'Archive', 'us-east', 'us-west'].map(p => ({ id: p, label: p, run: () => (ran.value = p) }))
  return <><Button onClick={() => (open.value = true)}>Open</Button><CommandPalette open={open} commands={[{ id: 'move', label: 'Move to…', group: 'Actions', children: places }, { id: 'set', label: 'Settings', group: 'Go to', run: () => (ran.value = 'set') }]} /><output data-out="">{ran.value}</output></>
}
export function MentionsCase() {
  const v = state('Ask @[Ada Lovelace](user:ada) ')
  return <><MentionsInput label="Comment" value={v} triggers={{ '@': search }} /><output data-out="">{v.value}</output></>
}
export function CodeCase() {
  const v = state('const a = 1\n')
  return <><CodeInput label="Script" language="ts" value={v} lineNumbers /><output data-out="">{v.value}</output></>
}
export function JsonCase() {
  const v = state('{ "a": 1 }')
  return <><JsonEditor label="Config" value={v} /><output data-out="">{v.value}</output></>
}
export function KeyValueCase() {
  const v = state<any[]>([{ key: 'REGION', value: 'eu' }])
  return <><KeyValueEditor label="Environment" value={v} /><output data-out="">{JSON.stringify(v.value)}</output></>
}
export function RteCase() {
  const v = state('<p>Hello <strong>world</strong></p>')
  return <><RichTextEditor label="Notes" value={v} mentions={{ search }} /><output data-out="">{v.value}</output></>
}
export function RteMarkdownCase() {
  return <RichTextEditor label="Notes" format="markdown" defaultValue="# Title" toolbar="bubble" />
}
export function MarkdownCase() {
  return <Markdown source={'# Hi\n\n**bold** and <script>x</script>'} />
}
export function MarkdownEditorCase() {
  const v = state('# Hi')
  return <><MarkdownEditor label="Body" value={v} /><output data-out="">{v.value}</output></>
}

// the redesign's new components: SSR + hydrate, 0 misses, 0 writes
export const AccordionCase = () => <Accordion defaultOpen={['a']} items={[{ value: 'a', title: 'One', content: 'first' }, { value: 'b', title: 'Two', content: 'second' }]} />
export const SliderCase = () => <Slider label="Volume" value={40} onChange={() => {}} />
export const RadioCase = () => <RadioGroup label="Plan" value="free" onChange={() => {}} options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]} />
export const TickerCase = () => <Ticker value={48120} format={{ style: 'currency', currency: 'USD' }} locale="en-US" />
export const MenuCase = () => <Menu label="Actions" items={[{ label: 'Rename' }, { separator: true }, { label: 'Delete', tone: 'critical' }]} />
