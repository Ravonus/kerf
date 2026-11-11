import {
  Card,
  Grid,
  Row,
  Stack,
  Switch,
  Text,
} from '@kerf/veneer'
import { DEPLOYS } from '../../world'

export const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'deploys', label: 'Deploys' },
  { value: 'logs', label: 'Logs' },
  { value: 'settings', label: 'Settings' },
]

export const WORDS: Record<string, string> = {
  overview:
    'storefront is live in eu-west with ' +
    '412 deploys so far.',
  deploys:
    'The last deploy took two minutes and ' +
    'is serving traffic.',
  logs: 'No errors in the last hour.',
  settings: 'Deploys run on every push to main.',
}

export const REGIONS = [
  'eu-west',
  'eu-north',
  'us-east',
  'us-west',
  'ap-south',
  'ap-east',
  'sa-east',
  'af-south',
  'me-central',
].map((r) => ({ value: r, label: r }))

export const PLANNED = [
  { value: 'general', label: 'General' },
  { value: 'domains', label: 'Domains' },
  {
    value: 'sso',
    label: 'Single sign-on',
    disabled: true,
  },
]

export const FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'Live', label: 'Live' },
  { value: 'Building', label: 'Building' },
  { value: 'Failed', label: 'Failed' },
]

export const panel = (view: string) => {
  if (view === 'overview')
    return (
      <Grid
        min="xs"
        gap="related"
      >
        <Card
          eyebrow="Uptime"
          title="99.98%"
        />
        <Card
          eyebrow="Latency"
          title="84 ms"
        />
        <Card
          eyebrow="This month"
          title="$1,240"
        />
      </Grid>
    )
  if (view === 'deploys')
    return (
      <Stack gap="related">
        {DEPLOYS.slice(0, 3).map((d) => (
          <Row
            key={d.id}
            justify="between"
            gap="group"
          >
            <Text>{d.message}</Text>
            <Text
              role="code"
              subtle
            >
              {d.commit}
            </Text>
          </Row>
        ))}
      </Stack>
    )
  if (view === 'logs')
    return (
      <Text
        role="code"
        subtle
      >
        16:42 Deployed 9f3ac21 in 2m 04s
      </Text>
    )
  return (
    <Switch defaultChecked>
      Deploy every push to main
    </Switch>
  )
}

export const QUESTIONS = [
  {
    value: 'rollback',
    title: 'How do I roll back a deploy?',
    content:
      'Open the deploy you want and press ' +
      'Promote. Traffic moves over in about ten seconds.',
  },
  {
    value: 'domains',
    title: 'Can I bring my own domain?',
    content:
      'Yes. Add it under Settings, then ' +
      'point a CNAME at kerf.app.',
  },
  {
    value: 'bill',
    title: 'What counts towards my bill?',
    content:
      'Requests and build minutes. Preview ' +
      'deploys are free.',
  },
]

export const PAGES = [
  'Overview',
  'Deploys',
  'Logs',
  'Settings',
]

export function ProjectRow({
  name,
  owner,
}: {
  name: string
  owner: string
}) {
  return (
    <Row
      justify="between"
      gap="group"
    >
      <Text>{name}</Text>
      <Text subtle>{owner}</Text>
    </Row>
  )
}

export const GUIDE = [
  {
    title: 'Start here',
    pinned: true,
    items: [{ href: '#guide', label: 'Overview' }],
  },
  {
    title: 'Projects',
    items: [
      { href: '#create', label: 'Create a project' },
      { href: '#invite', label: 'Invite your team' },
      { href: '#archive', label: 'Archive a project' },
    ],
  },
  {
    title: 'Deploys',
    items: [
      {
        href: '#first-deploy',
        label: 'Your first deploy',
      },
      { href: '#previews', label: 'Preview deploys' },
      { href: '#rollback', label: 'Roll back' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { href: '#plans', label: 'Plans' },
      { href: '#invoices', label: 'Invoices' },
    ],
  },
]

export const follow =
  (at: { value: string }) => (e: MouseEvent) => {
    const a = (e.target as Element).closest?.('a')
    if (!a) return
    e.preventDefault()
    at.value = a.getAttribute('href') ?? at.value
  }
