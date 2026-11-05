import { derived, state } from '@weft-js/core'
import { Input, Stack, Text } from '@weft-js/warp'

export function InputSlug() {
  const name = state('Store Front')
  const slug = derived(() =>
    name.value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  )
  return (
    <Stack gap="related">
      <Input
        label="Project name"
        value={name.value}
        onInput={(e) =>
          (name.value = e.currentTarget.value)
        }
        error={
          slug.value
            ? undefined
            : 'Give it a name with at least one letter.'
        }
      />
      <Text subtle>
        {slug.value
          ? `Lives at ${slug.value}.weft.dev`
          : 'Waiting for a name'}
      </Text>
    </Stack>
  )
}
