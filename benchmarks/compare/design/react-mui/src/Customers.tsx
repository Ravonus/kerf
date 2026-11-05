import { useState } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

type Status = 'Active' | 'Trial' | 'Past due'
type Customer = { id: number; name: string; email: string; plan: string; status: Status }

const seed: [string, string, string, Status][] = [
  ['Ada Lovelace', 'ada@analytical.example', 'Enterprise', 'Active'],
  ['Grace Hopper', 'grace@cobol.example', 'Team', 'Active'],
  ['Alan Turing', 'alan@bombe.example', 'Starter', 'Trial'],
  ['Katherine Johnson', 'katherine@orbit.example', 'Enterprise', 'Active'],
  ['Linus Pauling', 'linus@helix.example', 'Team', 'Past due'],
  ['Margaret Hamilton', 'margaret@apollo.example', 'Team', 'Active'],
  ['Dennis Ritchie', 'dennis@unix.example', 'Starter', 'Active'],
  ['Barbara Liskov', 'barbara@clu.example', 'Enterprise', 'Trial'],
  ['Tim Berners-Lee', 'tim@web.example', 'Team', 'Past due'],
  ['Radia Perlman', 'radia@spanning.example', 'Starter', 'Active'],
  ['Donald Knuth', 'donald@tex.example', 'Enterprise', 'Active'],
  ['Hedy Lamarr', 'hedy@spectrum.example', 'Starter', 'Trial'],
]

const statusColor = { Active: 'success', Trial: 'info', 'Past due': 'warning' } as const

function customerRows(rows: Customer[], setTarget: (customer: Customer | null) => void) {
  return (
    <TableBody>
      {rows.map((c) => (
        <TableRow key={c.id} hover>
          <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
          <TableCell>{c.email}</TableCell>
          <TableCell>{c.plan}</TableCell>
          <TableCell>
            <Chip size="small" label={c.status} color={statusColor[c.status]} variant="outlined" />
          </TableCell>
          <TableCell align="right">
            <Button
              size="small"
              color="error"
              aria-label={`Delete ${c.name}`}
              onClick={() => setTarget(c)}
            >
              Delete
            </Button>
          </TableCell>
        </TableRow>
      ))}
      {rows.length === 0 && (
        <TableRow>
          <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
            No customers found
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  )
}

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>(
    seed.map(([name, email, plan, status], id) => ({ id, name, email, plan, status })),
  )
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Customer | null>(null)

  const q = query.trim().toLowerCase()
  const rows = customers.filter((c) => c.name.toLowerCase().includes(q))

  const confirm = () => {
    if (target) setCustomers((cs) => cs.filter((c) => c.id !== target.id))
    setTarget(null)
  }

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h1" component="h1">
          Customers
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Everyone on a Northwind plan, and how their account is doing.
        </Typography>
      </div>
      <TextField
        id="search"
        label="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ maxWidth: 400 }}
        fullWidth
      />
      <Paper variant="outlined">
        <TableContainer>
          <Table sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            {customerRows(rows, setTarget)}
          </Table>
        </TableContainer>
      </Paper>
      <Dialog open={!!target} onClose={() => setTarget(null)} aria-labelledby="del-title">
        <DialogTitle id="del-title">Delete customer?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {target?.name}? This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTarget(null)} color="inherit">
            Keep
          </Button>
          <Button onClick={confirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
