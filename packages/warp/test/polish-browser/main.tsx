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

const rows = [
  { id: 'a', name: 'Alpha', cost: 1 },
  { id: 'b', name: 'Beta', cost: 2 },
]
const columns = [
  { id: 'name', header: 'Name', sort: true },
  { id: 'cost', header: 'Cost', sort: true, numeric: true },
]
const WIDE = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, header: `Column ${i}` }))
const wideRows = [0, 1].map((r) => ({
  id: `r${r}`,
  ...Object.fromEntries(WIDE.map((c) => [c.id, `value ${r}-${c.id}`])),
}))
const BOARD = ['Backlog', 'Doing', 'In review', 'Done'].map((t, i) => ({
  id: `k${i}`,
  title: t,
  cards: [{ id: `k${i}c`, title: `Prorate seats on plan change ${i}` }],
}))
// Wednesday the 4th: five bookings in three rooms (some an hour, one half), and a full month around it
const ROOMS = [
  { id: 'atlas', name: 'Atlas', meta: '8 seats' },
  { id: 'birch', name: 'Birch', meta: '6 seats' },
  { id: 'cedar', name: 'Cedar', meta: '12 seats' },
]
const ev = ({
  id,
  title,
  day,
  s,
  e,
  resource,
  cal = 1,
}: {
  id: string
  title: string
  day: number
  s: string
  e: string
  resource?: string
  cal?: number
}) => ({
  id,
  title,
  start: `2026-11-${String(day).padStart(2, '0')}T${s}`,
  end: `2026-11-${String(day).padStart(2, '0')}T${e}`,
  resource,
  cal,
})
const EVENTS = [
  ev({ id: 'a', title: 'Design crit', day: 4, s: '09:00', e: '10:00', resource: 'atlas' }),
  ev({
    id: 'b',
    title: 'Billing walkthrough',
    day: 4,
    s: '11:00',
    e: '12:00',
    resource: 'birch',
    cal: 2,
  }),
  ev({
    id: 'c',
    title: 'Incident review: mobile-bff',
    day: 4,
    s: '10:30',
    e: '11:00',
    resource: 'cedar',
    cal: 3,
  }),
  ev({ id: 'd', title: 'Hiring sync', day: 4, s: '13:00', e: '14:30', resource: 'atlas' }),
  ev({ id: 'e', title: 'Roadmap', day: 4, s: '15:00', e: '16:30', resource: 'cedar' }),
  ...[2, 3, 4, 5, 6].flatMap((d) => [
    ev({ id: `s${d}`, title: 'Standup', day: d, s: '09:30', e: '09:45' }),
    ev({
      id: `x${d}`,
      title: 'Focus block',
      day: d,
      s: '14:00',
      e: '16:00',

      cal: 2,
    }),
    ev({
      id: `y${d}`,
      title: 'Review',
      day: d,
      s: '16:00',
      e: '17:00',

      cal: 3,
    }),
    ev({ id: `z${d}`, title: 'Wrap-up', day: d, s: '17:00', e: '17:30' }),
  ]),
  ev({ id: 'late', title: 'Quarter close', day: 27, s: '10:00', e: '11:00' }),
  ev({ id: 'last', title: 'Retro', day: 30, s: '15:00', e: '16:00' }),
  {
    id: 'oncall',
    title: 'Jun on call',
    start: '2026-11-02',
    end: '2026-11-04',
    allDay: true,
    cal: 2,
  },
  {
    id: 'rel',
    title: 'Release 2026.11 to every region',
    start: '2026-11-06',
    end: '2026-11-06',
    allDay: true,
    cal: 1,
  },
]
// a quiet month: every day has room for its events at two lines, and one long name runs from a weekend into a Monday
const ROOMY = [
  ev({ id: 'late', title: 'Quarter close', day: 27, s: '10:00', e: '11:00' }),
  ev({ id: 'last', title: 'Retro', day: 30, s: '15:00', e: '16:00' }),
  ev({ id: 'mon', title: 'Hiring sync', day: 9, s: '13:00', e: '14:00' }),
  {
    id: 'rel',
    title: 'Release 2026.11 to every region',
    start: '2026-11-07',
    end: '2026-11-09',
    allDay: true,
    cal: 1,
  },
]
const cal = (props: Partial<CalendarProps>) => (
  <Calendar
    events={EVENTS}
    resources={ROOMS}
    today="2026-11-02"
    now="2026-11-04T10:40"
    defaultDate="2026-11-04"
    locale="en-US"
    firstDayOfWeek={1}
    readOnly
    {...props}
  />
)
const HOOKS = [
  {
    id: 'h1',
    url: 'https://hooks.example-commerce.com/integrations/deploys/production-receiver?team=storefront&format=json',
    events: ['deploy.succeeded', 'deploy.failed'],
    healthy: true,
    lastDelivery: '2 minutes ago',
  },
  { id: 'h2', url: 'https://api.acme.dev/webhooks/weft', events: ['member.added'], healthy: false },
]
// a box is a container, as the shell or a pane is in an app: a table's breakpoints follow the nearest one
const box = (id: string, w: number, ui: unknown) => (
  <div id={id} style={`inline-size:${w}px;container-type:inline-size`}>
    {ui}
  </div>
)

