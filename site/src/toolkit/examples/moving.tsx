import { derived, state, untrack } from '@weft-js/core'
import { Accordion, Badge, Button, Card, Grid, Heading, Input, Link, LoadMore, Nav, PaginationBar, Row, Shape, Split, Stack, Switch, Tabs, Text } from '@weft-js/warp'
import { DEPLOYS, PROJECTS, TONE_OF } from '../world'

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'deploys', label: 'Deploys' },
  { value: 'logs', label: 'Logs' },
  { value: 'settings', label: 'Settings' },
]

const WORDS: Record<string, string> = {
  overview: 'storefront is live in eu-west with 412 deploys so far.',
  deploys: 'The last deploy took two minutes and is serving traffic.',
  logs: 'No errors in the last hour.',
  settings: 'Deploys run on every push to main.',
}

export function TabsPlay(p: { variant: 'line' | 'pill' | 'enclosed' }) {
  const tab = state('overview')
  return (
    <Stack>
      <Tabs label="Project" variant={p.variant} value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>
        {v => <Text>{WORDS[v]}</Text>}
      </Tabs>
    </Stack>
  )
}

export function TabsLine() {
  const tab = state('overview')
  return (
    <Tabs label="Project" value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>
      {v => <Text>{WORDS[v]}</Text>}
    </Tabs>
  )
}

export function TabsPill() {
  const tab = state('overview')
  return (
    <Tabs label="Project" variant="pill" value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>
      {v => <Text>{WORDS[v]}</Text>}
    </Tabs>
  )
}

export function TabsEnclosed() {
  const tab = state('overview')
  return (
    <Tabs label="Project" variant="enclosed" value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>
      {v => <Text>{WORDS[v]}</Text>}
    </Tabs>
  )
}

const REGIONS = ['eu-west', 'eu-north', 'us-east', 'us-west', 'ap-south', 'ap-east', 'sa-east', 'af-south', 'me-central'].map(r => ({ value: r, label: r }))

export function TabsOverflow() {
  const tab = state('eu-west')
  return (
    <Tabs label="Region" value={tab.value} onChange={v => (tab.value = v)} options={REGIONS}>
      {v => <Text subtle>Traffic served from {v}.</Text>}
    </Tabs>
  )
}

const PLANNED = [
  { value: 'general', label: 'General' },
  { value: 'domains', label: 'Domains' },
  { value: 'sso', label: 'Single sign-on', disabled: true },
]

export function TabsDisabled() {
  const tab = state('general')
  return (
    <Tabs label="Settings" value={tab.value} onChange={v => (tab.value = v)} options={PLANNED}>
      {v => <Text>{v === 'general' ? 'Name, region and owner.' : 'storefront.tessel.app and two more.'}</Text>}
    </Tabs>
  )
}

const FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'Live', label: 'Live' },
  { value: 'Building', label: 'Building' },
  { value: 'Failed', label: 'Failed' },
]

export function TabsFilterList() {
  const status = state('All')
  return (
    <Tabs label="Status" variant="pill" value={status.value} onChange={v => (status.value = v)} options={FILTERS}>
      {v => (
        <Stack gap="tight">
          {PROJECTS.filter(p => v === 'All' || p.status === v).slice(0, 5).map(p => (
            <Row key={p.id} justify="between">
              <Text>{p.name}</Text>
              <Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge>
            </Row>
          ))}
        </Stack>
      )}
    </Tabs>
  )
}

const panel = (view: string) => {
  if (view === 'overview') return (
    <Grid min="xs" gap="related">
      <Card eyebrow="Uptime" title="99.98%" />
      <Card eyebrow="Latency" title="84 ms" />
      <Card eyebrow="This month" title="$1,240" />
    </Grid>
  )
  if (view === 'deploys') return (
    <Stack gap="related">
      {DEPLOYS.slice(0, 3).map(d => (
        <Row key={d.id} justify="between" gap="group">
          <Text>{d.message}</Text>
          <Text role="code" subtle>{d.commit}</Text>
        </Row>
      ))}
    </Stack>
  )
  if (view === 'logs') return <Text role="code" subtle>16:42 Deployed 9f3ac21 in 2m 04s</Text>
  return <Switch defaultChecked>Deploy every push to main</Switch>
}

