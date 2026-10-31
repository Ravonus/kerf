// What one component costs. Each component is built alone (a virtual entry that renders only it, production vite
// build with the weft plugin, minified) and measured brotli q11, JS and CSS apart. "runtime" is an entry that renders
// a plain <div> with weft alone; every row's JS is shown with and without it.
//
// Two page views follow, since what a component pulls in (the sweep machine, weft's spread helpers, Icon) is paid once
// per page, not per component: "×10" renders ten of it on one page (own JS, as above), and "marginal" is what it adds
// to a page that already renders every other component (the "all" row).
//
//   node scripts/size.mjs            table
//   node scripts/size.mjs --json     machine-readable
import { brotliCompressSync, constants } from 'node:zlib'
import { build } from 'vite'
import weft from 'weft/vite'

const br = text => brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

// name → JSX that renders it with its required props
export const ENTRIES = {
  runtime: ['', '<div />'],
  // the shared foundation every component pulls in once: warp.css (tokens, base, signature) and the components base
  foundation: ['./src/styles', '<div />'],
  Button: ['Button', '<Button>Save</Button>'],
  Toggle: ['Toggle', '<Toggle pressed={false}>Products</Toggle>'],
  Input: ['Input', '<Input label="Name" />'],
  Search: ['Search', '<Search label="Search" />'],
  Textarea: ['Textarea', '<Textarea label="Notes" />'],
  Select: ['Select', '<Select label="Sort" options={[{ value: "a", label: "A" }]} />'],
  Checkbox: ['Checkbox', '<Checkbox>Agree</Checkbox>'],
  Switch: ['Switch', '<Switch>Wi-Fi</Switch>'],
  Segmented: ['Segmented', '<Segmented label="View" value="a" options={[{ value: "a", label: "A" }]} />'],
  Tabs: ['Tabs', '<Tabs label="Sections" value="a" options={[{ value: "a", label: "A" }]}>{() => null}</Tabs>'],
  Card: ['Card', '<Card title="Revenue">x</Card>'],
  Badge: ['Badge', '<Badge>New</Badge>'],
  Stack: ['Stack', '<Stack gap="related">x</Stack>'],
  Row: ['Row', '<Row gap="tight">x</Row>'],
  Heading: ['Heading', '<Heading>x</Heading>'],
  Text: ['Text', '<Text>x</Text>'],
  Tag: ['Tag', '<Tag>tag</Tag>'],
  Chip: ['Chip', '<Chip>chip</Chip>'],
  Kbd: ['Kbd', '<Kbd>K</Kbd>'],
  Alert: ['Alert', '<Alert title="Heads up">x</Alert>'],
  Progress: ['Progress', '<Progress label="Upload" value={40} />'],
  Spinner: ['Spinner', '<Spinner label="Loading" />'],
  Skeleton: ['Skeleton', '<Skeleton />'],
  Shape: ['Shape', '<Shape kind="list" rows={3} />'],
  Tooltip: ['Tooltip', '<Tooltip content="Hint"><button>x</button></Tooltip>'],
  Popover: ['Popover', '<Popover label="Open">x</Popover>'],
  Modal: ['Modal', '<Modal open={open} title="T">x</Modal>'],
  Drawer: ['Drawer', '<Drawer open={open} title="T">x</Drawer>'],
  Toaster: ['Toaster', '<Toaster />'],
  Table: ['Table', '<Table caption="Projects" rows={[]} columns={[{ id: "name", header: "Name", sort: true }]} filter="Filter" selection page={{ size: 25 }} />'],
  LineChart: ['LineChart', '<LineChart title="Revenue" data={[{ m: "Jan", a: 1 }]} x="m" series={["a"]} />'],
  BarChart: ['BarChart', '<BarChart title="Seats" data={[{ m: "Jan", a: 1 }]} x="m" series={["a"]} />'],
  ComboChart: ['ComboChart', '<ComboChart title="Revenue" data={[{ m: "Jan", a: 1 }]} x="m" bar="a" />'],
  DonutChart: ['DonutChart', '<DonutChart title="Plans" data={[{ name: "A", value: 1 }]} />'],
  RadialChart: ['RadialChart', '<RadialChart title="Goals" data={[{ name: "A", value: 0.5 }]} />'],
  FunnelChart: ['FunnelChart', '<FunnelChart title="Funnel" data={[{ name: "A", value: 1 }]} />'],
  ScatterChart: ['ScatterChart', '<ScatterChart title="T" data={[]} xName="x" yName="y" />'],
  BubbleChart: ['BubbleChart', '<BubbleChart title="T" data={[]} xName="x" yName="y" />'],
  Histogram: ['Histogram', '<Histogram title="T" data={[1]} binWidth={1} />'],
  HeatGrid: ['HeatGrid', '<HeatGrid title="T" data={[[1]]} weeks={["W1"]} />'],
  RadarChart: ['RadarChart', '<RadarChart title="T" data={[]} axes={[]} />'],
  Treemap: ['Treemap', '<Treemap title="T" data={[{ name: "A", value: 1 }]} />'],
  Sunburst: ['Sunburst', '<Sunburst title="T" data={[]} />'],
  SankeyChart: ['SankeyChart', '<SankeyChart title="T" data={[]} nodes={[]} />'],
  CandlestickChart: ['CandlestickChart', '<CandlestickChart title="T" data={[]} />'],
  BoxPlot: ['BoxPlot', '<BoxPlot title="T" data={[]} />'],
  WaterfallChart: ['WaterfallChart', '<WaterfallChart title="T" data={[]} />'],
  StreamChart: ['StreamChart', '<StreamChart title="T" data={[1]} domain={[0, 1]} />'],
  BrushChart: ['BrushChart', '<BrushChart title="T" data={[]} x="a" y="b" domain={[0, 1]} />'],
  TileMap: ['TileMap', '<TileMap title="T" data={[]} />'],
  GaugeChart: ['GaugeChart', '<GaugeChart title="T" data={0.5} />'],
  Sparkline: ['Sparkline', '<Sparkline values={[1, 2]} />'],
  Shell: ['Shell', '<Shell brand={{ name: "Loom" }} title="Orders" nav={[{ items: [{ id: "a", label: "A", href: "/" }] }]} account={{ name: "A", initials: "A" }}>x</Shell>'],
  DateField: ['DateField', '<DateField label="Due" />'],
  DateRangeField: ['DateRangeField', '<DateRangeField label="Period" />'],
  TimeField: ['TimeField', '<TimeField label="Start" />'],
  DateTimeField: ['DateTimeField', '<DateTimeField label="Kickoff" />'],
  InlineCalendar: ['InlineCalendar', '<InlineCalendar aria-label="Days" />'],
  MonthPicker: ['MonthPicker', '<MonthPicker label="Month" />'],
  WeekPicker: ['WeekPicker', '<WeekPicker label="Week" />'],
  PeriodPicker: ['PeriodPicker', '<PeriodPicker label="Period" />'],
  TimeZoneSelect: ['TimeZoneSelect', '<TimeZoneSelect label="Zone" />'],
  CountrySelect: ['CountrySelect', '<CountrySelect label="Country" />'],
  LanguageSelect: ['LanguageSelect', '<LanguageSelect label="Language" />'],
  CurrencySelect: ['CurrencySelect', '<CurrencySelect label="Currency" />'],
  PhoneField: ['PhoneField', '<PhoneField label="Phone" />'],
  DurationField: ['DurationField', '<DurationField label="Estimate" />'],
  RecurrenceField: ['RecurrenceField', '<RecurrenceField label="Repeats" dtstart="2026-10-28" />'],
  PlaceLookupInput: ['PlaceLookupInput', '<PlaceLookupInput label="Place" search={async () => []} />'],
  AddressField: ['AddressField', '<AddressField />'],
  PaymentCardInput: ['PaymentCardInput', '<PaymentCardInput label="Card" mount={() => ({ on() {}, destroy() {} })} />'],
  CardNumberText: ['CardNumberText', '<CardNumberText last4="4242" />'],
  SignaturePad: ['SignaturePad', '<SignaturePad label="Signature" />'],
  DataGrid: ['DataGrid', '<DataGrid caption="Projects" rows={[]} columns={[{ id: "name", header: "Name", sort: true, edit: true }]} />'],
  PivotTable: ['PivotTable', '<PivotTable caption="Cost" rows={[]} row={r => r.a} column={r => r.b} measures={[]} />'],
  PaginationBar: ['PaginationBar', '<PaginationBar total={100} size={10} />'],
  LoadMore: ['LoadMore', '<LoadMore onLoad={() => {}} />'],
  CommandPalette: ['CommandPalette', '<CommandPalette open={open} commands={[{ label: "New" }]} />'],
  MentionsInput: ['MentionsInput', '<MentionsInput label="Comment" triggers={{ "@": async () => [] }} />'],
  CodeInput: ['CodeInput', '<CodeInput label="Script" />'],
  JsonEditor: ['JsonEditor', '<JsonEditor label="Config" />'],
  KeyValueEditor: ['KeyValueEditor', '<KeyValueEditor label="Environment" />'],
  RichTextEditor: ['RichTextEditor', '<RichTextEditor label="Notes" />'],
  Markdown: ['Markdown', '<Markdown source="# Hi" />'],
  MarkdownEditor: ['MarkdownEditor', '<MarkdownEditor label="Body" />'],
}

