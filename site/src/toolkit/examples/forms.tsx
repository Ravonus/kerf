import { derived, state, untrack } from 'weft'
import { Button, Checkbox, CompactSelect, Field, Grid, Input, Radio, RadioGroup, Row, Search, Segmented, Select, Slider, Stack, Switch, Text, Textarea, Toaster, toast } from '@weft/warp'
import { DEPLOYS, PEOPLE, PROJECTS, REGIONS } from '../world'

/** One state in a States grid: its name, then the field. */
const Cell = (p: { name: string; children?: any }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>{p.name}</Text>
    {p.children}
  </Stack>
)

const SLUG = /^[a-z0-9-]+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REGION_OPTIONS = REGIONS.map(r => ({ value: r.region, label: r.region }))
const PROJECT_OPTIONS = PROJECTS.map(p => ({ value: p.id, label: p.name, hint: p.owner }))
const ROLE_OPTIONS = [
  { value: 'Admin', label: 'Admin', hint: 'Manages people and billing' },
  { value: 'Member', label: 'Member', hint: 'Deploys and edits projects' },
  { value: 'Viewer', label: 'Viewer', hint: 'Reads logs and metrics' },
]
const TARGET_OPTIONS = [
  { group: 'Production', options: [{ value: 'eu-west', label: 'eu-west' }, { value: 'us-east', label: 'us-east' }] },
  { group: 'Preview', options: [{ value: 'staging', label: 'staging' }, { value: 'canary', label: 'canary' }, { value: 'qa', label: 'qa', disabled: true }] },
]

/* ---- Input ---- */

export const InputPlay = (p: any) => <Input {...p} hint={p.hint || undefined} />

export const InputVariants = () => (
  <Grid cols={3} gap="group">
    <Input label="Project name" defaultValue="storefront" />
    <Input label="Project name" defaultValue="storefront" variant="classic" />
    <Input label="Project name" defaultValue="storefront" appearance="line" />
  </Grid>
)

export const InputSizes = () => (
  <Stack gap="group">
    <Input label="Project name" size="sm" />
    <Input label="Project name" />
    <Input label="Project name" size="lg" />
  </Stack>
)

export const InputTypes = () => (
  <Stack gap="group">
    <Input label="Work email" type="email" autocomplete="email" icon="mail" />
    <Input label="Password" type="password" autocomplete="new-password" icon="lock" />
    <Input label="Repository" type="url" placeholder="https://github.com/tessel/storefront" icon="link" />
  </Stack>
)

export const InputAffixes = () => (
  <Stack gap="group">
    <Input label="Domain" prefix="https://" suffix=".tessel.dev" defaultValue="storefront" />
    <Input label="Monthly budget" prefix="€" suffix="per month" inputmode="numeric" defaultValue="1,240" />
  </Stack>
)

export const InputClearableCounter = () => (
  <Stack gap="group">
    <Input label="Branch" clearable defaultValue="ranking-v2" />
    <Input label="Commit message" counter={72} defaultValue="Rank exact matches first" />
  </Stack>
)

export const InputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><Input label="Project name" /></Cell>
    <Cell name="Filled"><Input label="Project name" defaultValue="storefront" /></Cell>
    <Cell name="Hint"><Input label="Project name" hint="Lowercase letters and dashes." /></Cell>
    <Cell name="Invalid"><Input label="Project name" defaultValue="Store Front" error="Use lowercase letters and dashes." /></Cell>
    <Cell name="Disabled"><Input label="Project name" defaultValue="storefront" disabled /></Cell>
    <Cell name="Read-only"><Input label="Project name" defaultValue="storefront" readonly /></Cell>
  </Grid>
)

