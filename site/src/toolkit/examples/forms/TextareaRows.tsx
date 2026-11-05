import { Stack, Textarea } from '@weft-js/warp'

export const TextareaRows = () => (
  <Stack gap="group">
    <Textarea
      label="Description"
      rows={2}
      defaultValue={
        'The public shop, served ' + 'from the edge.'
      }
    />
    <Textarea
      label="Description"
      rows={5}
      defaultValue={
        'The public shop, served ' + 'from the edge.'
      }
    />
  </Stack>
)
