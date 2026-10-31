// The table and shell at full stretch, for the a11y suite (test/a11y) and a look in a browser: every feature on, plus
// the states a table can be in. Separate from Variants so a markup snapshot isn't tied to demo data.
import { state } from 'weft'
import { Badge } from '../../src/Badge'
import { Button } from '../../src/Button'
import { Shell } from '../../src/Shell'
import { Table, type Column } from '../../src/Table'

type Project = { id: string; name: string; code: string; status: string; owner: string; region: string; budget: number; used: number }
const tones: Record<string, 'positive' | 'caution' | 'neutral'> = { Live: 'positive', Paused: 'caution', Draft: 'neutral' }
export const projects: Project[] = [
  { id: 'p1', name: 'Apollo', code: 'APL-214', status: 'Live', owner: 'Ana Ruiz', region: 'eu-west', budget: 48000, used: 62 },
  { id: 'p2', name: 'Borealis', code: 'BOR-031', status: 'Paused', owner: 'Jo Park', region: 'us-east', budget: 12500, used: 91 },
  { id: 'p3', name: 'Cirrus', code: 'CIR-118', status: 'Live', owner: 'Sam Lee', region: 'ap-south', budget: 30400, used: 44 },
  { id: 'p4', name: 'Delta', code: 'DEL-007', status: 'Draft', owner: 'Ana Ruiz', region: 'eu-west', budget: 8200, used: 12 },
  { id: 'p5', name: 'Ember', code: 'EMB-090', status: 'Live', owner: 'Noor Ali', region: 'us-west', budget: 22100, used: 78 },
  { id: 'p6', name: 'Fathom', code: 'FAT-302', status: 'Paused', owner: 'Jo Park', region: 'eu-north', budget: 5600, used: 33 },
]
const money = (n: number) => `$${n.toLocaleString('en-US')}`
export const columns: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, sort: true, resize: true, card: 'title', cell: r => <><span data-part="primary">{r.name}</span><span data-part="secondary">{r.code}</span></> },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: r => <Badge tone={tones[r.status]}>{r.status}</Badge> },
  { id: 'owner', header: 'Owner', sort: true, resize: true },
  { id: 'region', header: 'Region', sort: true, priority: 3, cell: r => <span data-part="mono">{r.region}</span> },
  { id: 'budget', header: 'Budget', numeric: true, sort: true, priority: 2, edit: t => Number(t.replace(/[^\d.]/g, '')), validate: v => v > 0 || 'Budget must be above zero', cell: r => money(r.budget) },
  { id: 'used', header: 'Used', numeric: true, sort: true, cell: r => `${r.used}%` },
]

function Projects({ size = 4 }: { size?: number }) {
  const rows = state(projects)
  return (
    <Table
      caption="Projects"
      rows={rows}
      columns={columns}
      filter="Filter projects"
      selection
      details={typeof location !== 'undefined' && location.search.includes('sheet') ? 'sheet' : 'inline'}
      page={{ size }}
      bulk={keys => <Button emphasis="ghost">Archive {keys.length}</Button>}
      onEdit={(row, column, value) => (rows.value = rows.value.map(r => (r.id === row.id ? { ...r, [column]: value } : r)))}
    />
  )
}

export function Tables() {
  return (
    <>
      <Projects />
      <Table caption="Loading" rows={[]} columns={columns} status="loading" picker={false} />
      <Table caption="Empty" rows={[]} columns={columns} empty={{ title: 'No projects yet', text: 'Projects you create or join appear here.' }} picker={false} />
      <Table caption="Failed" rows={[]} columns={columns} status="error" error={{ title: 'Projects couldn’t load', text: 'The server returned 503.' }} picker={false} />
    </>
  )
}

const mark = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v18M16 3v18" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
export const nav = [
  { label: 'Workspace', items: [
    { id: 'orders', label: 'Orders', icon: 'search' as const, href: '#orders', count: 12 },
    { id: 'people', label: 'People', icon: 'info' as const, href: '#people' },
    { id: 'alerts', label: 'Alerts', icon: 'alert' as const, href: '#alerts' },
    { id: 'done', label: 'Done', icon: 'check-circle' as const, href: '#done' },
    { id: 'reports', label: 'Reports', icon: 'alert-circle' as const, href: '#reports' },
  ] },
  { label: 'Saved views', items: [{ id: 'late', label: 'Late orders', href: '#late', count: 4 }] },
]

export function Dashboard() {
  const focus = new URLSearchParams(location.search).has('focus')
  if (focus) return <Shell variant="focus" title="Set up your store" step="Step 2 of 4" close={{ label: 'Close setup', href: '#' }} dock={<Button>Continue</Button>}><h1>Payments</h1><p>Choose how customers pay.</p></Shell>
  return (
    <Shell
      brand={{ name: 'Loom', mark: mark() }}
      title="Orders"
      crumbs={[{ label: 'Home', href: '#' }, { label: 'Sales', href: '#' }, { label: 'Region', href: '#' }, { label: 'Orders' }]}
      nav={nav}
      foot={[{ id: 'settings', label: 'Settings', icon: 'info', href: '#settings' }]}
      current="orders"
      command={{ onOpen: () => {} }}
      switcher={{ current: 'ls', workspaces: [{ id: 'ls', name: 'Loom Studio', initials: 'LS', meta: 'Pro · 12 members' }, { id: 'ha', name: 'Halden Apparel', initials: 'HA' }], onSwitch: () => {} }}
      account={{ name: 'Ana Ruiz', email: 'ana@loom.example', initials: 'AR', items: [{ label: 'Profile', href: '#' }, { label: 'Preferences', href: '#', shortcut: '⌘,', keys: 'Meta+Comma' }, 'separator', { label: 'Sign out', tone: 'critical' }] }}
    >
      <h1>Orders</h1>
      <Projects size={2} />
    </Shell>
  )
}
