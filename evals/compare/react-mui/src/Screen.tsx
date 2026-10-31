import Chip from '@mui/material/Chip'
import type { GridColDef } from '@mui/x-data-grid'
import { money, type Project } from '../../shared/data'
import { DataTable } from './DataTable'

const LABEL = 'Projects'
const tones = { Live: 'success', Paused: 'warning', Draft: 'default' } as const
const columns: GridColDef<Project>[] = [
    { field: 'name', headerName: 'Project', flex: 1 },
    { field: 'status', headerName: 'Status', width: 110, renderCell: p => <Chip size="small" color={tones[p.row.status]} label={p.row.status} /> },
    { field: 'owner', headerName: 'Owner', width: 130 },
    { field: 'region', headerName: 'Region', width: 110 },
    { field: 'budget', headerName: 'Budget', type: 'number', width: 110, valueFormatter: (v: number) => money(v) },
    { field: 'used', headerName: 'Used', type: 'number', width: 90, valueFormatter: (v: number) => `${v}%` },
]
export const Screen = () => <DataTable label={LABEL} columns={columns} />
