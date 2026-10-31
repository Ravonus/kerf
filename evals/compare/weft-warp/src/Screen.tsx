import { state } from 'weft'
import { Badge, Button, Table, type Column } from '@weft/warp'
import { money, pageSize, projects, type Project } from '../../shared/data'

const LABEL = 'Projects'
const tones = { Live: 'positive', Paused: 'caution', Draft: 'neutral' } as const
const columns: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, sort: true, card: 'title' },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: r => <Badge tone={tones[r.status]}>{r.status}</Badge> },
  { id: 'owner', header: 'Owner', sort: true },
  { id: 'region', header: 'Region', sort: true, priority: 3 },
  { id: 'budget', header: 'Budget', numeric: true, sort: true, cell: r => money(r.budget) },
  { id: 'used', header: 'Used', numeric: true, sort: true, cell: r => `${r.used}%` },
]

export function Screen() {
  const rows = state(projects)
  ;(window as any).__tick = () => (rows.value = rows.value.map(r => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  return (
    <>
      <h1>{LABEL}</h1>
      <Table caption={LABEL} rows={rows} columns={columns} filter="Filter projects" selection details="inline" page={{ size: pageSize }}
        bulk={keys => <Button emphasis="ghost">Archive {keys.length}</Button>} />
    </>
  )
}
