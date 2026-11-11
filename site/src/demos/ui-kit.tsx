import { state } from '@kerf/core'
import {
  Button,
  Card,
  Input,
  Switch,
} from '@kerf/veneer'

export default function Billing() {
  const saved = state(false)
  const submit = (e: Event) => {
    e.preventDefault()
    saved.value = true
  }
  return (
    <Card title="Billing">
      <form onSubmit={submit}>
        <Input
          label="Billing email"
          type="email"
        />
        <Switch defaultChecked>Send a receipt</Switch>
        <Button type="submit">
          {saved.value ? 'Saved' : 'Save'}
        </Button>
      </form>
    </Card>
  )
}