export function InputSlug() {
  const name = state('Store Front')
  const slug = derived(() => name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  return (
    <Stack gap="related">
      <Input label="Project name" value={name.value} onInput={e => (name.value = e.currentTarget.value)} error={slug.value ? undefined : 'Give it a name with at least one letter.'} />
      <Text subtle>{slug.value ? `Lives at ${slug.value}.tessel.dev` : 'Waiting for a name'}</Text>
    </Stack>
  )
}

export function FormProjectSettings() {
  const name = state('storefront')
  const about = state('The public shop, served from the edge.')
  const region = state<string | null>('eu-west')
  const copies = state(3)
  const onPush = state(true)
  const problem = derived(() => (SLUG.test(name.value) ? undefined : 'Use lowercase letters, numbers and dashes.'))
  const save = (e: Event) => {
    e.preventDefault()
    if (!problem.value) toast.show({ title: 'Settings saved', description: `${name.value} runs ${copies.value} copies in ${region.value}.` })
  }
  return (
    <>
      <Stack as="form" gap="group" onSubmit={save}>
        <Text role="heading">Project settings</Text>
        <Grid cols={2} gap="group">
          <Input label="Project name" value={name.value} error={problem.value} onInput={e => (name.value = e.currentTarget.value)} />
          <Select label="Region" options={REGION_OPTIONS} value={region} hint="Moving a project redeploys it." />
        </Grid>
        <Textarea label="Description" value={about.value} counter={120} onInput={e => (about.value = e.currentTarget.value)} />
        <Slider label="Copies" value={copies.value} min={1} max={8} onChange={v => (copies.value = v)} />
        <Checkbox checked={onPush.value} hint="Every push to main goes live." onChange={e => (onPush.value = e.currentTarget.checked)}>Deploy on push</Checkbox>
        <Row gap="related" justify="end">
          <Button emphasis="ghost" tone="neutral">Cancel</Button>
          <Button type="submit">Save changes</Button>
        </Row>
      </Stack>
      <Toaster />
    </>
  )
}

/* ---- Textarea ---- */

export const TextareaPlay = (p: any) => <Textarea {...p} hint={p.hint || undefined} />

export const TextareaRows = () => (
  <Stack gap="group">
    <Textarea label="Description" rows={2} defaultValue="The public shop, served from the edge." />
    <Textarea label="Description" rows={5} defaultValue="The public shop, served from the edge." />
  </Stack>
)

export const TextareaCounter = () => <Textarea label="Release note" counter={140} defaultValue="Product images now load from the edge, about 40% faster." />

export const TextareaVariants = () => (
  <Grid cols={3} gap="group">
    <Textarea label="Description" defaultValue="The public shop." />
    <Textarea label="Description" defaultValue="The public shop." variant="classic" />
    <Textarea label="Description" defaultValue="The public shop." appearance="line" />
  </Grid>
)

export const TextareaStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><Textarea label="Description" /></Cell>
    <Cell name="Filled"><Textarea label="Description" defaultValue="The public shop, served from the edge." /></Cell>
    <Cell name="Hint"><Textarea label="Description" hint="Shown on the project's card." /></Cell>
    <Cell name="Invalid"><Textarea label="Description" defaultValue="x" error="Write at least ten characters." /></Cell>
    <Cell name="Disabled"><Textarea label="Description" defaultValue="The public shop, served from the edge." disabled /></Cell>
    <Cell name="Read-only"><Textarea label="Description" defaultValue="The public shop, served from the edge." readonly /></Cell>
  </Grid>
)

export function TextareaReleaseNote() {
  const text = state('')
  const notes = state(['Lowered the stale window to 30s.'])
  const post = (e: Event) => {
    e.preventDefault()
    if (!text.value.trim()) return
    notes.value = [text.value.trim(), ...notes.value]
    text.value = ''
  }
  return (
    <Stack as="form" gap="group" onSubmit={post}>
      <Textarea label="Release note" counter={140} hint="⌘ Enter posts it." value={text.value} onInput={e => (text.value = e.currentTarget.value)} />
      <Row justify="end"><Button type="submit" aria-disabled={text.value.trim() ? undefined : 'true'}>Post note</Button></Row>
      <Stack gap="tight">
        {notes.value.map(n => <Text key={n} subtle>{n}</Text>)}
      </Stack>
    </Stack>
  )
}

/* ---- Search ---- */

export const SearchPlay = (p: any) => <Search {...p} />

export const SearchSizes = () => (
  <Stack gap="group">
    <Search label="Search projects" size="sm" />
    <Search label="Search projects" />
    <Search label="Search projects" size="lg" />
  </Stack>
)

export const SearchPlaceholder = () => (
  <Stack gap="group">
    <Search label="Search projects" placeholder="Name, owner or region" />
    <Search label="Search projects" variant="classic" placeholder="Name, owner or region" />
  </Stack>
)

