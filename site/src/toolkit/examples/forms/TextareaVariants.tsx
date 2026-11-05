import { Grid, Textarea } from '@weft-js/warp'

export const TextareaVariants = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Textarea
      label="Description"
      defaultValue="The public shop."
    />
    <Textarea
      label="Description"
      defaultValue="The public shop."
      variant="classic"
    />
    <Textarea
      label="Description"
      defaultValue="The public shop."
      appearance="line"
    />
  </Grid>
)
