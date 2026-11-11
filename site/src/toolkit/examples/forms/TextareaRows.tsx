import { Stack, Textarea } from '@kerf-js/veneer'

const description =
  'The public shop, served from the edge.'

export const TextareaRows = () => (
  <Stack gap="group">
    <Textarea
      label="Description"
      rows={2}
      defaultValue={description}
    />
    <Textarea
      label="Description"
      rows={5}
      defaultValue={description}
    />
  </Stack>
)