async function measure(name, [imp, jsx]) {
  const id = '\0size-entry.tsx'
  const imps = imp.split(',').filter(Boolean).map(i => (i.startsWith('.') ? `import '${i}'\n` : `import { ${i} } from '@weft/warp'\n`)).join('')
  const code = `import { render } from 'weft/dom'\nimport { state } from 'weft'\n${imps}const open = state(false)\nrender(() => ${jsx}, document.body)\n`
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    root: new URL('..', import.meta.url).pathname,
    plugins: [weft(), { name: 'entry', resolveId: s => (s === 'size-entry.tsx' ? id : null), load: i => (i === id ? code : null) }],
    build: { write: false, cssCodeSplit: false, modulePreload: false, rolldownOptions: { input: 'size-entry.tsx' } },
  })
  const files = (Array.isArray(out) ? out : [out]).flatMap(o => o.output)
  const js = files.filter(f => f.type === 'chunk').map(f => f.code).join('\n')
  const css = files.filter(f => f.fileName.endsWith('.css')).map(f => String(f.source)).join('\n')
  return { name, js: br(js), css: css ? br(css) : 0 }
}

const COMPONENTS = Object.keys(ENTRIES).filter(n => n !== 'runtime' && n !== 'foundation')
// one page with every component but `skip`
const page = skip => {
  const on = COMPONENTS.filter(n => n !== skip)
  return [on.map(n => ENTRIES[n][0]).join(','), `<>${on.map(n => ENTRIES[n][1]).join('')}</>`]
}

