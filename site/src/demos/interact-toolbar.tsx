import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

// The toolbar knows nothing about playing or uploading.
// Its user passes what each button does.
function Toolbar(props: {
  onPlay: () => void
  onUpload: () => void
}) {
  const { onPlay, onUpload } = props
  return (
    <p>
      <Button
        size="sm"
        onClick={onPlay}
      >
        Play movie
      </Button>
      <Button
        size="sm"
        emphasis="outline"
        onClick={onUpload}
      >
        Upload image
      </Button>
    </p>
  )
}

export default function App() {
  const said = state('Nothing yet')
  const play = () =>
    (said.value = 'Playing Kiki’s Delivery Service')
  return (
    <Card title="A toolbar">
      <Toolbar
        onPlay={play}
        onUpload={() => (said.value = 'Uploading…')}
      />
      <p>{said.value}</p>
    </Card>
  )
}