export const SearchStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><Search label="Search projects" /></Cell>
    <Cell name="Filled"><Search label="Search projects" defaultValue="checkout" /></Cell>
    <Cell name="Hint"><Search label="Search projects" hint="Name, owner or region." /></Cell>
    <Cell name="Invalid"><Search label="Search projects" defaultValue="region:" error="Finish the filter, like region:eu-west." /></Cell>
    <Cell name="Disabled"><Search label="Search projects" defaultValue="checkout" disabled /></Cell>
    <Cell name="Read-only"><Search label="Search projects" defaultValue="checkout" readonly /></Cell>
  </Grid>
)

export function SearchProjects() {
  const q = state('')
  const hits = derived(() => {
    const s = q.value.trim().toLowerCase()
    return PROJECTS.filter(p => `${p.name} ${p.owner} ${p.region}`.toLowerCase().includes(s)).slice(0, 5)
  })
  return (
    <Stack gap="group">
      <Search label="Search projects" placeholder="Name, owner or region" value={q.value} onInput={e => (q.value = e.currentTarget.value)} />
      <Stack gap="tight">
        {hits.value.map(p => <Row key={p.id} justify="between"><Text>{p.name}</Text><Text subtle>{p.region}</Text></Row>)}
        {!hits.value.length && <Text subtle>Nothing matches “{q.value}”.</Text>}
      </Stack>
    </Stack>
  )
}

/* ---- Select ---- */

export const SelectPlay = (p: any) => <Select options={REGION_OPTIONS} {...p} hint={p.hint || undefined} />

export const SelectBasic = () => <Select label="Region" options={REGION_OPTIONS} defaultValue="eu-west" />

export const SelectPlaceholder = () => <Select label="Region" placeholder="Choose a region" options={REGION_OPTIONS} />

export const SelectHints = () => <Select label="Role" options={ROLE_OPTIONS} defaultValue="Member" />

export const SelectGroups = () => <Select label="Deploy to" options={TARGET_OPTIONS} defaultValue="staging" />

export const SelectSearchable = () => <Select label="Project" searchable options={PROJECT_OPTIONS} defaultValue="checkout" />

export const SelectSizes = () => (
  <Stack gap="group">
    <Select label="Region" size="sm" options={REGION_OPTIONS} />
    <Select label="Region" options={REGION_OPTIONS} />
    <Select label="Region" size="lg" options={REGION_OPTIONS} />
  </Stack>
)

export const SelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><Select label="Region" placeholder="Choose a region" options={REGION_OPTIONS} /></Cell>
    <Cell name="Filled"><Select label="Region" options={REGION_OPTIONS} defaultValue="us-east" /></Cell>
    <Cell name="Hint"><Select label="Region" options={REGION_OPTIONS} hint="Moving a project redeploys it." /></Cell>
    <Cell name="Invalid"><Select label="Region" placeholder="Choose a region" options={REGION_OPTIONS} error="Choose where this project runs." /></Cell>
    <Cell name="Disabled"><Select label="Region" options={REGION_OPTIONS} defaultValue="us-east" disabled /></Cell>
    <Cell name="Read-only"><Input label="Region" defaultValue="us-east" readonly /></Cell>
  </Grid>
)

export function SelectLinked() {
  const project = state<string | null>('mobile-bff')
  const picked = derived(() => PROJECTS.find(p => p.id === project.value)!)
  return (
    <Stack gap="related">
      <Select label="Project" searchable options={PROJECT_OPTIONS} value={project} />
      <Text subtle>{picked.value.status} in {picked.value.region}, {picked.value.deploys} deploys so far.</Text>
    </Stack>
  )
}

export function FormInvite() {
  const email = state('')
  const role = state<string | null>('Member')
  const tried = state(false)
  const sent = state([{ email: 'noor@tessel.dev', role: 'Viewer' }])
  const problem = derived(() => (!tried.value || EMAIL.test(email.value) ? undefined : 'That doesn\'t look like an email address.'))
  const invite = (e: Event) => {
    e.preventDefault()
    tried.value = true
    if (!EMAIL.test(email.value)) return
    sent.value = [{ email: email.value, role: role.value! }, ...sent.value]
    email.value = ''
    tried.value = false
  }
  return (
    <Stack gap="group">
      <Stack as="form" gap="group" onSubmit={invite}>
        <Input label="Email" type="email" icon="mail" value={email.value} error={problem.value} onInput={e => (email.value = e.currentTarget.value)} />
        <Select label="Role" options={ROLE_OPTIONS} value={role} />
        <Button type="submit" full>Send invite</Button>
      </Stack>
      <Stack gap="tight">
        <Text role="label">Pending</Text>
        {sent.value.map(s => <Row key={s.email} justify="between"><Text>{s.email}</Text><Text subtle>{s.role}</Text></Row>)}
      </Stack>
    </Stack>
  )
}