export async function sizes(names = Object.keys(ENTRIES)) {
  const rows = []
  for (const n of names) rows.push(await measure(n, ENTRIES[n]))
  return rows
}

/** ×10 on one page, and the marginal cost on a page holding everything else (both JS br). */
export async function pageSizes(names = COMPONENTS) {
  const all = await measure('all', page())
  const rows = []
  for (const n of names) {
    const [imp, jsx] = ENTRIES[n]
    const ten = await measure(n, [imp, `<>${jsx.repeat(10)}</>`])
    const without = await measure(n, page(n))
    rows.push({ name: n, ten: ten.js, marginal: all.js - without.js })
  }
  return { all, rows }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rows = await sizes()
  const { all, rows: pages } = await pageSizes()
  const base = rows.find(r => r.name === 'runtime')
  if (process.argv.includes('--json')) console.log(JSON.stringify({ rows, all, pages }, null, 1))
  else {
    const found = rows.find(r => r.name === 'foundation')
    const p = Object.fromEntries(pages.map(r => [r.name, r]))
    console.log('| component | JS br (with runtime) | JS br (own) | ×10 on one page (own) | marginal on the full page | CSS br (with foundation) | CSS br (own) |\n|---|---|---|---|---|---|---|')
    for (const r of rows) {
      const own = r.name === 'runtime' ? '—' : r.js - base.js
      console.log(`| ${r.name} | ${r.js} | ${own} | ${p[r.name] ? p[r.name].ten - base.js : '—'} | ${p[r.name]?.marginal ?? '—'} | ${r.css} | ${r.name === 'runtime' || r.name === 'foundation' ? '—' : r.css - found.css} |`)
    }
    console.log(`| all ${COMPONENTS.length} on one page | ${all.js} | ${all.js - base.js} | — | — | ${all.css} | ${all.css - found.css} |`)
  }
}