export function TabsProjectPage() {
  const tab = state('overview')
  return (
    <Stack gap="group">
      <Row justify="between" gap="group">
        <Heading level={3}>storefront</Heading>
        <Badge tone="positive" dot>Live</Badge>
      </Row>
      <Tabs label="storefront" value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>
        {panel}
      </Tabs>
    </Stack>
  )
}

const QUESTIONS = [
  { value: 'rollback', title: 'How do I roll back a deploy?', content: 'Open the deploy you want and press Promote. Traffic moves over in about ten seconds.' },
  { value: 'domains', title: 'Can I bring my own domain?', content: 'Yes. Add it under Settings, then point a CNAME at tessel.app.' },
  { value: 'bill', title: 'What counts towards my bill?', content: 'Requests and build minutes. Preview deploys are free.' },
]

export const AccordionPlay = (p: { variant: 'boxed' | 'line'; multiple: boolean }) => <Stack><Accordion variant={p.variant} multiple={p.multiple} defaultOpen={['rollback']} items={QUESTIONS} /></Stack>

export const AccordionBoxed = () => <Accordion defaultOpen={['rollback']} items={QUESTIONS} />

export const AccordionLine = () => <Accordion variant="line" defaultOpen={['rollback']} items={QUESTIONS} />

export const AccordionMultiple = () => <Accordion multiple defaultOpen={['rollback', 'bill']} items={QUESTIONS} />

export const AccordionDisabled = () => (
  <Accordion items={[
    { value: 'plan', title: 'Plan', content: 'Team, billed monthly.' },
    { value: 'seats', title: 'Seats', content: 'Eight of ten in use.' },
    { value: 'sso', title: 'Single sign-on (Enterprise)', content: '', disabled: true },
  ]} />
)

export function AccordionHeardChange() {
  const open = state(['rollback'])
  return (
    <Stack gap="group">
      <Accordion multiple defaultOpen={['rollback']} onChange={list => (open.value = list)} items={QUESTIONS} />
      <Text subtle>{open.value.length} of {QUESTIONS.length} open</Text>
    </Stack>
  )
}

export const AccordionSettings = () => (
  <Accordion variant="line" defaultOpen={['general']} items={[
    { value: 'general', title: 'General', content: <Input label="Project name" defaultValue="storefront" /> },
    { value: 'build', title: 'Build', content: <Stack gap="related"><Input label="Build command" defaultValue="npm run build" /><Switch defaultChecked>Cache dependencies</Switch></Stack> },
    { value: 'alerts', title: 'Alerts', content: <Switch>Tell me when a deploy fails</Switch> },
  ]} />
)

const PAGES = ['Overview', 'Deploys', 'Logs', 'Settings']

export function NavPlay(p: { axis: 'x' | 'y' }) {
  const at = state('Deploys')
  const go = (e: Event, name: string) => { e.preventDefault(); at.value = name }
  return (
    <Nav label="Project" axis={p.axis}>
      {PAGES.map(name => <a key={name} href={`#${name}`} aria-current={at.value === name ? 'page' : undefined} onClick={e => go(e, name)}>{name}</a>)}
    </Nav>
  )
}

export function NavAcross() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => { e.preventDefault(); at.value = name }
  return (
    <Nav label="Project">
      {PAGES.map(name => <a key={name} href={`#${name}`} aria-current={at.value === name ? 'page' : undefined} onClick={e => go(e, name)}>{name}</a>)}
    </Nav>
  )
}

export function NavDown() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => { e.preventDefault(); at.value = name }
  return (
    <Nav label="Project" axis="y">
      {PAGES.map(name => <a key={name} href={`#${name}`} aria-current={at.value === name ? 'page' : undefined} onClick={e => go(e, name)}>{name}</a>)}
    </Nav>
  )
}

