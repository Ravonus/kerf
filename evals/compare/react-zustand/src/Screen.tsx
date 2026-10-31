import { money } from '../../shared/data'
import { DataTable, helper } from './DataTable'

const LABEL = 'Projects'
const tones = { Live: 'bg-green-100 text-green-900', Paused: 'bg-amber-100 text-amber-900', Draft: 'bg-gray-100 text-gray-800' }
const columns = helper.columns([
  helper.accessor('name', { header: 'Project' }),
  helper.accessor('status', { header: 'Status', cell: c => <span className={`rounded-full px-2 py-0.5 text-xs ${tones[c.getValue()]}`}>{c.getValue()}</span> }),
  helper.accessor('owner', { header: 'Owner' }),
  helper.accessor('region', { header: 'Region' }),
  helper.accessor('budget', { header: 'Budget', cell: c => money(c.getValue()) }),
  helper.accessor('used', { header: 'Used', cell: c => `${c.getValue()}%` }),
])
export const Screen = () => <DataTable label={LABEL} columns={columns} />
