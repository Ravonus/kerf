import { state, untrack } from 'weft'
import { Badge, Button, Card, Center, Cover, Frame, Grid, Heading, Input, Inset, Nav, Progress, Row, Segmented, Shell, Spacer, Split, Stack, Switch, Text, Toggle } from '@weft/warp'
import { DEPLOYS, PEOPLE, PROJECTS, REGIONS, TONE_OF, TRAFFIC } from '../world'

// Layout has no look of its own, so these tinted boxes make it visible.
const TINT = 'display:grid;place-content:center;padding:var(--warp-space-related);text-align:center;font-size:var(--warp-text-caption-size);color:var(--warp-color-accent-text);background:var(--warp-color-accent-soft);border:var(--warp-border-hairline) solid var(--warp-color-accent-border);border-radius:var(--warp-radius-control)'

function Box({ tall, children, ...rest }: { tall?: number; children?: any; [attr: string]: any }) {
  return <div style={tall ? `${TINT};min-block-size:${tall}px` : TINT} {...rest}>{children}</div>
}

const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8]
const SIX = [1, 2, 3, 4, 5, 6]
const FOUR = [1, 2, 3, 4]

type Gap = 'none' | 'hair' | 'tight' | 'related' | 'group' | 'section' | 'page'

/* -- Grid -- */

export const GridPlay = (p: { min?: 'xs' | 'sm' | 'md' | 'lg'; cols?: string; gap?: Gap }) => (
  <Grid min={p.min} cols={p.cols === 'any' ? undefined : (Number(p.cols) as 2 | 3 | 4 | 6)} gap={p.gap}>
    {EIGHT.map(n => <Box key={n} tall={64}>{n}</Box>)}
  </Grid>
)

const MINS = ['xs', 'sm', 'md', 'lg'] as const

export const GridMinSizes = () => (
  <Stack gap="group">
    {MINS.map(min => (
      <Stack key={min} gap="tight">
        <Text role="label" subtle>min="{min}"</Text>
        <Grid min={min} gap="tight">
          {EIGHT.map(n => <Box key={n}>{n}</Box>)}
        </Grid>
      </Stack>
    ))}
  </Stack>
)

const COLS = [2, 3, 4, 6] as const

export const GridCols = () => (
  <Stack gap="group">
    {COLS.map(cols => (
      <Stack key={cols} gap="tight">
        <Text role="label" subtle>cols={'{'}{cols}{'}'}</Text>
        <Grid min="xs" cols={cols} gap="tight">
          {SIX.map(n => <Box key={n}>{n}</Box>)}
        </Grid>
      </Stack>
    ))}
  </Stack>
)

export const GridSpan = () => (
  <Grid min="xs" cols={4} gap="related">
    <Box data-span="full">data-span="full"</Box>
    {FOUR.map(n => <Box key={n} tall={72}>{n}</Box>)}
    <Box data-span="full">data-span="full"</Box>
  </Grid>
)

const GAPS = ['tight', 'related', 'group', 'section'] as const

export const GridGaps = () => (
  <Grid min="sm" cols={2} gap="section">
    {GAPS.map(gap => (
      <Stack key={gap} gap="tight">
        <Text role="label" subtle>gap="{gap}"</Text>
        <Grid min="xs" cols={3} gap={gap}>
          {SIX.map(n => <Box key={n}>{n}</Box>)}
        </Grid>
      </Stack>
    ))}
  </Grid>
)

const now = TRAFFIC[11], before = TRAFFIC[10]
const change = (a: number, b: number) => `${a >= b ? '+' : ''}${((a - b) / b * 100).toFixed(1)}%`
const STATS = [
  { label: 'Requests', value: `${now.requests}M`, delta: change(now.requests, before.requests), good: true },
  { label: 'Error rate', value: `${now.errors}%`, delta: change(now.errors, before.errors), good: true },
  { label: 'Deploys', value: String(now.deploys), delta: change(now.deploys, before.deploys), good: true },
  { label: 'Spend', value: `$${now.cost.toLocaleString('en-US')}`, delta: change(now.cost, before.cost), good: false },
]