export function NavProductHeader() {
  const at = state('Deploys')
  const go = (e: Event, name: string) => { e.preventDefault(); at.value = name }
  return (
    <Row justify="between" gap="section">
      <Row gap="section">
        <Heading level={3}>Tessel</Heading>
        <Nav label="Main">
          {PAGES.map(name => <a key={name} href={`#${name}`} aria-current={at.value === name ? 'page' : undefined} onClick={e => go(e, name)}>{name}</a>)}
        </Nav>
      </Row>
      <Button size="sm" icon="rocket">Deploy</Button>
    </Row>
  )
}

export function NavSettings() {
  const at = state('General')
  const go = (e: Event, name: string) => { e.preventDefault(); at.value = name }
  return (
    <Split side="start" width="rail" gap="section">
      <Nav label="Settings" axis="y">
        {['General', 'Domains', 'Billing', 'Team'].map(name => <a key={name} href={`#${name}`} aria-current={at.value === name ? 'page' : undefined} onClick={e => go(e, name)}>{name}</a>)}
      </Nav>
      <Stack gap="related">
        <Heading level={3}>{at.value}</Heading>
        <Text subtle>Everything about {at.value.toLowerCase()} for this project lives here.</Text>
      </Stack>
    </Split>
  )
}

export const NavContents = () => (
  <Split side="start" width="rail" gap="section">
    <Nav label="On this page" axis="y" spy>
      <a href="#toc-build">Build</a>
      <a href="#toc-deploy">Deploy</a>
      <a href="#toc-roll-back">Roll back</a>
    </Nav>
    <Stack gap="section">
      <Stack gap="tight"><Heading level={3} id="toc-build">Build</Heading><Text subtle>Every push runs your build command in a clean machine. Dependencies are cached between runs, so the second build is much faster than the first.</Text></Stack>
      <Stack gap="tight"><Heading level={3} id="toc-deploy">Deploy</Heading><Text subtle>A finished build goes to each region in turn. New traffic moves over once the health check passes, and old requests are left to finish.</Text></Stack>
      <Stack gap="tight"><Heading level={3} id="toc-roll-back">Roll back</Heading><Text subtle>Every deploy stays ready to serve. Promote an older one and traffic moves back in about ten seconds, with no new build.</Text></Stack>
    </Stack>
  </Split>
)

export function PaginationBarPlay(p: { total: number; size: number }) {
  const page = state(1)
  const size = state(untrack(() => p.size))
  return <PaginationBar label="Projects" page={page} size={size} total={p.total} />
}

export function PaginationBarOffset() {
  const page = state(6)
  const size = state(25)
  return <PaginationBar label="Deploys" page={page} size={size} total={2480} />
}

export function PaginationBarCursor() {
  const index = state(0)
    return (
    <PaginationBar label="Audit log" mode="cursor" size={50} pageIndex={index.value} hasPrev={index.value > 0} hasMore={index.value < 3} onPageChange={i => (index.value = i)} />
  )
}

export function PaginationBarNarrow() {
  const page = state(4)
  const size = state(25)
  return <PaginationBar label="Deploys" page={page} size={size} total={2480} />
}

export function PaginationBarControlled() {
  const page = state(8)
  const size = state(10)
  return (
    <Stack gap="related">
      <PaginationBar label="Projects" page={page} size={size} total={240} />
      <Row gap="related">
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => (page.value = 1)}>Back to the start</Button>
        <Text subtle>Page {page.value}, set from outside</Text>
      </Row>
    </Stack>
  )
}

export function PaginationBarList() {
  const page = state(1)
  const size = state(4)
  const rows = () => PROJECTS.slice((page.value - 1) * size.value, page.value * size.value)
  return (
    <Stack gap="group">
      <Stack gap="related" divided>
        {rows().map(p => (
          <Row key={p.id} justify="between" gap="group">
            <Stack gap="hair"><Text>{p.name}</Text><Text role="caption" subtle>{p.owner}, {p.region}</Text></Stack>
            <Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge>
          </Row>
        ))}
      </Stack>
      <PaginationBar label="Projects" page={page} size={size} sizes={[4, 6, 10]} total={PROJECTS.length} />
    </Stack>
  )
}

