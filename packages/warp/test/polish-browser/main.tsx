import { render } from '@weft-js/core/dom'
import { state } from '@weft-js/core'
import { Button } from '../../src/Button'
import { PaginationBar } from '../../src/Pagination'
import { Table } from '../../src/Table'
import { Toggle } from '../../src/Toggle'
import { Textarea } from '../../src/Field'
import { CodeBlock } from '../../src/CodeBlock'
import { Kanban } from '../../src/collab/Kanban'
import { Calendar, type CalendarProps } from '../../src/schedule/Calendar'
import { Bell } from '../../src/live/Bell'
import { Webhooks } from '../../src/admin/Integrations'
import { Modal } from '../../src/Modal'
import { Drawer } from '../../src/Drawer'
import { Popover } from '../../src/Popover'
import { Tooltip } from '../../src/Tooltip'
import { RichTextEditor } from '../../src/RichTextEditor'

const rows = [{ id: 'a', name: 'Alpha', cost: 1 }, { id: 'b', name: 'Beta', cost: 2 }]
const columns = [{ id: 'name', header: 'Name', sort: true }, { id: 'cost', header: 'Cost', sort: true, numeric: true }]
const WIDE = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, header: `Column ${i}` }))
const wideRows = [0, 1].map(r => ({ id: `r${r}`, ...Object.fromEntries(WIDE.map(c => [c.id, `value ${r}-${c.id}`])) }))
const BOARD = ['Backlog', 'Doing', 'In review', 'Done'].map((t, i) => ({ id: `k${i}`, title: t, cards: [{ id: `k${i}c`, title: `Prorate seats on plan change ${i}` }] }))
// Wednesday the 4th: five bookings in three rooms (some an hour, one half), and a full month around it
const ROOMS = [{ id: 'atlas', name: 'Atlas', meta: '8 seats' }, { id: 'birch', name: 'Birch', meta: '6 seats' }, { id: 'cedar', name: 'Cedar', meta: '12 seats' }]
const ev = (id: string, title: string, day: number, s: string, e: string, resource?: string, cal = 1) => ({ id, title, start: `2026-11-${String(day).padStart(2, '0')}T${s}`, end: `2026-11-${String(day).padStart(2, '0')}T${e}`, resource, cal })
const EVENTS = [
  ev('a', 'Design crit', 4, '09:00', '10:00', 'atlas'), ev('b', 'Billing walkthrough', 4, '11:00', '12:00', 'birch', 2),
  ev('c', 'Incident review: mobile-bff', 4, '10:30', '11:00', 'cedar', 3), ev('d', 'Hiring sync', 4, '13:00', '14:30', 'atlas'),
  ev('e', 'Roadmap', 4, '15:00', '16:30', 'cedar'),
  ...[2, 3, 4, 5, 6].flatMap(d => [ev(`s${d}`, 'Standup', d, '09:30', '09:45'), ev(`x${d}`, 'Focus block', d, '14:00', '16:00', undefined, 2), ev(`y${d}`, 'Review', d, '16:00', '17:00', undefined, 3), ev(`z${d}`, 'Wrap-up', d, '17:00', '17:30')]),
  ev('late', 'Quarter close', 27, '10:00', '11:00'), ev('last', 'Retro', 30, '15:00', '16:00'),
  { id: 'oncall', title: 'Jun on call', start: '2026-11-02', end: '2026-11-04', allDay: true, cal: 2 },
  { id: 'rel', title: 'Release 2026.11 to every region', start: '2026-11-06', end: '2026-11-06', allDay: true, cal: 1 },
]
// a quiet month: every day has room for its events at two lines, and one long name runs from a weekend into a Monday
const ROOMY = [
  ev('late', 'Quarter close', 27, '10:00', '11:00'), ev('last', 'Retro', 30, '15:00', '16:00'), ev('mon', 'Hiring sync', 9, '13:00', '14:00'),
  { id: 'rel', title: 'Release 2026.11 to every region', start: '2026-11-07', end: '2026-11-09', allDay: true, cal: 1 },
]
const cal = (props: Partial<CalendarProps>) => <Calendar events={EVENTS} resources={ROOMS} today="2026-11-02" now="2026-11-04T10:40" defaultDate="2026-11-04" locale="en-US" firstDayOfWeek={1} readOnly {...props} />
const HOOKS = [
  { id: 'h1', url: 'https://hooks.example-commerce.com/integrations/deploys/production-receiver?team=storefront&format=json', events: ['deploy.succeeded', 'deploy.failed'], healthy: true, lastDelivery: '2 minutes ago' },
  { id: 'h2', url: 'https://api.acme.dev/webhooks/weft', events: ['member.added'], healthy: false },
]
// a box is a container, as the shell or a pane is in an app: a table's breakpoints follow the nearest one
const box = (id: string, w: number, ui: unknown) => <div id={id} style={`inline-size:${w}px;container-type:inline-size`}>{ui}</div>

