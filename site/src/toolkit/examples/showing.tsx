import { onCleanup, state } from 'weft'
import { Badge, Button, Card, Code, CodeBlock, Grid, Heading, Icon, Input, Kbd, Markdown, Row, Segmented, Snippet, Stack, Tag, Text, Ticker } from '@weft/warp'
import { DEPLOYS, PROJECTS, TONE_OF } from '../world'

export const CardPlay = (p: { eyebrow: string; title: string; press: boolean; sweep: boolean }) => (
  <Stack>
    <Card eyebrow={p.eyebrow} title={p.title} sweep={p.sweep} onClick={p.press ? () => {} : undefined}>
      <Text subtle>Live in eu-west, updated 2 minutes ago.</Text>
    </Card>
  </Stack>
)

export const CardStatic = () => (
  <Card eyebrow="Project" title="storefront">
    <Text subtle>Live in eu-west, updated 2 minutes ago.</Text>
  </Card>
)

export const CardLink = () => (
  <Card href="/toolkit/button" eyebrow="Guide" title="Roll back a deploy">
    <Text subtle>Promote any earlier deploy in about ten seconds.</Text>
  </Card>
)

const PLANS = ['Team', 'Scale']

export function CardPress() {
  const picked = state('Team')
  return (
    <Grid cols={2} gap="related">
      {PLANS.map(plan => (
        <Card key={plan} eyebrow={picked.value === plan ? 'Selected' : 'Plan'} title={plan} aria-pressed={picked.value === plan ? 'true' : 'false'} onClick={() => (picked.value = plan)}>
          <Text subtle>{plan === 'Team' ? '$40 a month' : '$120 a month'}</Text>
        </Card>
      ))}
    </Grid>
  )
}

export const CardBare = () => (
  <Card sweep={false}>
    <Text>No eyebrow, no title and no sweep. Just a surface for what you put in it.</Text>
  </Card>
)

export const CardStats = () => (
  <Grid min="xs" gap="related">
    <Card eyebrow="Requests" title="86.1M"><Text role="caption" tone="positive">Up 8.6% on September</Text></Card>
    <Card eyebrow="Errors" title="0.22%"><Text role="caption" tone="positive">Down from 0.36%</Text></Card>
    <Card eyebrow="Deploys" title="167"><Text role="caption" subtle>About 5 a day</Text></Card>
    <Card eyebrow="Spend" title="$8,930"><Text role="caption" subtle>Up $370</Text></Card>
  </Grid>
)

export const CardProjectGrid = () => (
  <Grid min="sm" gap="related">
    {PROJECTS.slice(0, 6).map(p => (
      <Card key={p.id} href="/toolkit/card" eyebrow={p.region} title={p.name}>
        <Row justify="between">
          <Text role="caption" subtle>{p.deploys} deploys</Text>
          <Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge>
        </Row>
      </Card>
    ))}
  </Grid>
)