function ProjectRow(p: { name: string; owner: string }) {
  return <Row justify="between" gap="group"><Text>{p.name}</Text><Text subtle>{p.owner}</Text></Row>
}

export function LoadMorePlay(p: { auto: boolean; message: string }) {
  const shown = state(4)
  const loading = state(false)
  const done = derived(() => shown.value >= PROJECTS.length)
  let box: HTMLElement | undefined
  const load = () => {
    loading.value = true
    setTimeout(() => { shown.value += 3; loading.value = false }, 800)
  }
  return (
    <Stack gap="related" ref={(n: HTMLElement) => (box = n)} style="block-size:240px;overflow-y:auto">
      {PROJECTS.slice(0, shown.value).map(x => <ProjectRow key={x.id} name={x.name} owner={x.owner} />)}
      <LoadMore auto={p.auto} root={() => box ?? null} loading={loading.value} done={done.value} message={p.message} onLoad={load} />
    </Stack>
  )
}

export function LoadMoreOnPress() {
  const shown = state(3)
  const loading = state(false)
  const load = () => {
    loading.value = true
    setTimeout(() => { shown.value += 3; loading.value = false }, 800)
  }
  const done = derived(() => shown.value >= PROJECTS.length)
  return (
    <Stack gap="related">
      {PROJECTS.slice(0, shown.value).map(p => <ProjectRow key={p.id} name={p.name} owner={p.owner} />)}
      {loading.value && <Shape kind="text" lines={2} label="Loading projects" />}
      <LoadMore auto={false} loading={loading.value} done={done.value} message={done.value ? 'That is every project.' : `${shown.value} of ${PROJECTS.length}`} onLoad={load} />
    </Stack>
  )
}

export function LoadMoreScrolling() {
  const shown = state(6)
  const loading = state(false)
  let box: HTMLElement | undefined
  const load = () => {
    loading.value = true
    setTimeout(() => { shown.value += 4; loading.value = false }, 700)
  }
  const done = derived(() => shown.value >= PROJECTS.length)
  return (
    <Stack gap="related" ref={(n: HTMLElement) => (box = n)} style="block-size:220px;overflow-y:auto">
      {PROJECTS.slice(0, shown.value).map(p => <ProjectRow key={p.id} name={p.name} owner={p.owner} />)}
      <LoadMore root={() => box ?? null} loading={loading.value} done={done.value} message={done.value ? 'That is every project.' : ''} onLoad={load} />
    </Stack>
  )
}

export const LoadMoreLoading = () => <LoadMore auto={false} loading onLoad={() => {}} />

export const LoadMoreDone = () => <LoadMore auto={false} done message="That is every deploy from October." onLoad={() => {}} />

export const LinkPlay = (p: { children: string; subtle: boolean; external: boolean }) => <Link href={p.external ? 'https://example.com' : '/toolkit/button'} subtle={p.subtle} external={p.external}>{p.children}</Link>

export const LinkInText = () => <Text>Roll back from the <Link href="/toolkit/table">deploys table</Link>. Traffic moves in about ten seconds.</Text>

export const LinkSubtle = () => <Text subtle>Questions? <Link subtle href="/toolkit">Read the guide</Link> or ask your team's owner.</Text>

export const LinkExternal = () => <Link external href="https://example.com">Open the status page</Link>

export const LinkFooter = () => (
  <Row gap="group" justify="center">
    <Link subtle href="/learn">Learn</Link>
    <Link subtle href="/toolkit">Components</Link>
    <Link subtle external href="https://example.com">Status</Link>
  </Row>
)

export const LinkCardAction = () => (
  <Card eyebrow="Failed" title="mobile-bff deploy d-4819">
    <Text subtle>Retry timed out upstream calls, by Sam Okafor.</Text>
    <Link href="/toolkit/alert">See what went wrong</Link>
  </Card>
)
