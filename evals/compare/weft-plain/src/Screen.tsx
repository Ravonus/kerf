import { money, type Project } from '../../shared/data'
import { DataTable, type Column } from './DataTable'

const LABEL = 'Projects'
const columns: Column[] = [
  { id: 'name', header: 'Project' },
  {
    id: 'status',
    header: 'Status',
    cell: (r: Project) => (
      <span class="badge" data-tone={r.status}>
        {r.status}
      </span>
    ),
  },
  { id: 'owner', header: 'Owner' },
  { id: 'region', header: 'Region' },
  { id: 'budget', header: 'Budget', cell: (r: Project) => money(r.budget) },
  { id: 'used', header: 'Used', cell: (r: Project) => `${r.used}%` },
]
export const Screen = () => (
  <>
    <h1>{LABEL}</h1>
    <DataTable label={LABEL} columns={columns} />
  </>
)
