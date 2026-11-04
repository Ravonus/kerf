import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const sculptures = [
  {
    name: 'Homenaje a la Neurocirugía',
    artist: 'Marta Colvin Andrade',
    about: 'Two hands holding a brain, carved in stone.',
  },
  {
    name: 'Floralis Genérica',
    artist: 'Eduardo Catalano',
    about: 'A steel flower whose petals close at night.',
  },
  {
    name: 'Eternal Presence',
    artist: 'John Woodrow Wilson',
    about: 'A bronze head, seven feet tall.',
  },
]

export default function Gallery() {
  // Two boxes, because they change for different reasons.
  const index = state(0)
  const showMore = state(false)
  const next = () => (index.value = (index.value + 1) % sculptures.length)
  return (
    <Card
      eyebrow={`${index.value + 1} of ${sculptures.length}`}
      title={sculptures[index.value]?.name}
    >
      <p>by {sculptures[index.value]?.artist}</p>
      <Button size="sm" onClick={next}>
        Next
      </Button>
      <Button size="sm" emphasis="ghost" onClick={() => (showMore.value = !showMore.value)}>
        {showMore.value ? 'Hide' : 'Show'} details
      </Button>
      {showMore.value && <p>{sculptures[index.value]?.about}</p>}
    </Card>
  )
}
