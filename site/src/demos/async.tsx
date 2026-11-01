import { state } from 'weft'
import { Badge, Button, Card, Spinner } from '@weft/warp'

const save = () => new Promise(done => setTimeout(done, 800))

export default function Profile() {
  const saving = state(false)
  const saves = state(0)
  const go = async () => {
    saving.value = true
    await save()
    saves.value++
    saving.value = false
  }
  return (
    <Card title="Profile">
      <Badge tone="positive">Saves: {saves.value}</Badge>
      <Button disabled={saving.value} onClick={go}>
        {saving.value ? <Spinner /> : 'Save changes'}
      </Button>
    </Card>
  )
}
