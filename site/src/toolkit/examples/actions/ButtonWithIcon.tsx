import { Button } from '@kerf-js/veneer'

export const ButtonWithIcon = () => (
  <>
    <Button icon="rocket">Deploy</Button>
    <Button
      emphasis="outline"
      tone="neutral"
      icon="plus"
    >
      New project
    </Button>
    <Button
      emphasis="ghost"
      tone="critical"
      icon="trash"
    >
      Delete
    </Button>
  </>
)
