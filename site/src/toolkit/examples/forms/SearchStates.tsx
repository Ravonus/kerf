import { Grid, Search } from '@kerf-js/veneer'
import { Cell } from '../../world'

export const SearchStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <Search label="Search projects" />
    </Cell>
    <Cell name="Filled">
      <Search
        label="Search projects"
        defaultValue="checkout"
      />
    </Cell>
    <Cell name="Hint">
      <Search
        label="Search projects"
        hint="Name, owner or region."
      />
    </Cell>
    <Cell name="Invalid">
      <Search
        label="Search projects"
        defaultValue="region:"
        error="Finish the filter, like region:eu-west."
      />
    </Cell>
    <Cell name="Disabled">
      <Search
        label="Search projects"
        defaultValue="checkout"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <Search
        label="Search projects"
        defaultValue="checkout"
        readonly
      />
    </Cell>
  </Grid>
)