/* ---- Checkbox ---- */

export function CheckboxPlay(p: any) {
  const on = state(untrack(() => !!p.checked))
  return <Checkbox {...p} hint={p.hint || undefined} checked={on.value} onChange={e => (on.value = e.currentTarget.checked)}>{p.children}</Checkbox>
}

export function CheckboxBasic() {
  const on = state(true)
  return <Checkbox checked={on.value} onChange={e => (on.value = e.currentTarget.checked)}>Deploy on push</Checkbox>
}

export function CheckboxHint() {
  const on = state(false)
  return <Checkbox checked={on.value} hint="Failed checks stop the deploy." onChange={e => (on.value = e.currentTarget.checked)}>Require checks to pass</Checkbox>
}

export const CheckboxStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Off"><Checkbox>Deploy on push</Checkbox></Cell>
    <Cell name="On"><Checkbox checked>Deploy on push</Checkbox></Cell>
    <Cell name="Part of a set"><Checkbox indeterminate>Deploy on push</Checkbox></Cell>
    <Cell name="Hint"><Checkbox hint="Every push to main goes live.">Deploy on push</Checkbox></Cell>
    <Cell name="Invalid"><Checkbox error="Accept this to carry on.">Deploy on push</Checkbox></Cell>
    <Cell name="Disabled"><Checkbox checked disabled>Deploy on push</Checkbox></Cell>
  </Grid>
)

const EVENTS = ['Deploy failed', 'Deploy finished', 'Uptime drops', 'Budget reached']

export function CheckboxSelectAll() {
  const on = state(['Deploy failed', 'Uptime drops'])
  const flip = (name: string) => (on.value = on.value.includes(name) ? on.value.filter(n => n !== name) : [...on.value, name])
  const all = derived(() => on.value.length === EVENTS.length)
  return (
    <Stack gap="tight">
      <Checkbox checked={all.value} indeterminate={on.value.length > 0 && !all.value} onChange={() => (on.value = all.value ? [] : EVENTS)}>Email me about</Checkbox>
      <Stack gap="tight" style="padding-inline-start:var(--warp-space-group)">
        {EVENTS.map(name => <Checkbox key={name} checked={on.value.includes(name)} onChange={() => flip(name)}>{name}</Checkbox>)}
      </Stack>
    </Stack>
  )
}

export function CheckboxConfirm() {
  const sure = state(false)
  const tried = state(false)
  const gone = state(false)
  const remove = () => {
    tried.value = true
    if (sure.value) gone.value = true
  }
  return (
    <Stack gap="group">
      <Text>{gone.value ? 'reports was deleted.' : 'Deleting reports removes its 41 deploys and all its logs.'}</Text>
      <Checkbox checked={sure.value} error={tried.value && !sure.value ? 'Tick this first.' : undefined} onChange={e => (sure.value = e.currentTarget.checked)}>I understand this can't be undone</Checkbox>
      <Row justify="end"><Button tone="critical" onClick={remove}>Delete project</Button></Row>
    </Stack>
  )
}

/* ---- Radio and RadioGroup ---- */

export function RadioPlay(p: any) {
  const on = state('a')
  return (
    <Stack gap="tight">
      <Radio {...p} hint={p.hint || undefined} name="radio-play" checked={on.value === 'a'} onChange={() => (on.value = 'a')}>{p.children}</Radio>
      <Radio name="radio-play" checked={on.value === 'b'} onChange={() => (on.value = 'b')}>Roll out in steps</Radio>
    </Stack>
  )
}