export const GridDashboard = () => (
  <Grid min="xs" cols={4} gap="related">
    {STATS.map(s => (
      <Card key={s.label}>
        <Stack gap="hair">
          <Text role="label" subtle>{s.label}</Text>
          <Text role="title">{s.value}</Text>
          <Text role="caption" tone={s.good ? 'positive' : 'caution'}>{s.delta} on September</Text>
        </Stack>
      </Card>
    ))}
    <Card data-span="full" title="Traffic by region">
      <Grid min="sm" gap="related">
        {REGIONS.map(r => <Progress key={r.region} label={r.region} value={r.share} />)}
      </Grid>
    </Card>
  </Grid>
)

export const GridProjectCards = () => (
  <Grid min="sm" cols={3} gap="related">
    {PROJECTS.slice(0, 6).map(p => (
      <Card key={p.id} href={`#${p.id}`} onClick={(e: MouseEvent) => e.preventDefault()}>
        <Stack gap="tight">
          <Row justify="between" gap="tight">
            <Text role="heading">{p.name}</Text>
            <Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge>
          </Row>
          <Text subtle>{p.owner}</Text>
          <Text role="caption" subtle>{p.region} · {p.deploys} deploys · {p.latency} ms</Text>
        </Stack>
      </Card>
    ))}
  </Grid>
)

/* -- Stack -- */

export const StackPlay = (p: { gap?: Gap; align?: 'start' | 'center' | 'end'; divided?: boolean }) => (
  <Stack gap={p.gap} align={p.align === ('stretch' as string) ? undefined : p.align} divided={p.divided} style="inline-size:min(100%,320px)">
    <Box>First</Box>
    <Box>Second</Box>
    <Box>Third</Box>
  </Stack>
)

const STACK_GAPS = ['hair', 'tight', 'related', 'group', 'section'] as const

export const StackGaps = () => (
  <Grid min="xs" gap="group">
    {STACK_GAPS.map(gap => (
      <Stack key={gap} gap="tight">
        <Text role="label" subtle>{gap}</Text>
        <Stack gap={gap}>
          <Box>One</Box>
          <Box>Two</Box>
          <Box>Three</Box>
        </Stack>
      </Stack>
    ))}
  </Grid>
)

const ALIGNS = ['start', 'center', 'end'] as const

export const StackAlign = () => (
  <Grid min="xs" cols={3} gap="group">
    {ALIGNS.map(align => (
      <Inset key={align}>
        <Stack gap="tight" align={align}>
          <Box>{align}</Box>
          <Box>A longer one</Box>
          <Box>Short</Box>
        </Stack>
      </Inset>
    ))}
  </Grid>
)

export const StackDivided = () => (
  <Stack divided gap="related">
    <div><Box>One</Box></div>
    <div><Box>Two</Box></div>
    <div><Box>Three</Box></div>
  </Stack>
)

export function StackNotifications() {
  const deploys = state(true)
  const failures = state(true)
  const digest = state(false)
  return (
    <Stack gap="group">
      <Stack gap="hair">
        <Heading level={3}>Notifications</Heading>
        <Text subtle>Choose what Tessel tells you about.</Text>
      </Stack>
      <Stack divided gap="related">
        <Switch checked={deploys.value} onChange={() => (deploys.value = !deploys.value)} hint="When a deploy goes live.">Deploys</Switch>
        <Switch checked={failures.value} onChange={() => (failures.value = !failures.value)} hint="When a build or health check fails.">Failures</Switch>
        <Switch checked={digest.value} onChange={() => (digest.value = !digest.value)} hint="One email on Monday morning.">Weekly digest</Switch>
      </Stack>
    </Stack>
  )
}

