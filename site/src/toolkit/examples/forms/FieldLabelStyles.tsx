import { Grid, Input } from '@weft-js/warp'

export const FieldLabelStyles = () => (
  <Grid cols={2} gap="group">
    <Input label="Project name" hint="Floats on the border." />
    <Input label="Project name" hint="Sits above the field." variant="classic" />
  </Grid>
)