export function RadioStrategy() {
  const how = state('rolling')
  return (
    <Stack gap="tight">
      <Radio name="strategy" checked={how.value === 'rolling'} hint="One copy at a time, no downtime." onChange={() => (how.value = 'rolling')}>Rolling</Radio>
      <Radio name="strategy" checked={how.value === 'canary'} hint="5% of traffic first, then everyone." onChange={() => (how.value = 'canary')}>Canary</Radio>
      <Radio name="strategy" checked={how.value === 'all'} hint="Fastest. Drops requests for a moment." onChange={() => (how.value = 'all')}>All at once</Radio>
    </Stack>
  )
}

export const RadioStates = () => (
  <Row gap="section" wrap>
    <Radio name="states-off">Canary</Radio>
    <Radio name="states-on" checked>Canary</Radio>
    <Radio name="states-off-d" disabled>Canary</Radio>
    <Radio name="states-on-d" checked disabled>Canary</Radio>
  </Row>
)

const WINDOWS = [
  { value: 'now', label: 'Right away', hint: 'Starts within a minute.' },
  { value: 'night', label: 'Tonight', hint: 'At 02:00 in the project\'s region.' },
  { value: 'weekend', label: 'This weekend', hint: 'Saturday at 02:00.', disabled: true },
] as const

export function RadioGroupWindow() {
  const when = state<'now' | 'night' | 'weekend'>('now')
  return <RadioGroup label="Maintenance window" value={when.value} options={WINDOWS as any} onChange={v => (when.value = v)} />
}

const PLANS = [
  { value: 'hobby', label: 'Hobby', hint: 'One project, free.' },
  { value: 'team', label: 'Team', hint: '€20 a seat, unlimited projects.' },
  { value: 'scale', label: 'Scale', hint: '€60 a seat, plus private regions.' },
]
const SEAT = { hobby: 0, team: 20, scale: 60 } as Record<string, number>

export function RadioGroupPlan() {
  const plan = state('team')
  const seats = state(8)
  return (
    <Stack gap="group">
      <RadioGroup label="Plan" value={plan.value} options={PLANS} onChange={v => (plan.value = v)} />
      <Slider label="Seats" value={seats.value} min={1} max={40} onChange={v => (seats.value = v)} />
      <Row justify="between">
        <Text subtle>Per month</Text>
        <Text role="heading">€{SEAT[plan.value] * seats.value}</Text>
      </Row>
    </Stack>
  )
}

/* ---- Switch ---- */

export function SwitchPlay(p: any) {
  const on = state(untrack(() => !!p.checked))
  return <Switch {...p} hint={p.hint || undefined} checked={on.value} onChange={e => (on.value = e.currentTarget.checked)}>{p.children}</Switch>
}

export function SwitchBasic() {
  const on = state(true)
  return <Switch checked={on.value} onChange={e => (on.value = e.currentTarget.checked)}>Preview deploys</Switch>
}

export const SwitchSizes = () => (
  <Stack gap="related">
    <Switch size="sm" checked>Preview deploys</Switch>
    <Switch checked>Preview deploys</Switch>
  </Stack>
)

export const SwitchPlacement = () => (
  <Stack gap="related">
    <Switch checked>Preview deploys</Switch>
    <Switch checked placement="start">Preview deploys</Switch>
  </Stack>
)

export const SwitchHint = () => <Switch checked hint="Every pull request gets its own address.">Preview deploys</Switch>

export const SwitchStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Off"><Switch>Preview deploys</Switch></Cell>
    <Cell name="On"><Switch checked>Preview deploys</Switch></Cell>
    <Cell name="Hint"><Switch hint="Every pull request gets its own address.">Preview deploys</Switch></Cell>
    <Cell name="Disabled off"><Switch disabled>Preview deploys</Switch></Cell>
    <Cell name="Disabled on"><Switch checked disabled>Preview deploys</Switch></Cell>
  </Grid>
)

export function SwitchSettings() {
  const previews = state(true)
  const analytics = state(false)
  const paused = state(false)
  const say = (title: string, on: boolean) => toast.show({ title: `${title} ${on ? 'on' : 'off'}` })
  return (
    <Stack gap="group" divided>
      <Switch checked={previews.value} hint="Every pull request gets its own address." onChange={e => say('Preview deploys', (previews.value = e.currentTarget.checked))}>Preview deploys</Switch>
      <Switch checked={analytics.value} hint="Adds about 1 KB to each page." onChange={e => say('Web analytics', (analytics.value = e.currentTarget.checked))}>Web analytics</Switch>
      <Switch checked={paused.value} hint="Takes the project offline until you switch it back." onChange={e => say('Pause', (paused.value = e.currentTarget.checked))}>Pause project</Switch>
      <Toaster />
    </Stack>
  )
}

