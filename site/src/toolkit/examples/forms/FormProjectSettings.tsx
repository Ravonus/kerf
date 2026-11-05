import { derived, state } from '@weft-js/core'
import {
  Button,
  Checkbox,
  Grid,
  Input,
  Row,
  Select,
  Slider,
  Stack,
  Text,
  Textarea,
  Toaster,
  toast,
} from '@weft-js/warp'
import { SLUG, REGION_OPTIONS } from './shared'

export function FormProjectSettings() {
  const name = state('storefront')
  const about = state('The public shop, served from the edge.')
  const region = state<string | null>('eu-west')
  const copies = state(3)
  const onPush = state(true)
  const problem = derived(() =>
    SLUG.test(name.value) ? undefined : 'Use lowercase letters, numbers and dashes.',
  )
  const save = (e: Event) => {
    e.preventDefault()
    if (!problem.value)
      toast.show({
        title: 'Settings saved',
        description: `${name.value} runs ${copies.value} copies in ${region.value}.`,
      })
  }
  return (
    <>
      <Stack as="form" gap="group" onSubmit={save}>
        <Text role="heading">Project settings</Text>
        <Grid cols={2} gap="group">
          <Input
            label="Project name"
            value={name.value}
            error={problem.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
          />
          <Select
            label="Region"
            options={REGION_OPTIONS}
            value={region}
            hint="Moving a project redeploys it."
          />
        </Grid>
        <Textarea
          label="Description"
          value={about.value}
          counter={120}
          onInput={(e) => (about.value = e.currentTarget.value)}
        />
        <Slider
          label="Copies"
          value={copies.value}
          min={1}
          max={8}
          onChange={(v) => (copies.value = v)}
        />
        <Checkbox
          checked={onPush.value}
          hint="Every push to main goes live."
          onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
            (onPush.value = e.currentTarget.checked)
          }
        >
          Deploy on push
        </Checkbox>
        <FormActions />
      </Stack>
      <Toaster />
    </>
  )
}

function FormActions() {
  return (
    <Row gap="related" justify="end">
      <Button emphasis="ghost" tone="neutral">
        Cancel
      </Button>
      <Button type="submit">Save changes</Button>
    </Row>
  )
}
