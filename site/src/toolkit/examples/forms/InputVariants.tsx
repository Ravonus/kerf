import { Grid, Input } from '@weft-js/warp'

export const InputVariants = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Input
      label="Project name"
      defaultValue="storefront"
    />
    <Input
      label="Project name"
      defaultValue="storefront"
      variant="classic"
    />
    <Input
      label="Project name"
      defaultValue="storefront"
      appearance="line"
    />
  </Grid>
)
