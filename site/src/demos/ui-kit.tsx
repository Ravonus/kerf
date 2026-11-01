import { state } from 'weft'
import { Button, Input, Switch } from '@weft/warp'

export default function Signup() {
  const sent = state(false)
  return (
    <form onSubmit={e => { e.preventDefault(); sent.value = true }}>
      <Input label="Billing email" type="email" />
      <Switch defaultChecked>Send a receipt</Switch>
      <Button type="submit">{sent.value ? 'Saved' : 'Save'}</Button>
    </form>
  )
}
