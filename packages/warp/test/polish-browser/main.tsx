import { render } from 'weft/dom'
import { state } from 'weft'
import { Button } from '../../src/Button'
import { PaginationBar } from '../../src/Pagination'
import { Table } from '../../src/Table'
import { Toggle } from '../../src/Toggle'
import { Kanban } from '../../src/collab/Kanban'
import { Calendar } from '../../src/schedule/Calendar'

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
]
const cal = (props: any) => <Calendar events={EVENTS} resources={ROOMS} today="2026-11-02" now="2026-11-04T10:40" defaultDate="2026-11-04" locale="en-US" firstDayOfWeek={1} readOnly {...props} />
const box = (id: string, w: number, ui: any) => <div id={id} style={`inline-size:${w}px`}>{ui}</div>

function Toggles() {
  const on = [state(true), state(true), state(true)]
  return (
    <div id="toggles" style="display:flex;gap:16px;align-items:center;padding:8px">
      <Toggle size="sm" pressed={on[0].value} onClick={() => (on[0].value = !on[0].value)}>Bold</Toggle>
      <Toggle pressed={on[1].value} onClick={() => (on[1].value = !on[1].value)}>Bold</Toggle>
      <Toggle size="lg" pressed={on[2].value} onClick={() => (on[2].value = !on[2].value)}>Bold</Toggle>
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
    {box('tl-phone', 326, cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }))}
    {box('tl-desk', 598, cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }))}
    <div id="month" style="inline-size:598px;block-size:616px">{cal({ views: ['month', 'agenda'], defaultView: 'month' })}</div>
    {box('week-free', 900, cal({ views: ['week', 'day'], defaultView: 'week', workingHours: [540, 1080] }))}
  </>
), document.getElementById('app')!)
