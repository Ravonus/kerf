import { Grid, Textarea } from '@weft-js/warp'
import { Cell } from '../../world'

const description =
  'The public shop, served from the edge.'

export const TextareaStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <Textarea label="Description" />
    </Cell>
    <Cell name="Filled">
      <Textarea
        label="Description"
        defaultValue={description}
      />
    </Cell>
    <Cell name="Hint">
      <Textarea
        label="Description"
        hint="Shown on the project's card."
      />
    </Cell>
    <Cell name="Invalid">
      <Textarea
        label="Description"
        defaultValue="x"
        error="Write at least ten characters."
      />
    </Cell>
    <Cell name="Disabled">
      <Textarea
        label="Description"
        defaultValue={description}
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <Textarea
        label="Description"
        defaultValue={description}
        readonly
      />
    </Cell>
  </Grid>
)