export const StackDeployLog = () => (
  <Stack divided gap="related">
    {DEPLOYS.slice(0, 4).map(d => (
      <Row key={d.id} justify="between" gap="related">
        <Stack gap="hair">
          <Text>{d.message}</Text>
          <Text role="caption" subtle>{d.project} · {d.author}</Text>
        </Stack>
        <Badge tone={TONE_OF[d.status as keyof typeof TONE_OF]} dot>{d.status}</Badge>
      </Row>
    ))}
  </Stack>
)

/* -- Row -- */

export const RowPlay = (p: { gap?: Gap; justify?: 'start' | 'between' | 'end' | 'center'; align?: string; wrap?: boolean }) => (
  <Inset>
    <Row gap={p.gap} justify={p.justify} align={p.align === 'center' ? undefined : (p.align as 'start')} wrap={p.wrap}>
      <Box>Short</Box>
      <Box tall={72}>Tall</Box>
      <Box>A little wider</Box>
    </Row>
  </Inset>
)

const JUSTIFIES = ['start', 'center', 'end', 'between'] as const

export const RowJustify = () => (
  <Stack gap="related">
    {JUSTIFIES.map(justify => (
      <Inset key={justify}>
        <Row justify={justify} gap="tight">
          <Box>{justify}</Box>
          <Box>Two</Box>
          <Box>Three</Box>
        </Row>
      </Inset>
    ))}
  </Stack>
)

export const RowAlign = () => (
  <Grid min="xs" cols={3} gap="group">
    <Inset><Row gap="tight"><Box tall={72}>Tall</Box><Box>center</Box></Row></Inset>
    <Inset><Row gap="tight" align="start"><Box tall={72}>Tall</Box><Box>start</Box></Row></Inset>
    <Inset><Row gap="tight" align="baseline"><Heading level={3}>Heading</Heading><Text subtle>baseline</Text></Row></Inset>
  </Grid>
)

const TAGS = ['eu-west', 'us-east', 'ap-south', 'us-west', 'eu-north', 'global', 'staging', 'preview', 'canary', 'archive']

export const RowWraps = () => (
  <Row gap="tight">
    {TAGS.map(t => <Box key={t}>{t}</Box>)}
  </Row>
)

export const RowGrow = () => (
  <Row gap="related" wrap={false}>
    <Box>Fixed</Box>
    <Box data-grow="">data-grow takes the rest</Box>
    <Box>Fixed</Box>
  </Row>
)

export const RowReflow = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text role="label" subtle>reflow="tablet": a stack below 600px</Text>
      <Row gap="tight" reflow="tablet"><Box>One</Box><Box>Two</Box><Box>Three</Box></Row>
    </Stack>
    <Stack gap="tight">
      <Text role="label" subtle>reflow="desktop": a stack below 1000px</Text>
      <Row gap="tight" reflow="desktop"><Box>One</Box><Box>Two</Box><Box>Three</Box></Row>
    </Stack>
  </Stack>
)

export const RowPageHeader = () => (
  <Row justify="between" gap="group" reflow="tablet">
    <Stack gap="hair">
      <Heading level={3} role="title">storefront</Heading>
      <Text subtle>Live in eu-west. Last deploy 2 hours ago.</Text>
    </Stack>
    <Row gap="tight">
      <Button emphasis="outline" tone="neutral" icon="terminal">Logs</Button>
      <Button icon="rocket">Deploy</Button>
    </Row>
  </Row>
)

/* -- Split -- */

export const SplitPlay = (p: { width?: string; side?: 'start' | 'end'; gap?: Gap; at?: 'tablet' | 'desktop' }) => (
  <Split width={p.width === 'aside' ? undefined : (p.width as 'nav')} side={p.side} gap={p.gap} at={p.at}>
    <Box tall={140}>Side</Box>
    <Box tall={140}>Main</Box>
  </Split>
)

const WIDTHS = ['rail', 'nav', 'list', 'half'] as const

