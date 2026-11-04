import { money } from '../../shared/data'
import { DataTable, helper } from './DataTable'

const LABEL = 'Projects'
const columns = helper.columns([
  helper.accessor('name', { header: 'Project' }),
  helper.accessor('status', {
    header: 'Status',
    cell: (c) => (
      <span className="badge" data-tone={c.getValue()}>
        {c.getValue()}
      </span>
    ),
  }),
  helper.accessor('owner', { header: 'Owner' }),
  helper.accessor('region', { header: 'Region' }),
  helper.accessor('budget', { header: 'Budget', cell: (c) => money(c.getValue()) }),
  helper.accessor('used', { header: 'Used', cell: (c) => `${c.getValue()}%` }),
])
export const Screen = () => <DataTable label={LABEL} columns={columns} />