/* ---- Slider ---- */

export function SliderPlay(p: any) {
  const v = state(4)
  return <Slider {...p} value={v.value} onChange={next => (v.value = next)} />
}

const gigabytes = (v: number) => `${v} GB`
const percent = (v: number) => `${v}%`

export function SliderBasic() {
  const copies = state(3)
  return <Slider label="Copies" value={copies.value} min={1} max={8} onChange={v => (copies.value = v)} />
}

export function SliderFormat() {
  const memory = state(4)
  return <Slider label="Memory" value={memory.value} min={1} max={32} format={gigabytes} onChange={v => (memory.value = v)} />
}

export function SliderStep() {
  const rollout = state(25)
  return <Slider label="Rollout" value={rollout.value} step={25} format={percent} onChange={v => (rollout.value = v)} />
}

export function SliderRange() {
  const copies = state<[number, number]>([2, 6])
  return <Slider label="Copies" value={copies.value} min={1} max={12} names={['Fewest copies', 'Most copies']} onChange={v => (copies.value = v)} />
}

export const SliderDisabled = () => <Slider label="Copies" value={3} min={1} max={8} disabled onChange={() => {}} />

const COPY_COST = 42

export function SliderAutoscale() {
  const copies = state<[number, number]>([2, 6])
  return (
    <Stack gap="group">
      <Slider label="Keep between" value={copies.value} min={1} max={12} names={['Fewest copies', 'Most copies']} onChange={v => (copies.value = v)} />
      <Stack gap="tight">
        <Row justify="between"><Text subtle>When quiet</Text><Text>€{copies.value[0] * COPY_COST} a month</Text></Row>
        <Row justify="between"><Text subtle>At full load</Text><Text>€{copies.value[1] * COPY_COST} a month</Text></Row>
      </Stack>
    </Stack>
  )
}

/* ---- Segmented ---- */

const PERIODS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]
const VIEWS = [{ value: 'list', label: 'List', icon: 'list' }, { value: 'grid', label: 'Grid', icon: 'grid' }] as any[]
const LOGS = [{ value: 'all', label: 'All' }, { value: 'info', label: 'Info' }, { value: 'trace', label: 'Trace', disabled: true }]

export function SegmentedPlay(p: any) {
  const v = state('week')
  return <Segmented {...p} value={v.value} options={PERIODS} onChange={next => (v.value = next)} />
}

export function SegmentedBasic() {
  const v = state('week')
  return <Segmented label="Period" value={v.value} options={PERIODS} onChange={next => (v.value = next)} />
}

export function SegmentedIcons() {
  const v = state('list')
  return <Segmented label="View" value={v.value} options={VIEWS} onChange={next => (v.value = next)} />
}

export function SegmentedSizes() {
  const v = state('week')
  return (
    <>
      <Segmented label="Period" size="sm" value={v.value} options={PERIODS} onChange={next => (v.value = next)} />
      <Segmented label="Period" value={v.value} options={PERIODS} onChange={next => (v.value = next)} />
    </>
  )
}

export function SegmentedDisabledOption() {
  const v = state('all')
  return <Segmented label="Logs" value={v.value} options={LOGS} onChange={next => (v.value = next)} />
}

const countOf = (status: string) => DEPLOYS.filter(d => d.status === status).length
const DEPLOY_FILTERS = [
  { value: 'all', label: 'All', count: DEPLOYS.length },
  { value: 'Live', label: 'Live', count: countOf('Live') },
  { value: 'Failed', label: 'Failed', count: countOf('Failed') },
]

export function SegmentedDeploys() {
  const show = state('all')
  const rows = derived(() => DEPLOYS.filter(d => show.value === 'all' || d.status === show.value).slice(0, 4))
  return (
    <Stack gap="group">
      <Segmented label="Show deploys" value={show.value} options={DEPLOY_FILTERS} onChange={next => (show.value = next)} />
      <Stack gap="tight">
        {rows.value.map(d => <Row key={d.id} justify="between" gap="group"><Text>{d.project}</Text><Text subtle>{d.commit}</Text></Row>)}
      </Stack>
    </Stack>
  )
}

