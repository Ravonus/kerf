import { state } from 'weft'
import { Button, Card, Heading, Input, Row, Select, Stack, Switch, Text, Textarea } from '@weft/warp'

const roles = ['Admin', 'Editor', 'Viewer'].map(r => ({ value: r, label: r }))

export function Settings() {
  const name = state('Ada Lovelace')
  const email = state('ada@northwind.example')
  const role = state('Admin')
  const bio = state('Runs billing and onboarding for the Northwind team.')
  const updates = state(true)
  const error = state('')
  const saved = state(false)

  const save = (e: Event) => {
    e.preventDefault()
    saved.value = false
    if (!email.value.includes('@')) {
      error.value = 'Enter a valid email'
      return
    }
    error.value = ''
    saved.value = true
  }
  const cancel = () => {
    name.value = 'Ada Lovelace'
    email.value = 'ada@northwind.example'
    role.value = 'Admin'
    bio.value = 'Runs billing and onboarding for the Northwind team.'
    updates.value = true
    error.value = ''
    saved.value = false
  }

  return (
    <Stack gap="group">
      <Stack gap="related">
        <Heading level={1} role="title">Settings</Heading>
        <Text subtle>Manage how you appear to your team and what we send you.</Text>
      </Stack>
      <Card title="Profile">
        <form onSubmit={save} noValidate>
          <Stack gap="group">
            <Input label="Full name" value={name.value} onInput={(e: any) => (name.value = e.currentTarget.value)} autocomplete="name" />
            <Input label="Email" hint="Used for account notices only." type="text" inputmode="email" value={email.value} error={error.value || undefined} onInput={(e: any) => (email.value = e.currentTarget.value)} autocomplete="email" />
            <Select label="Role" value={role.value} options={roles} onChange={(e: any) => (role.value = e.currentTarget.value)} />
            <Textarea label="Bio" value={bio.value} onInput={(e: any) => (bio.value = e.currentTarget.value)} />
            <Switch checked={updates.value} onChange={(e: any) => (updates.value = e.currentTarget.checked)}>Email updates</Switch>
            <Row gap="related" align="baseline" wrap>
              <Button type="submit">Save</Button>
              <Button emphasis="ghost" tone="neutral" onClick={cancel}>Cancel</Button>
              {saved.value && <Text role="label" tone="positive" inline aria-live="polite">Saved</Text>}
            </Row>
          </Stack>
        </form>
      </Card>
    </Stack>
  )
}
