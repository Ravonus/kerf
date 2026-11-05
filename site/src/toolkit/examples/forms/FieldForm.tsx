import { Input, Stack, Textarea } from '@weft-js/warp'

export const FieldForm = () => (
  <Stack gap="group">
    <Input
      label="Name"
      autocomplete="name"
      defaultValue="Mara Lindqvist"
    />
    <Input
      label="Work email"
      type="email"
      autocomplete="email"
      defaultValue="mara@weft.dev"
    />
    <Textarea
      label="About you"
      hint="Shown to your team."
    />
  </Stack>
)