function Toggles() {
  const on = [state(true), state(true), state(true)]
  return (
    <div id="toggles" style="display:flex;gap:16px;align-items:center;padding:8px">
      <Toggle size="sm" pressed={on[0]!.value} onClick={() => (on[0]!.value = !on[0]!.value)}>
        Bold
      </Toggle>
      <Toggle pressed={on[1]!.value} onClick={() => (on[1]!.value = !on[1]!.value)}>
        Bold
      </Toggle>
      <Toggle size="lg" pressed={on[2]!.value} onClick={() => (on[2]!.value = !on[2]!.value)}>
        Bold
      </Toggle>
    </div>
  )
}

function sortbarSample() {
  return box(
    'sortbar',
    342,
    <Table
      caption="Narrow"
      rows={rows}
      columns={columns}
      picker={false}
      sort={state({ id: 'cost', dir: 'ascending' as const })}
    />,
  )
}

function wideSample() {
  return box(
    'wide',
    420,
    <Table caption="Wide" rows={wideRows} columns={WIDE} picker={false} phone="columns" />,
  )
}

function rowsSample() {
  return box(
    'rows',
    420,
    <>
      <Textarea label="Notes" rows={5} />
      <Textarea label="Short" />
    </>,
  )
}

function tlPhoneSample() {
  return box(
    'tl-phone',
    326,
    cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }),
  )
}

function tlDeskSample() {
  return box(
    'tl-desk',
    598,
    cal({ views: ['timeline', 'day'], defaultView: 'timeline', timeline: [540, 1020] }),
  )
}

function rteBubbleSample() {
  return box(
    'rte-bubble',
    520,
    <RichTextEditor
      label="Release notes"
      toolbar="bubble"
      defaultValue="<p>Select some of this text to see the toolbar.</p>"
    />,
  )
}

function pagerWideSample() {
  return box(
    'pager-wide',
    760,
    <PaginationBar label="Projects" total={240} size={10} defaultPage={8} />,
  )
}

function pagerMidSample() {
  return box(
    'pager-mid',
    598,
    <PaginationBar label="Projects" total={240} size={10} defaultPage={8} />,
  )
}

function weekPhoneSample() {
  return box(
    'week-phone',
    358,
    cal({ views: ['week', 'day', 'month'], defaultView: 'week', workingHours: [540, 1080] }),
  )
}

function dayPhoneSample() {
  return box(
    'day-phone',
    358,
    cal({ views: ['day', 'week'], defaultView: 'day', workingHours: [540, 1080] }),
  )
}

function weekFreeSample() {
  return box(
    'week-free',
    900,
    cal({ views: ['week', 'day'], defaultView: 'week', workingHours: [540, 1080] }),
  )
}

function webhookSamples() {
  return [
    ['hooks-desk', 760],
    ['hooks-phone', 340],
  ].map(([id, w]) =>
    box(
      id as string,
      w as number,
      <Webhooks
        hooks={HOOKS}
        events={['deploy.succeeded']}
        onAdd={() => Promise.resolve('whsec_x')}
        onTest={() => Promise.resolve({ status: 200, ms: 1 })}
      />,
    ),
  )
}

render(
  () => (
    <>
      <Toggles />
      {sortbarSample()}
      {box('pager', 360, <PaginationBar total={200} size={25} />)}
      {wideSample()}
      {box('board', 600, <Kanban label="Board" columns={BOARD} height="240px" />)}
      <div id="solid" data-expression="vivid" style="padding:16px">
        <Button>Deploy now</Button>
      </div>
      <div id="solid-balanced" data-expression="balanced" style="padding:16px">
        <Button>Deploy now</Button>
      </div>
      <div id="code-vivid" data-expression="vivid" style="padding:16px;inline-size:480px">
        <CodeBlock code="import { Button } from '@weft-js/warp'" />
      </div>
      {rowsSample()}
      {tlPhoneSample()}
      {tlDeskSample()}
      <div id="month" style="inline-size:598px;block-size:616px">
        {cal({ views: ['month', 'agenda'], defaultView: 'month' })}
      </div>
      <div id="month-roomy" style="inline-size:598px;block-size:820px">
        {cal({ events: ROOMY, views: ['month', 'agenda'], defaultView: 'month' })}
      </div>
      <div id="bells" style="display:flex;gap:24px;padding:16px">
        {['compact', 'cozy', 'comfortable'].map((d) => (
          <div data-density={d} style="display:flex;gap:16px">
            <Bell count={3} />
            <Bell count={12} />
          </div>
        ))}
      </div>
      {webhookSamples()}
      <div id="inline-overlays" style="display:grid;gap:24px;inline-size:520px;padding:16px">
        <div id="in-modal">
          <Modal
            inline
            open={state(true)}
            size="sm"
            title="Rename project"
            footer={<Button data-close="">Save</Button>}
          >
            Everyone sees the new name.
          </Modal>
        </div>
        <div id="in-drawer" style="display:flex;justify-content:flex-end">
          <Drawer inline open={state(true)} side="right" title="Deploy d-4821">
            Rows
          </Drawer>
        </div>
        <div id="in-popover">
          <Popover
            inline
            label="What is a preview?"
            title="Preview deploys"
            description="Every branch gets its own address."
          />
        </div>
        <div id="in-tooltip">
          <Tooltip inline content="Runs on every region">
            <Button>Deploy everywhere</Button>
          </Tooltip>
        </div>
      </div>
      {rteBubbleSample()}
      {pagerWideSample()}
      {pagerMidSample()}
      {weekPhoneSample()}
      {dayPhoneSample()}
      {weekFreeSample()}
    </>
  ),
  document.getElementById('app')!,
)
