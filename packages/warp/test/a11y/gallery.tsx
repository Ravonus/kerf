// Every warp component on one page for the a11y suite (scripts/a11y.mjs): fixtures/Variants.tsx's branches, plus the
// three components it doesn't render. `?part=` picks what is mounted, since an open modal makes the rest inert:
// static (everything in flow), overlays (Variants' open Modal and Drawer, a closed Popover), toasts, charts, rich (the rich inputs).
import { render } from 'weft/dom'
import * as Rich from '../fixtures/Rich'
import { Button } from '../../src/Button'
import { Kbd } from '../../src/Kbd'
import { Spinner } from '../../src/Spinner'
import { Tooltip } from '../../src/Tooltip'
import * as Charts from '../fixtures/ChartCases'
import { Dashboard, Tables } from '../fixtures/Data'
import { Alerts, Buttons, Choices, Fields, Icons, Overlays, Surfaces, Tabbed, Toasts, Toggles, seedToasts } from '../fixtures/Variants'
// after the components: the first import fixes the order of warp's CSS layers
import '@weft/ui-core/styles/data/panel.css'

function Static() {
  return (
    <>
      <h1>warp gallery</h1>
      <Buttons />
      {/* Buttons' submit passes aria-controls="x" through: give it its target */}
      <p id="x">Submit controls this.</p>
      <Icons />
      <Toggles />
      <Fields />
      <Choices />
      <Surfaces />
      <Alerts />
      <Tabbed />
      <p>Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search.</p>
      <Spinner label="Loading" />
      <Spinner />
      <Tooltip content="Copy the link" kbd="C"><Button emphasis="outline">Copy</Button></Tooltip>
    </>
  )
}

const CHARTS = Object.entries(Charts).filter(([n]) => !n.endsWith('$shape')).map(([n, draw]) => ({ n, draw }))
const Gallery = () => (
  <>
    <h1>warp charts</h1>
    <h2>Every form</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:16px">
      {CHARTS.map(c => <div key={c.n} data-scope="panel">{c.draw()}</div>)}
    </div>
  </>
)

function RichInputs() {
  return (
    <>
      <h1>warp rich inputs</h1>
      <Rich.DateFieldCase /><Rich.RangeFieldCase /><Rich.TimeFieldCase /><Rich.DateTimeFieldCase /><Rich.CalendarCase />
      <Rich.MonthCase /><Rich.WeekCase /><Rich.PeriodCase /><Rich.ZoneCase /><Rich.CountryCase /><Rich.LanguageCase /><Rich.CurrencyCase />
      <Rich.PhoneCase /><Rich.DurationCase /><Rich.RecurrenceCase /><Rich.CustomRuleCase />
      <Rich.PlaceCase /><Rich.AddressCase /><Rich.CardCase /><Rich.SignatureCase />
    </>
  )
}

const part = new URLSearchParams(location.search).get('part') ?? 'static'
if (part === 'toasts') seedToasts()
const View = part === 'charts' ? Gallery : part === 'rich' ? RichInputs : part === 'table' ? () => <><h1>warp tables</h1><Tables /></> : part === 'shell' ? Dashboard : part === 'overlays' ? () => <><h1>warp overlays</h1><Overlays /></> : part === 'toasts' ? () => <><h1>warp toasts</h1><Toasts /></> : Static
// the shell brings its own main
const host = document.getElementById('root')!
if (part === 'shell') host.replaceWith(Object.assign(document.createElement('div'), { id: 'root' }))
render(() => <View />, document.getElementById('root')!)