export const SplitWidths = () => (
  <Stack gap="related">
    {WIDTHS.map(width => (
      <Split key={width} width={width} gap="related">
        <Box>{width}</Box>
        <Box>Main</Box>
      </Split>
    ))}
  </Stack>
)

export const SplitSides = () => (
  <Stack gap="related">
    <Split width="nav" gap="related"><Box tall={72}>Side, at the start</Box><Box tall={72}>Main</Box></Split>
    <Split width="nav" side="end" gap="related"><Box tall={72}>Main</Box><Box tall={72}>Side, at the end</Box></Split>
  </Stack>
)

export const SplitSteps = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text role="label" subtle>at="tablet": two columns from 600px</Text>
      <Split width="nav" gap="related"><Box>Side</Box><Box>Main</Box></Split>
    </Stack>
    <Stack gap="tight">
      <Text role="label" subtle>at="desktop": two columns from 1000px</Text>
      <Split width="nav" gap="related" at="desktop"><Box>Side</Box><Box>Main</Box></Split>
    </Stack>
  </Stack>
)

const SECTIONS = ['General', 'Domains', 'Team', 'Billing']

export function SplitSettings() {
  const section = state('General')
  const pick = (e: Event, name: string) => { e.preventDefault(); section.value = name }
  return (
    <Split width="nav" gap="section">
      <Nav label="Project settings" axis="y">
        {SECTIONS.map(name => <a key={name} href={`#${name}`} aria-current={section.value === name ? 'page' : undefined} onClick={(e: Event) => pick(e, name)}>{name}</a>)}
      </Nav>
      <Stack gap="group">
        <Stack gap="hair">
          <Heading level={3}>{section.value}</Heading>
          <Text subtle>Settings for storefront.</Text>
        </Stack>
        <Input label="Project name" defaultValue="storefront" />
        <Input label="Production branch" defaultValue="main" />
        <Row justify="end" gap="tight">
          <Button emphasis="ghost" tone="neutral">Cancel</Button>
          <Button>Save changes</Button>
        </Row>
      </Stack>
    </Split>
  )
}

export function SplitMasterDetail() {
  const id = state('checkout')
  const shown = () => PROJECTS.find(p => p.id === id.value)!
  return (
    <Split width="nav" gap="group">
      <Stack gap="hair">
        {PROJECTS.slice(0, 6).map(p => <Toggle key={p.id} size="sm" pressed={id.value === p.id} onClick={() => (id.value = p.id)}>{p.name}</Toggle>)}
      </Stack>
      <Card>
        <Stack gap="related">
          <Row justify="between" gap="tight">
            <Heading level={3}>{shown().name}</Heading>
            <Badge tone={TONE_OF[shown().status]} dot>{shown().status}</Badge>
          </Row>
          <Text subtle>{shown().owner} looks after this one, in {shown().region}.</Text>
          <Grid min="xs" cols={3} gap="tight">
            <Stack gap="hair"><Text role="label" subtle>Deploys</Text><Text>{shown().deploys}</Text></Stack>
            <Stack gap="hair"><Text role="label" subtle>Uptime</Text><Text>{shown().uptime}%</Text></Stack>
            <Stack gap="hair"><Text role="label" subtle>Latency</Text><Text>{shown().latency} ms</Text></Stack>
          </Grid>
        </Stack>
      </Card>
    </Split>
  )
}

/* -- Center -- */

export const CenterPlay = (p: { max?: 'measure' | 'narrow' | 'content' | 'wide'; gutter?: boolean; intrinsic?: boolean }) => (
  <div>
    <Center max={p.max} gutter={p.gutter} intrinsic={p.intrinsic}>
      <Box tall={96}>A measured column</Box>
    </Center>
  </div>
)

const MAXES = ['narrow', 'measure', 'content'] as const

export const CenterWidths = () => (
  <Stack gap="related">
    {MAXES.map(max => <div key={max}><Center max={max}><Box>max="{max}"</Box></Center></div>)}
  </Stack>
)

