import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid'
import { money, pageSize, projects, type Project } from '../../shared/data'

// The community DataGrid has no detail panel (it's a Pro feature), so details open in a Collapse under the grid.
export function DataTable(props: { label: string; columns: GridColDef<Project>[] }) {
  const [rows, setRows] = useState(projects)
  const [open, setOpen] = useState<Project | undefined>()
  const [picked, setPicked] = useState<GridRowSelectionModel>({ type: 'include', ids: new Set() })
  ;(window as any).__tick = () =>
    setRows((d) => d.map((r) => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  const columns: GridColDef<Project>[] = [
    {
      field: 'details',
      headerName: '',
      width: 56,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (p) => (
        <IconButton
          size="small"
          aria-label={`Details for ${p.row.name}`}
          aria-expanded={open?.id === p.row.id}
          onClick={() => setOpen((o) => (o?.id === p.row.id ? undefined : p.row))}
        >
          {open?.id === p.row.id ? '▾' : '▸'}
        </IconButton>
      ),
    },
    ...props.columns,
  ]
  return (
    <>
      <Typography variant="h3" component="h1" gutterBottom>
        {props.label}
      </Typography>
      {picked.ids.size > 0 && <Button>Archive {picked.ids.size}</Button>}
      <Box>
        <DataGrid
          label={props.label}
          rows={rows}
          columns={columns}
          checkboxSelection
          disableRowSelectionOnClick
          showToolbar
          autoHeight
          rowSelectionModel={picked}
          onRowSelectionModelChange={setPicked}
          initialState={{ pagination: { paginationModel: { pageSize, page: 0 } } }}
          pageSizeOptions={[pageSize]}
          slotProps={{ toolbar: { showQuickFilter: true } }}
        />
      </Box>
      <Collapse in={!!open} unmountOnExit>
        <Box component="dl" sx={{ p: 2 }}>
          <dt>Owner</dt>
          <dd>{open?.owner}</dd>
          <dt>Region</dt>
          <dd>{open?.region}</dd>
          <dt>Budget</dt>
          <dd>{open && money(open.budget)}</dd>
        </Box>
      </Collapse>
    </>
  )
}