function Toggles() {
  const on = [state(true), state(true), state(true)]
  return (
    <div id="toggles" style="display:flex;gap:16px;align-items:center;padding:8px">
      <Toggle size="sm" pressed={on[0]!.value} onClick={() => (on[0]!.value = !on[0]!.value)}>Bold</Toggle>
      <Toggle pressed={on[1]!.value} onClick={() => (on[1]!.value = !on[1]!.value)}>Bold</Toggle>
      <Toggle size="lg" pressed={on[2]!.value} onClick={() => (on[2]!.value = !on[2]!.value)}>Bold</Toggle>
    </div>
  )
}

render(() => (
  <>
    <Toggles />
    {box('sortbar', 342, <Table caption="Narrow" rows={rows} columns={columns} picker={false} sort={state({ id: 'cost', dir: 'ascending' as const })} />)}
    {box('pager', 360, <PaginationBar total={200} size={25} />)}
    {box('wide', 420, <Table caption="Wide" rows={wideRows} columns={WIDE} picker={false} phone="columns" />)}
    {box('board', 600, <Kanban label="Board" columns={BOARD} height="240px" />)}
    <div id="solid" data-expression="vivid" style="padding:16px"><Button>Deploy now</Button></div>
    <div id="solid-balanced" data-expression="balanced" style="padding:16px"><Button>Deploy now</Button></div>
    <div id="code-vivid" data-expression="vivid" style="padding:16px;inline-size:480px"><CodeBlock code="import { Button } from '@weft-js/warp'" /></div>
    {box('rows', 420, <><Textarea label="Notes" rows={5} /><Textarea label="Short" /></>)}
    {box('tl-phone', 326, cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }))}
    {box('tl-desk', 598, cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }))}
    <div id="month" style="inline-size:598px;block-size:616px">{cal({ views: ['month', 'agenda'], defaultView: 'month' })}</div>
    <div id="month-roomy" style="inline-size:598px;block-size:820px">{cal({ events: ROOMY, views: ['month', 'agenda'], defaultView: 'month' })}</div>
    <div id="bells" style="display:flex;gap:24px;padding:16px">
      {['compact', 'cozy', 'comfortable'].map(d => <div data-density={d} style="display:flex;gap:16px"><Bell count={3} /><Bell count={12} /></div>)}
    </div>
    {[['hooks-desk', 760], ['hooks-phone', 340]].map(([id, w]) => box(id as string, w as number, <Webhooks hooks={HOOKS} events={['deploy.succeeded']} onAdd={() => Promise.resolve('whsec_x')} onTest={() => Promise.resolve({ status: 200, ms: 1 })} />))}
    <div id="inline-overlays" style="display:grid;gap:24px;inline-size:520px;padding:16px">
      <div id="in-modal"><Modal inline open={state(true)} size="sm" title="Rename project" footer={<Button data-close="">Save</Button>}>Everyone sees the new name.</Modal></div>
      <div id="in-drawer" style="display:flex;justify-content:flex-end"><Drawer inline open={state(true)} side="right" title="Deploy d-4821">Rows</Drawer></div>
      <div id="in-popover"><Popover inline label="What is a preview?" title="Preview deploys" description="Every branch gets its own address." /></div>
      <div id="in-tooltip"><Tooltip inline content="Runs on every region"><Button>Deploy everywhere</Button></Tooltip></div>
    </div>
    {box('rte-bubble', 520, <RichTextEditor label="Release notes" toolbar="bubble" defaultValue="<p>Select some of this text to see the toolbar.</p>" />)}
    {box('pager-wide', 760, <PaginationBar label="Projects" total={240} size={10} defaultPage={8} />)}
    {box('pager-mid', 598, <PaginationBar label="Projects" total={240} size={10} defaultPage={8} />)}
    {box('week-phone', 358, cal({ views: ['week', 'day', 'month'], defaultView: 'week', workingHours: [540, 1080] }))}
    {box('day-phone', 358, cal({ views: ['day', 'week'], defaultView: 'day', workingHours: [540, 1080] }))}
    {box('week-free', 900, cal({ views: ['week', 'day'], defaultView: 'week', workingHours: [540, 1080] }))}
  </>
), document.getElementById('app')!)
