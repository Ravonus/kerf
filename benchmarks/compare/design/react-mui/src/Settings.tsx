import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

const initial = {
  name: 'Jordan Rivera',
  email: 'jordan@northwind.example',
  role: 'Admin',
  bio: 'Runs product operations at Northwind.',
  updates: true,
}

export function Settings() {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDone(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.email.includes('@')) {
      setError('Enter a valid email')
      setDone(false)
      return
    }
    setError('')
    setSaved(form)
    setDone(true)
  }

  const cancel = () => {
    setForm(saved)
    setError('')
    setDone(false)
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <div>
        <Typography variant="h1" component="h1">
          Settings
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Manage your profile and notification preferences.
        </Typography>
      </div>
      {settingsPanel(form, error, done, set, submit, cancel)}
    </Stack>
  )
}

function settingsPanel(
  form: typeof initial,
  error: string,
  done: boolean,
  set: <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => void,
  submit: (e: FormEvent) => void,
  cancel: () => void,
) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 } }}>
      <form onSubmit={submit} noValidate>
        <Stack spacing={3}>
          <TextField
            id="full-name"
            label="Full name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            fullWidth
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={!!error}
            helperText={error || undefined}
            fullWidth
          />
          <TextField
            id="role"
            label="Role"
            select
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
            fullWidth
          >
            {['Admin', 'Editor', 'Viewer'].map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            id="bio"
            label="Bio"
            multiline
            minRows={4}
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch checked={form.updates} onChange={(e) => set('updates', e.target.checked)} />
            }
            label="Email updates"
          />
          {done && (
            <Alert severity="success" role="status">
              Saved
            </Alert>
          )}
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button type="button" variant="outlined" color="inherit" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Save
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  )
}
