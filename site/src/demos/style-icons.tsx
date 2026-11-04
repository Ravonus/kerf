import { state } from '@weft-js/core'
import { BellIconAction, CheckIcon, HeartIcon, HeartIconSolid } from '@weft-js/warp-icons'
import { Button, Card, Icon, Row, Switch, Text, Toggle } from '@weft-js/warp'

export default function Icons() {
  const liked = state(false)
  const solid = state(false)
  return (
    <Card title="Icons">
      <Row gap="group" align="baseline">
        {/* Decorative: the word beside it says the same, so it stays hidden from screen readers. */}
        <Text>
          <CheckIcon /> Saved
        </Text>
        {/* By name, with a label because nothing else names it. */}
        <Icon name="star" solid={solid.value} label="Favourite" size={24} />
        {/* Hover or focus the button and the bell rings. */}
        <Button emphasis="outline" tone="neutral">
          <BellIconAction /> Notify me
        </Button>
      </Row>
      <Switch
        checked={solid.value}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          (solid.value = e.currentTarget.checked)
        }
      >
        Solid star
      </Switch>
      {/* Icon only, so `label` is its name. The name stays the same; aria-pressed says whether it's on. */}
      <Toggle
        pressed={liked.value}
        icon={liked.value ? HeartIconSolid : HeartIcon}
        label="Like"
        onClick={() => (liked.value = !liked.value)}
      />
    </Card>
  )
}