export const CenterGutter = () => (
  <Inset>
    <Center gutter>
      <Box tall={72}>gutter keeps the page's side margin at any width</Box>
    </Center>
  </Inset>
)

export const CenterIntrinsic = () => (
  <Center max="narrow" intrinsic>
    <Stack gap="related" align="center">
      <Heading level={3}>Nothing failed this week</Heading>
      <Text subtle>intrinsic centres each child at its own width, and centres the text.</Text>
      <Button emphasis="outline" tone="neutral">See all deploys</Button>
    </Stack>
  </Center>
)

export const CenterArticle = () => (
  <Center max="measure">
    <Stack gap="related">
      <Heading level={3}>Lower stale windows at the edge</Heading>
      <Text subtle>By Jun Tanaka</Text>
      <Text>We moved the edge cache's stale window from two minutes to thirty seconds. Fresh pages now reach people sooner, and the origin barely noticed.</Text>
      <Text>Prose is easiest to read at about seventy characters a line, so articles sit in the measure rather than the page's full width.</Text>
    </Stack>
  </Center>
)

/* -- Cover -- */

// Cover fills the screen. A preview pins that "screen" to its own height.
const SCREEN = '--warp-viewport-block:360px;border:var(--warp-border-hairline) solid var(--warp-color-border);border-radius:var(--warp-radius-surface);padding-inline:var(--warp-space-group)'

export const CoverParts = () => (
  <Cover style={SCREEN}>
    <Box>Header hugs the top</Box>
    <Box data-part="center" tall={96}>data-part="center"</Box>
    <Box>Footer hugs the bottom</Box>
  </Cover>
)

const FILL = 'block-size:280px;border:var(--warp-border-hairline) solid var(--warp-color-border);border-radius:var(--warp-radius-surface);padding-inline:var(--warp-space-group)'

export const CoverFill = () => (
  <div style={FILL}>
    <Cover min="fill">
      <Box data-part="center">min="fill" takes its parent's height</Box>
    </Cover>
  </div>
)

export function CoverSignIn() {
  const sent = state(false)
  const send = (e: Event) => { e.preventDefault(); sent.value = true }
  return (
    <Cover style={`${SCREEN};--warp-viewport-block:520px`} gap="group">
      <Row justify="between" gap="tight">
        <Text role="heading">Tessel</Text>
        <Button emphasis="ghost" tone="neutral" size="sm">Help</Button>
      </Row>
      <Center data-part="center" max="narrow">
        {sent.value
          ? (
            <Stack gap="related" align="center">
              <Heading level={3}>Check your email</Heading>
              <Text subtle>We sent a sign-in link to you.</Text>
              <Button emphasis="ghost" tone="neutral" onClick={() => (sent.value = false)}>Use another address</Button>
            </Stack>
          )
          : (
            <Stack as="form" gap="group" onSubmit={send}>
              <Stack gap="hair">
                <Heading level={3}>Sign in to Tessel</Heading>
                <Text subtle>We'll email you a link. No password needed.</Text>
              </Stack>
              <Input label="Work email" type="email" required />
              <Button type="submit" full>Email me a link</Button>
            </Stack>
          )}
      </Center>
      <Text role="caption" subtle>© 2026 Tessel</Text>
    </Cover>
  )
}

export const CoverNotFound = () => (
  <Cover style={SCREEN}>
    <Center data-part="center" max="narrow" intrinsic>
      <Stack gap="related" align="center">
        <Text role="eyebrow" subtle>404</Text>
        <Heading level={3} role="title">No such project</Heading>
        <Text subtle>It may have been renamed, or you may not have access.</Text>
        <Button icon="arrow-left" emphasis="outline" tone="neutral">Back to projects</Button>
      </Stack>
    </Center>
  </Cover>
)

/* -- Frame -- */

export const FramePlay = (p: { ratio?: 'square' | '4:3' | '3:2' | '16:9' | '21:9' | '3:4' | '9:16' }) => (
  <Frame ratio={p.ratio} style="inline-size:min(100%,320px)">
    <Text subtle>{p.ratio}</Text>
  </Frame>
)

