// Every veneer component on one page for the a11y suite (scripts/a11y.mjs): fixtures/Variants.tsx's branches, plus the
// three components it doesn't render. `?part=` picks what is mounted, since an open modal makes the rest inert:
// static (everything in flow), overlays (Variants' open Modal and Drawer, a closed Popover), toasts, charts, rich (the rich inputs), virtual.
import { render } from '@kerf/core/dom'
import * as Rest from '../fixtures/Surfaces'
import * as Rich from '../fixtures/Rich'
import { Accordion } from '../../src/Accordion'
import { Button } from '../../src/Button'
import { Canvas } from '../../src/Canvas'
import { RadioGroup } from '../../src/Choice'
import { DateField } from '../../src/DateField'
import { Dither, DitherField, DitherGlyph } from '../../src/Dither'
import { Menu } from '../../src/Menu'
import { MonthPicker } from '../../src/MonthPicker'
import { Select } from '../../src/Select'
import { SideNav } from '../../src/SideNav'
import { Slider } from '../../src/Slider'
import { Ticker } from '../../src/Ticker'
import { Kbd } from '../../src/Kbd'
import { Stack } from '../../src/Layout'
import { Heading, Text } from '../../src/Type'
import { Spinner } from '../../src/Spinner'
import { Tooltip } from '../../src/Tooltip'
import { Part as Agent } from '../fixtures/pack-agent'
import { Part as Schedule } from '../fixtures/pack-schedule'
import { Part as Live } from '../fixtures/pack-live'
import { Part as Collab } from '../fixtures/pack-collab'
import { Part as Flow } from '../fixtures/pack-flow'
import { Part as Admin } from '../fixtures/pack-admin'
import * as Charts from '../fixtures/ChartCases'
import { Dashboard, Tables } from '../fixtures/Data'
import { Virtuals } from '../fixtures/Virtual'
import {
  Alerts,
  Buttons,
  Choices,
  Fields,
  Icons,
  Overlays,
  Surfaces,
  Tabbed,
  Toasts,
  Toggles,
  seedToasts,
} from '../fixtures/Variants'
// after the components: the first import fixes the order of veneer's CSS layers
import '@kerf/veneer-core/styles/data/panel.css'

// The redesign's components and the canvas pack. Menu's and Select's open states are audited from a11y.mjs.
function Added() {
  return (
    <>
      <h1>veneer, added</h1>
      <Stack gap="group">
        <Menu
          label="Actions"
          items={[
            { group: 'Project' },
            { label: 'Rename', icon: 'pencil', shortcut: '⌘R' },
            { label: 'Archived', disabled: true },
            { separator: true },
            { label: 'Delete', tone: 'critical', icon: 'x' },
          ]}
        />
        <Select
          label="Sort by"
          options={[
            { value: 'new', label: 'Newest' },
            { value: 'old', label: 'Oldest' },
            { group: 'More', options: [{ value: 'az', label: 'A to Z' }] },
          ]}
        />
        <Accordion
          level={2}
          defaultOpen={['a']}
          items={[
            { value: 'a', title: 'General', content: 'Workspace name and default branch.' },
            { value: 'b', title: 'Security', content: 'Require two-factor sign-in.' },
          ]}
        />
        <RadioGroup
          label="Plan"
          value="pro"
          onChange={() => {}}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro', hint: 'Most teams.' },
          ]}
        />
        <Slider label="Volume" value={40} onChange={() => {}} format={(v) => `${v}%`} />
        <Slider label="Price" value={[10, 80]} onChange={() => {}} names={['Minimum', 'Maximum']} />
        <span style="font-size:32px">
          <Ticker value={48120} format={{ style: 'currency', currency: 'USD' }} locale="en-US" />
        </span>
        <DitherField label="A moving field" ratio={4}>
          <Heading level={2}>Over the field</Heading>
        </DitherField>
        <DitherField ratio={8} />
        <Dither label="A dithered gradient" ratio={4} />
        <DitherGlyph text="veneer" />
        <SideNav
          label="Guides"
          filter
          current="/guides/state"
          remember={false}
          sections={[
            { title: 'Start', pinned: true, items: [{ href: '/guides', label: 'Overview' }] },
            {
              title: 'Basics',
              items: [
                { href: '/guides/state', label: 'State' },
                { href: '/guides/props', label: 'Props' },
              ],
            },
            { title: 'More', items: [{ href: '/guides/effects', label: 'Effects' }] },
          ]}
        />
        <Canvas
          label="A drawing"
          draw={({ ctx }) => {
            ctx.fillRect(0, 0, 8, 8)
          }}
          style="block-size:40px"
        />
      </Stack>
    </>
  )
}