/* ---- Field ---- */

export const FieldPlay = (p: any) => <Input {...p} hint={p.hint || undefined} error={p.error || undefined} icon={p.icon || undefined} prefix={p.prefix || undefined} suffix={p.suffix || undefined} />

export const FieldAnatomy = () => (
  <Stack gap="group">
    <Input label="Domain" icon="globe" prefix="https://" suffix=".tessel.dev" hint="You can add your own later." defaultValue="storefront" clearable />
    <Input label="Release name" hint="Shown in the deploy list." counter={40} defaultValue="Autumn sale" />
  </Stack>
)

export const FieldLabelStyles = () => (
  <Grid cols={2} gap="group">
    <Input label="Project name" hint="Floats on the border." />
    <Input label="Project name" hint="Sits above the field." variant="classic" />
  </Grid>
)

export const FieldError = () => (
  <Stack gap="group">
    <Input label="Project name" hint="Lowercase letters and dashes." defaultValue="storefront" />
    <Input label="Project name" hint="Lowercase letters and dashes." defaultValue="Store Front" error="That name has a space in it." />
  </Stack>
)

export function FieldCustomControl() {
  const token = state('tsl_4f9c2e71')
  const rotate = () => (token.value = `tsl_${Math.random().toString(16).slice(2, 10)}`)
  return (
    <Field
      label="Deploy token"
      filled
      hint="Rotating it stops the old one straight away."
      end={<Button size="sm" emphasis="ghost" tone="neutral" onClick={rotate}>Rotate</Button>}
      control={p => <input data-part="input" id={p.id} aria-describedby={p.describedby} readonly value={token.value} />}
    />
  )
}

export const FieldForm = () => (
  <Stack gap="group">
    <Input label="Name" autocomplete="name" defaultValue="Mara Lindqvist" />
    <Input label="Work email" type="email" autocomplete="email" defaultValue="mara@tessel.dev" />
    <Textarea label="About you" hint="Shown to your team." />
  </Stack>
)

/* ---- CompactSelect ---- */

export function CompactSelectPlay(p: any) {
  return <CompactSelect options={REGION_OPTIONS} {...p} placeholder={p.placeholder || undefined} />
}

export const CompactSelectBasic = () => <CompactSelect label="Region" options={REGION_OPTIONS} defaultValue="eu-west" />

const PAGE_SIZES = [{ value: '3', label: '3 rows' }, { value: '5', label: '5 rows' }, { value: '10', label: '10 rows' }]

export function CompactSelectRows() {
  const size = state<string | null>('5')
  const rows = derived(() => PROJECTS.slice(0, Number(size.value)))
  return (
    <Stack gap="group">
      <Stack gap="tight">
        {rows.value.map(p => <Row key={p.id} justify="between"><Text>{p.name}</Text><Text subtle>{p.owner}</Text></Row>)}
      </Stack>
      <Row justify="between">
        <Text subtle>{rows.value.length} of {PROJECTS.length}</Text>
        <CompactSelect label="Rows per page" options={PAGE_SIZES} value={size} />
      </Row>
    </Stack>
  )
}

const TEAM_ROLES = ROLE_OPTIONS.map(r => ({ value: r.value, label: r.value }))
const TEAM = PEOPLE.slice(1, 5)

export const CompactSelectRoles = () => (
  <Stack gap="related" divided>
    {TEAM.map(p => (
      <Row key={p.id} justify="between" gap="group">
        <Stack gap="hair">
          <Text>{p.name}</Text>
          <Text role="caption" subtle>{p.email}</Text>
        </Stack>
        <CompactSelect label={`Role for ${p.name}`} options={TEAM_ROLES} defaultValue={p.role} />
      </Row>
    ))}
  </Stack>
)

export const CompactSelectStates = () => (
  <>
    <CompactSelect label="Region" placeholder="Region" options={REGION_OPTIONS} />
    <CompactSelect label="Region" options={REGION_OPTIONS} defaultValue="us-east" />
    <CompactSelect label="Region" options={REGION_OPTIONS} defaultValue="us-east" disabled />
  </>
)