export const BadgePlay = (p: { children: string; tone: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'; emphasis: 'soft' | 'solid' | 'outline'; dot: boolean; count: boolean }) => (
  <Badge tone={p.tone} emphasis={p.emphasis} dot={p.dot} count={p.count}>{p.children}</Badge>
)

const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const

export const BadgeTones = () => <>{TONES.map(tone => <Badge key={tone} tone={tone}>Status</Badge>)}</>

export const BadgeEmphasis = () => (
  <>
    <Badge tone="positive">Status</Badge>
    <Badge tone="positive" emphasis="solid">Status</Badge>
    <Badge tone="positive" emphasis="outline">Status</Badge>
  </>
)

export const BadgeDot = () => (
  <>
    <Badge tone="positive" dot>Live</Badge>
    <Badge tone="info" dot>Building</Badge>
    <Badge tone="critical" dot>Failed</Badge>
    <Badge tone="neutral" dot>Paused</Badge>
  </>
)

export const BadgeCount = () => (
  <>
    <Badge count tone="accent" srText="unread comments">3</Badge>
    <Badge count tone="critical" emphasis="solid" srText="failed deploys">12</Badge>
    <Badge count emphasis="outline" srText="open reviews">99+</Badge>
  </>
)

export const BadgeProjectList = () => (
  <Stack gap="related" divided>
    {PROJECTS.slice(2, 7).map(p => (
      <Row key={p.id} justify="between" gap="group">
        <Stack gap="hair"><Text>{p.name}</Text><Text role="caption" subtle>{p.owner}</Text></Stack>
        <Badge tone={TONE_OF[p.status]} dot>{p.status}</Badge>
      </Row>
    ))}
  </Stack>
)

export const BadgeOnAButton = () => (
  <Button emphasis="outline" tone="neutral" icon="bell">Alerts <Badge count tone="critical" emphasis="solid" srText="new">2</Badge></Button>
)

export const TagPlay = (p: { children: string; tone: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'; swatch: boolean; removable: boolean }) => (
  <Tag tone={p.tone} swatch={p.swatch} onRemove={p.removable ? () => {} : undefined}>{p.children}</Tag>
)

export const TagPlain = () => (
  <>
    <Tag>frontend</Tag>
    <Tag>eu-west</Tag>
    <Tag>needs review</Tag>
  </>
)

export const TagTones = () => <>{TONES.map(tone => <Tag key={tone} tone={tone}>Label</Tag>)}</>

export const TagSwatches = () => (
  <>
    <Tag tone="accent" swatch>Web</Tag>
    <Tag tone="positive" swatch>Platform</Tag>
    <Tag tone="caution" swatch>Data</Tag>
    <Tag tone="info" swatch>Mobile</Tag>
  </>
)

export function TagRemovable() {
  const tags = state(['frontend', 'eu-west', 'needs review'])
  return (
    <>
      {tags.value.map(t => <Tag key={t} label={t} onRemove={() => (tags.value = tags.value.filter(x => x !== t))}>{t}</Tag>)}
      {!tags.value.length && <Button size="sm" emphasis="ghost" tone="neutral" onClick={() => (tags.value = ['frontend', 'eu-west', 'needs review'])}>Put them back</Button>}
    </>
  )
}

export function TagAddToProject() {
  const tags = state(['frontend', 'checkout'])
  const draft = state('')
  const add = (e: Event) => {
    e.preventDefault()
    const name = draft.value.trim()
    if (name && !tags.value.includes(name)) tags.value = [...tags.value, name]
    draft.value = ''
  }
  return (
    <Stack as="form" gap="related" onSubmit={add}>
      <Input label="Add a label" placeholder="Type and press Enter" value={draft.value} onInput={(e: Event) => (draft.value = (e.target as HTMLInputElement).value)} />
      <Row gap="tight">
        {tags.value.map(t => <Tag key={t} label={t} onRemove={() => (tags.value = tags.value.filter(x => x !== t))}>{t}</Tag>)}
      </Row>
    </Stack>
  )
}

export const KbdPlay = (p: { children: string }) => <Kbd>{p.children}</Kbd>

export const KbdKeys = () => (
  <>
    <Kbd>⌘</Kbd>
    <Kbd>Shift</Kbd>
    <Kbd>Esc</Kbd>
    <Kbd>Enter</Kbd>
    <Kbd>↑</Kbd>
  </>
)

export const KbdCombo = () => <Row gap="hair"><Kbd>⌘</Kbd><Kbd>Shift</Kbd><Kbd>P</Kbd></Row>

export const KbdInSentence = () => <Text>Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search, or <Kbd>Esc</Kbd> to close.</Text>

const SHORTCUTS = [
  { keys: ['⌘', 'K'], does: 'Search commands' },
  { keys: ['⌘', 'D'], does: 'Deploy' },
  { keys: ['G', 'L'], does: 'Go to logs' },
  { keys: ['?'], does: 'Show this list' },
]

export const KbdShortcutList = () => (
  <Stack gap="related" divided>
    {SHORTCUTS.map(s => (
      <Row key={s.does} justify="between" gap="group">
        <Text>{s.does}</Text>
        <Row gap="hair">{s.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</Row>
      </Row>
    ))}
  </Stack>
)

export const TickerPlay = (p: { value: number; style: 'decimal' | 'currency' | 'percent' }) => (
  <Text role="title"><Ticker value={p.style === 'percent' ? p.value / 100000 : p.value} locale="en-US" format={p.style === 'currency' ? { style: 'currency', currency: 'USD' } : p.style === 'percent' ? { style: 'percent', maximumFractionDigits: 1 } : undefined} /></Text>
)

export function TickerStep() {
  const n = state(412)
  return (
    <Row gap="related">
      <Text role="title"><Ticker value={n.value} locale="en-US" /></Text>
      <Button size="sm" emphasis="outline" tone="neutral" onClick={() => (n.value += 1)}>Deploy</Button>
      <Button size="sm" emphasis="outline" tone="neutral" onClick={() => (n.value += 88)}>Add 88</Button>
    </Row>
  )
}

export function TickerFormats() {
  const k = state(0)
  const roll = () => (k.value = k.value ? 0 : 1)
  return (
    <Stack gap="related" align="center">
      <Row gap="section">
        <Text role="heading"><Ticker value={k.value ? 8930 : 8560} locale="en-US" format={{ style: 'currency', currency: 'USD' }} /></Text>
        <Text role="heading"><Ticker value={k.value ? 0.9998 : 0.9942} locale="en-US" format={{ style: 'percent', maximumFractionDigits: 2 }} /></Text>
        <Text role="heading"><Ticker value={k.value ? 86100000 : 79300000} locale="en-US" format={{ notation: 'compact' }} /></Text>
      </Row>
      <Button size="sm" emphasis="ghost" tone="neutral" onClick={roll}>Change the numbers</Button>
    </Stack>
  )
}

export function TickerLiveTraffic() {
  const rate = state(18420)
  const errors = state(41)
  const timer = setInterval(() => {
    rate.value += Math.round(Math.random() * 120 - 50)
    errors.value = Math.max(0, errors.value + Math.round(Math.random() * 4 - 2))
  }, 1400)
  onCleanup(() => clearInterval(timer))
  return (
    <Grid min="xs" gap="related">
      <Card eyebrow="Requests a minute"><Text role="title"><Ticker value={rate.value} locale="en-US" /></Text></Card>
      <Card eyebrow="Errors a minute"><Text role="title"><Ticker value={errors.value} locale="en-US" /></Text></Card>
    </Grid>
  )
}

const LOOK = ['rocket', 'clock', 'server', 'globe', 'activity', 'bell', 'user', 'users', 'settings', 'database', 'cloud', 'terminal', 'shield', 'key', 'lock', 'search', 'filter', 'download', 'upload', 'external', 'copy', 'trash', 'pencil', 'star'] as const

export const IconPlay = (p: { name: string; size: number; solid: boolean }) => <Icon name={p.name as any} size={p.size} solid={p.solid} />

export const IconSet = () => <Grid min="xs" gap="group">{LOOK.map(name => <Stack key={name} gap="tight" align="center"><Icon name={name} size={24} /><Text role="caption" subtle>{name}</Text></Stack>)}</Grid>

export const IconSizes = () => (
  <>
    <Icon name="rocket" size={16} />
    <Icon name="rocket" size={24} />
    <Icon name="rocket" size={32} />
    <Icon name="rocket" size={48} />
  </>
)

export const IconSolid = () => (
  <>
    <Icon name="star" size={32} />
    <Icon name="star" size={32} solid />
    <Icon name="bell" size={32} />
    <Icon name="bell" size={32} solid />
  </>
)

export const IconAction = () => (
  <>
    <Icon name="bell" size={32} action />
    <Icon name="trash" size={32} action />
    <Icon name="refresh" size={32} action />
    <Icon name="check" size={32} action="on" />
  </>
)

export const IconLabelled = () => <Row gap="related"><Icon name="alert-circle" size={24} label="Failed" /><Text>mobile-bff</Text></Row>

const FACTS = [
  { icon: 'globe', says: 'Served from 5 regions' },
  { icon: 'shield', says: 'Certificates renewed for you' },
  { icon: 'clock', says: 'Roll back in ten seconds' },
  { icon: 'activity', says: 'Live logs on every deploy' },
] as const

export const IconFeatureList = () => (
  <Stack gap="related">
    {FACTS.map(f => <Row key={f.says} gap="related"><Icon name={f.icon} size={20} /><Text>{f.says}</Text></Row>)}
  </Stack>
)

export const HeadingPlay = (p: { children: string; level: 1 | 2 | 3 | 4 | 5 | 6; role: 'auto' | 'display' | 'title' | 'heading' | 'label' }) => (
  <Heading level={p.level} role={p.role === 'auto' ? undefined : p.role}>{p.children}</Heading>
)

export const HeadingLevels = () => (
  <Stack gap="related">
    <Heading level={1}>Project settings</Heading>
    <Heading level={2}>Project settings</Heading>
    <Heading level={3}>Project settings</Heading>
    <Heading level={4}>Project settings</Heading>
  </Stack>
)

export const HeadingRoles = () => (
  <Stack gap="related">
    <Heading level={2} role="display">Ship it</Heading>
    <Heading level={2} role="title">Ship it</Heading>
    <Heading level={2} role="heading">Ship it</Heading>
    <Heading level={2} role="label">Ship it</Heading>
  </Stack>
)

export const HeadingPageTop = () => (
  <Stack gap="section">
    <Stack gap="tight">
      <Heading level={1}>Deploys</Heading>
      <Text subtle>Everything shipped to storefront this month.</Text>
    </Stack>
    <Stack gap="tight">
      <Heading level={2}>Failed</Heading>
      <Text subtle>Retry timed out upstream calls, by Sam Okafor.</Text>
    </Stack>
    <Stack gap="tight">
      <Heading level={2}>Live</Heading>
      <Text subtle>Cache product images at the edge, by Priya Raman.</Text>
    </Stack>
  </Stack>
)

export const TextPlay = (p: { children: string; role: 'body' | 'display' | 'title' | 'heading' | 'label' | 'caption' | 'eyebrow' | 'code'; ink: 'normal' | 'subtle' | 'faint'; tone: 'none' | 'accent' | 'positive' | 'caution' | 'critical' | 'info' }) => (
  <Text role={p.role} subtle={p.ink === 'subtle'} faint={p.ink === 'faint'} tone={p.tone === 'none' ? undefined : p.tone}>{p.children}</Text>
)

export const TextRoles = () => (
  <Stack gap="related">
    <Text role="display">Display</Text>
    <Text role="title">Title</Text>
    <Text role="heading">Heading</Text>
    <Text role="body">Body</Text>
    <Text role="label">Label</Text>
    <Text role="caption">Caption</Text>
    <Text role="eyebrow">Eyebrow</Text>
    <Text role="code">Code</Text>
  </Stack>
)

export const TextInk = () => (
  <Stack gap="tight">
    <Text>Deployed two minutes ago.</Text>
    <Text subtle>Deployed two minutes ago.</Text>
    <Text faint>Deployed two minutes ago.</Text>
  </Stack>
)

export const TextTones = () => (
  <Stack gap="tight">
    <Text tone="accent">Deployed two minutes ago.</Text>
    <Text tone="positive">Deployed two minutes ago.</Text>
    <Text tone="caution">Deployed two minutes ago.</Text>
    <Text tone="critical">Deployed two minutes ago.</Text>
  </Stack>
)

export const TextInline = () => <Text>Uptime is <Text inline tone="positive">99.98%</Text> this month, <Text inline subtle>up from 99.91%</Text>.</Text>

export const TextDeployNote = () => (
  <Stack gap="tight">
    <Text role="eyebrow" subtle>Deploy d-4819</Text>
    <Text role="heading">Retry timed out upstream calls</Text>
    <Text subtle>Sam Okafor pushed this to main. It stopped at the health check after four minutes.</Text>
    <Text role="caption" tone="critical">Failed, 31 October at 15:27</Text>
  </Stack>
)

export const CodePlay = (p: { children: string }) => <Text>Run <Code>{p.children}</Code> to start.</Text>

export const CodeInSentence = () => <Text>Set <Code>TESSEL_TOKEN</Code> before you run <Code>tessel deploy</Code>.</Text>

export const CodeNames = () => (
  <>
    <Code>main</Code>
    <Code>9f3ac21</Code>
    <Code>eu-west</Code>
  </>
)

export const CodeOnACard = () => (
  <Card eyebrow="Latest" title="Cache product images at the edge">
    <Text subtle>Deployed <Code>9f3ac21</Code> from <Code>main</Code> to <Code>eu-west</Code>.</Text>
  </Card>
)

const CONFIG = `import { defineProject } from 'tessel'

export default defineProject({
  name: 'storefront',
  regions: ['eu-west', 'us-east'],
  build: 'npm run build',
})`

export const CodeBlockPlay = (p: { filename: string; lines: boolean; wrap: boolean; language: string }) => <CodeBlock code={CONFIG} filename={p.filename || undefined} lines={p.lines} wrap={p.wrap} language={p.language} />

export const CodeBlockBasic = () => <CodeBlock code={CONFIG} language="ts" />

export const CodeBlockFilename = () => <CodeBlock code={CONFIG} language="ts" filename="tessel.config.ts" />

export const CodeBlockLines = () => <CodeBlock code={CONFIG} language="ts" lines />

export const CodeBlockWrap = () => <CodeBlock wrap language="sh" code="tessel deploy --project storefront --region eu-west --region us-east --message 'Cache product images at the edge' --wait" />

const SAMPLE = JSON.stringify(DEPLOYS[0], null, 2)

export const CodeBlockJson = () => <CodeBlock language="json" filename="deploy.json" code={SAMPLE} />

const STACKS: Record<string, string> = {
  ts: `const res = await tessel.deploy({ project: 'storefront' })\nconsole.log(res.url)`,
  sh: `tessel deploy --project storefront`,
  json: `{ "project": "storefront" }`,
}
const WAYS = [{ value: 'ts', label: 'SDK' }, { value: 'sh', label: 'CLI' }, { value: 'json', label: 'API' }]

export function CodeBlockChooser() {
  const way = state('ts')
  return (
    <Stack gap="related">
      <Segmented label="How to deploy" size="sm" value={way.value} onChange={v => (way.value = v)} options={WAYS} />
      {way.value === 'ts' && <CodeBlock code={STACKS.ts} language="ts" />}
      {way.value === 'sh' && <CodeBlock code={STACKS.sh} language="sh" />}
      {way.value === 'json' && <CodeBlock code={STACKS.json} language="json" />}
    </Stack>
  )
}

export const SnippetPlay = (p: { code: string; prompt: string }) => <Stack><Snippet code={p.code} prompt={p.prompt} /></Stack>

export const SnippetInstall = () => <Snippet code="npm install -g tessel" />

export const SnippetPrompts = () => (
  <Stack gap="related">
    <Snippet code="tessel deploy" />
    <Snippet prompt="#" code="systemctl restart tessel-agent" />
    <Snippet prompt="" code="https://storefront.tessel.app" />
  </Stack>
)

export const SnippetGetStarted = () => (
  <Stack gap="group">
    <Stack gap="tight"><Text role="label">1. Install the CLI</Text><Snippet code="npm install -g tessel" /></Stack>
    <Stack gap="tight"><Text role="label">2. Sign in</Text><Snippet code="tessel login" /></Stack>
    <Stack gap="tight"><Text role="label">3. Ship it</Text><Snippet code="tessel deploy" /></Stack>
  </Stack>
)

const NOTES = `## October release

Previews now **stay up** for 30 days after a branch is deleted. See the [guide](/docs) for more.

- Lower stale window on \`edge-cache\`
- Apple Pay in \`checkout\`
- Seat changes are prorated

> Requests are up 8.6% on September.`

export const MarkdownPlay = (p: { source: string }) => <Markdown source={p.source} />

export const MarkdownNotes = () => <Markdown source={NOTES} />

const TABLE = `| Region | Requests | Share |
| --- | ---: | ---: |
| eu-west | 34.2M | 40% |
| us-east | 24.8M | 29% |
| ap-south | 12.1M | 14% |`

export const MarkdownTable = () => <Markdown source={TABLE} />

const SNIPPET = `Add this to your project:

\`\`\`ts
export default { name: 'storefront' }
\`\`\``

export const MarkdownCode = () => <Markdown source={SNIPPET} />

export const MarkdownNewTab = () => <Markdown linkTarget="_blank" source="Read the [status page](https://example.com) before you deploy." />

export const MarkdownSafe = () => <Markdown source={'Raw HTML shows as text: <script>alert("no")</script>'} />

const COMMENT = `Looks good. Two things before we ship:

1. **Rename** the flag to \`use_edge_images\`
2. Add a test for the _empty cart_`

export const MarkdownComment = () => (
  <Card eyebrow="Priya Raman, on d-4821">
    <Markdown source={COMMENT} />
  </Card>
)