function Static() {
  return (
    <>
      <h1>veneer gallery</h1>
      <Buttons />
      {/* Buttons' submit passes aria-controls="x" through: give it its target */}
      <p id="x">Submit controls this.</p>
      <Stack gap="related">
        <Heading level={2} role="title">
          Title
        </Heading>
        <Text role="caption" subtle>
          Caption
        </Text>
        <Text tone="critical">Critical</Text>
        <Text role="code" faint>
          code
        </Text>
      </Stack>
      <Icons />
      <Toggles />
      <Fields />
      <Choices />
      <Surfaces />
      <Alerts />
      <Tabbed />
      <p>
        Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search.
      </p>
      <Spinner label="Loading" />
      <Spinner />
      <Tooltip content="Copy the link" kbd="C">
        <Button emphasis="outline">Copy</Button>
      </Tooltip>
    </>
  )
}

const CHARTS = Object.entries(Charts)
  .filter(([n]) => !n.endsWith('$shape'))
  .map(([n, draw]) => ({ n, draw }))
const Gallery = () => (
  <>
    <h1>veneer charts</h1>
    <h2>Every form</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:16px">
      {CHARTS.map((c) => (
        <div key={c.n} data-scope="panel">
          {c.draw()}
        </div>
      ))}
    </div>
  </>
)

function Remaining() {
  return (
    <>
      <h1>veneer grids and editors</h1>
      <Rest.GridCase />
      <Rest.GridGroupedCase />
      <Rest.TreeGridCase />
      <Rest.PivotCase />
      <Rest.PagesCase />
      <Rest.CursorCase />
      <Rest.LoadMoreCase />
      <Rest.HiddenColumnsCase />
      <Rest.PaletteCase />
      <Rest.MentionsCase />
      <Rest.CodeCase />
      <Rest.JsonCase />
      <Rest.KeyValueCase />
      <Rest.RteCase />
      <Rest.MarkdownCase />
      <Rest.MarkdownEditorCase />
    </>
  )
}

function RichInputs() {
  return (
    <>
      <h1>veneer rich inputs</h1>
      <Rich.DateFieldCase />
      <DateField label="Required date" required locale="en-US" today="2026-01-15" />
      <MonthPicker label="Required month" required locale="en-US" today="2026-01-15" />
      <Rich.RangeFieldCase />
      <Rich.TimeFieldCase />
      <Rich.DateTimeFieldCase />
      <Rich.CalendarCase />
      <Rich.MonthCase />
      <Rich.WeekCase />
      <Rich.PeriodCase />
      <Rich.ZoneCase />
      <Rich.CountryCase />
      <Rich.LanguageCase />
      <Rich.CurrencyCase />
      <Rich.PhoneCase />
      <Rich.DurationCase />
      <Rich.RecurrenceCase />
      <Rich.CustomRuleCase />
      <Rich.PlaceCase />
      <Rich.AddressCase />
      <Rich.CardCase />
      <Rich.SignatureCase />
    </>
  )
}

const part = new URLSearchParams(location.search).get('part') ?? 'static'
if (part === 'toasts') seedToasts()
const PACKS: Record<string, () => unknown> = {
  added: Added,
  agent: Agent,
  schedule: Schedule,
  live: Live,
  collab: Collab,
  flow: Flow,
  admin: Admin,
}
const View = PACKS[part]
  ? PACKS[part]
  : part === 'virtual'
    ? Virtuals
    : part === 'surfaces'
      ? Remaining
      : part === 'charts'
        ? Gallery
        : part === 'rich'
          ? RichInputs
          : part === 'table'
            ? () => (
                <>
                  <h1>veneer tables</h1>
                  <Tables />
                </>
              )
            : part === 'shell'
              ? Dashboard
              : part === 'overlays'
                ? () => (
                    <>
                      <h1>veneer overlays</h1>
                      <Overlays />
                    </>
                  )
                : part === 'toasts'
                  ? () => (
                      <>
                        <h1>veneer toasts</h1>
                        <Toasts />
                      </>
                    )
                  : Static
// the shell brings its own main
const host = document.getElementById('root')!
if (part === 'shell') host.replaceWith(Object.assign(document.createElement('div'), { id: 'root' }))
render(() => <View />, document.getElementById('root')!)