const RATIOS = ['21:9', '16:9', '3:2', '4:3', 'square', '3:4'] as const

export const FrameRatios = () => (
  <Grid min="xs" cols={6} gap="related">
    {RATIOS.map(ratio => (
      <Frame key={ratio} ratio={ratio}>
        <Text role="caption" subtle>{ratio}</Text>
      </Frame>
    ))}
  </Grid>
)

const art = (a: string, b: string) => (
  <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="320" height="180" fill={`var(--warp-color-data-${a})`} />
    <circle cx="96" cy="150" r="130" fill={`var(--warp-color-data-${b})`} />
    <rect x="176" y="36" width="104" height="108" rx="8" fill="var(--warp-color-surface)" opacity="0.85" />
  </svg>
)

export const FrameMedia = () => (
  <Grid min="xs" cols={3} gap="related">
    <Frame>{art('1', '3')}</Frame>
    <Frame ratio="square">{art('2', '5')}</Frame>
    <Frame ratio="3:4">{art('4', '7')}</Frame>
  </Grid>
)

export const FramePreviews = () => (
  <Grid min="sm" cols={3} gap="related">
    {DEPLOYS.slice(0, 3).map((d, n) => (
      <Card key={d.id}>
        <Stack gap="related">
          <Frame ratio="16:9">{art(String(n + 1), String(n + 4))}</Frame>
          <Stack gap="hair">
            <Text role="heading">{d.project}</Text>
            <Text role="caption" subtle>{d.message}</Text>
          </Stack>
        </Stack>
      </Card>
    ))}
  </Grid>
)

/* -- Inset -- */

export const InsetPlay = (p: { pad?: 'group' | 'section' }) => (
  <div style="inline-size:min(100%,420px)">
    <Inset pad={p.pad}>
      <Box>The sunken area is the Inset</Box>
    </Inset>
  </div>
)

export const InsetPads = () => (
  <Grid min="sm" cols={2} gap="group">
    <Inset><Box>pad="group", the default</Box></Inset>
    <Inset pad="section"><Box>pad="section"</Box></Inset>
  </Grid>
)

const LOG = ['16:42:01  Cloning 9f3ac21', '16:42:09  Installing dependencies', '16:42:48  Building storefront', '16:44:03  Live in eu-west']

export const InsetBuildLog = () => (
  <Card title="Build output">
    <Inset>
      <Stack gap="hair">
        {LOG.map(line => <Text key={line} role="code">{line}</Text>)}
      </Stack>
    </Inset>
  </Card>
)

export const InsetInvoiceTotal = () => (
  <Stack gap="related">
    <Text role="heading">Next invoice</Text>
    <Text subtle>Billed on 1 November to the card ending 4242.</Text>
    <Inset>
      <Stack gap="tight">
        <Row justify="between"><Text subtle>Compute</Text><Text>$7,410</Text></Row>
        <Row justify="between"><Text subtle>Bandwidth</Text><Text>$1,120</Text></Row>
        <Row justify="between"><Text subtle>Seats</Text><Text>$400</Text></Row>
        <Row justify="between"><Text role="label">Total</Text><Text role="label">$8,930</Text></Row>
      </Stack>
    </Inset>
  </Stack>
)

/* -- Spacer -- */

export const SpacerInRow = () => (
  <Inset>
    <Row gap="tight">
      <Box>Left</Box>
      <Box>Left</Box>
      <Spacer />
      <Box>Pushed to the end</Box>
    </Row>
  </Inset>
)

export const SpacerInStack = () => (
  <Inset>
    <Stack gap="tight" style="block-size:200px">
      <Box>Top</Box>
      <Spacer />
      <Box>Pushed to the bottom</Box>
    </Stack>
  </Inset>
)

export const SpacerTwo = () => (
  <Inset>
    <Row gap="tight">
      <Box>Start</Box>
      <Spacer />
      <Box>Middle</Box>
      <Spacer />
      <Box>End</Box>
    </Row>
  </Inset>
)

export function SpacerToolbar() {
  const view = state('all')
  return (
    <Row gap="related">
      <Segmented size="sm" label="Show" value={view.value} options={VIEWS} onChange={v => (view.value = v)} />
      <Spacer />
      <Button emphasis="ghost" tone="neutral" icon="download">Export</Button>
      <Button icon="plus">New project</Button>
    </Row>
  )
}

const VIEWS = [{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'failed', label: 'Failed' }]

export const SpacerCardFooter = () => (
  <Grid min="sm" cols={2} gap="related">
    <Card>
      <Stack gap="related" style="block-size:100%">
        <Text role="heading">Pro</Text>
        <Text subtle>Up to 20 projects.</Text>
        <Spacer />
        <Button emphasis="outline" tone="neutral" full>Current plan</Button>
      </Stack>
    </Card>
    <Card>
      <Stack gap="related" style="block-size:100%">
        <Text role="heading">Scale</Text>
        <Text subtle>Unlimited projects, private regions, audit logs and a named contact who answers within the hour.</Text>
        <Spacer />
        <Button full>Upgrade</Button>
      </Stack>
    </Card>
  </Grid>
)

/* -- Shell -- */

// A shell fills the screen, so a preview sets what "the screen" means: a height, and a box that holds its overlays.
function AppWindow({ height, wide, children }: { height: number; wide?: number; children?: any }) {
  const box = () => `--warp-viewport-block:${height}px;block-size:${height}px;${wide ? `inline-size:min(100%,${wide}px);margin-inline:auto;` : ''}overflow:auto;contain:layout paint;border:var(--warp-border-hairline) solid var(--warp-color-border);border-radius:var(--warp-radius-surface)`
  return <div style={box()}>{children}</div>
}

const MARK = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2" fill="var(--warp-color-accent-solid)" /><rect x="13" y="13" width="8" height="8" rx="2" fill="var(--warp-color-accent-solid)" /></svg>
const ME = PEOPLE[0]
const ACCOUNT = { name: ME.name, email: ME.email, initials: ME.initials, items: [{ label: 'Profile', icon: 'user' }, { label: 'Preferences', icon: 'settings' }, 'separator', { label: 'Sign out', icon: 'log-out', tone: 'critical' }] } as any

function tesselNav(go: (id: string) => void) {
  const item = (id: string, label: string, icon: string, count?: number) => ({ id, label, icon: icon as any, count, onSelect: () => go(id) })
  return [
    { label: 'Workspace', items: [item('projects', 'Projects', 'layers'), item('deploys', 'Deploys', 'rocket', 2), item('activity', 'Activity', 'activity'), item('team', 'Team', 'users'), item('billing', 'Billing', 'folder')] },
    { label: 'Saved views', items: [item('failed', 'Failed builds', 'filter', 1)] },
  ]
}

const pageOf: Record<string, string> = { projects: 'Projects', deploys: 'Deploys', activity: 'Activity', team: 'Team', billing: 'Billing', failed: 'Failed builds', settings: 'Settings' }

export function ShellApp() {
  const page = state('projects')
  const nav = tesselNav(id => (page.value = id))
  return (
    <AppWindow height={600}>
      <Shell
        island
        label="Tessel"
        brand={{ name: 'Tessel', mark: <MARK /> }}
        title={pageOf[page.value]}
        crumbs={[{ label: 'Acme', href: '#' }, { label: pageOf[page.value] }]}
        nav={nav}
        foot={[{ id: 'settings', label: 'Settings', icon: 'settings', onSelect: () => (page.value = 'settings') }]}
        current={page.value}
        actions={<Button size="sm" icon="rocket">Deploy</Button>}
        account={ACCOUNT}
      >
        <Heading level={1} role="heading">{pageOf[page.value]}</Heading>
        <Grid min="sm" gap="related">
          {PROJECTS.slice(0, 6).map(p => (
            <Card key={p.id}>
              <Stack gap="hair">
                <Row justify="between" gap="tight"><Text role="label">{p.name}</Text><Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge></Row>
                <Text role="caption" subtle>{p.region} · {p.latency} ms</Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Shell>
    </AppWindow>
  )
}

export function ShellRail() {
  const page = state('deploys')
  const folded = state<boolean | 'hidden'>(true)
  const nav = tesselNav(id => (page.value = id))
  return (
    <AppWindow height={420}>
      <Shell island label="Tessel" brand={{ name: 'Tessel', mark: <MARK /> }} crumbs={[{ label: pageOf[page.value] }]} nav={nav} current={page.value} collapsed={folded} account={ACCOUNT}>
        <Heading level={1} role="heading">{pageOf[page.value]}</Heading>
        <Text subtle>The rail keeps icons and short labels. Its toggle opens the full sidebar.</Text>
      </Shell>
    </AppWindow>
  )
}

export function ShellPhone() {
  const page = state('projects')
  const nav = tesselNav(id => (page.value = id))
  return (
    <AppWindow height={560} wide={375}>
      <Shell island label="Tessel" brand={{ name: 'Tessel', mark: <MARK /> }} title={pageOf[page.value]} nav={nav} current={page.value} account={ACCOUNT}>
        <Heading level={1} role="heading">{pageOf[page.value]}</Heading>
        <Stack divided gap="related">
          {PROJECTS.slice(0, 5).map(p => <Row key={p.id} justify="between" gap="tight"><Text>{p.name}</Text><Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge></Row>)}
        </Stack>
      </Shell>
    </AppWindow>
  )
}

const ROOT_NAV = tesselNav(() => {})

export function ShellChildPage() {
  const left = state(false)
  return (
    <AppWindow height={420} wide={375}>
      <Shell island label="Tessel" depth="child" title="storefront" back={{ label: 'Back to projects', onClick: () => (left.value = !left.value) }} brand={{ name: 'Tessel' }} nav={ROOT_NAV} current="projects">
        <Heading level={1} role="heading">storefront</Heading>
        <Text subtle>{left.value ? 'Back pressed. A real app would route to the list here.' : 'On a phone, a child page swaps the brand for a back button.'}</Text>
      </Shell>
    </AppWindow>
  )
}

export function ShellFocus() {
  const step = state(1)
  const next = () => (step.value = step.value === 3 ? 1 : step.value + 1)
  return (
    <AppWindow height={420}>
      <Shell island label="New project" variant="focus" title="New project" step={`Step ${step.value} of 3`} close={{ label: 'Close', onClick: () => (step.value = 1) }} dock={<Button onClick={next}>{step.value === 3 ? 'Create project' : 'Continue'}</Button>}>
        <Heading level={1} role="heading">{FOCUS_STEPS[step.value - 1]}</Heading>
        <Input label="Repository" defaultValue="tessel/storefront" />
      </Shell>
    </AppWindow>
  )
}

const FOCUS_STEPS = ['Connect a repository', 'Choose a region', 'Check your settings']

/* -- Index tiles -- */

export const GridTile = () => <Grid cols={3} min="xs" gap="related">{SIX.map(n => <Box key={n} tall={64}>{n}</Box>)}</Grid>

export const StackTile = () => <Stack gap="related">{['One', 'Two', 'Three'].map(n => <Box key={n}>{n}</Box>)}</Stack>

export const RowTile = () => <Row gap="related" justify="center"><Box>One</Box><Box>Two</Box><Box>Three</Box></Row>

export const SplitTile = () => (
  <Split width="rail" gap="related" style="grid-template-columns:30% minmax(0,1fr)">
    <Box tall={140}>Side</Box>
    <Box tall={140}>Main</Box>
  </Split>
)

export const FrameTile = () => <Frame ratio="21:9"><Box>21:9</Box></Frame>
