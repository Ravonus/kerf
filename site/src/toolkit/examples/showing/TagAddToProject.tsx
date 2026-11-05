import { state } from '@weft-js/core'
import { Stack, Input, Row, Tag } from '@weft-js/warp'

export function TagAddToProject() {
  const tags = state(['frontend', 'checkout'])
  const draft = state('')
  const add = (e: Event) => {
    e.preventDefault()
    const name = draft.value.trim()
    if (name && !tags.value.includes(name)) tags.value = [...tags.value, name]
    draft.value = ''
  }
  return (
    <Stack as="form" gap="related" onSubmit={add}>
      <Input
        label="Add a label"
        placeholder="Type and press Enter"
        value={draft.value}
        onInput={(e: Event) => (draft.value = (e.target as HTMLInputElement).value)}
      />
      <Row gap="tight">
        {tags.value.map((t) => (
          <Tag key={t} label={t} onRemove={() => (tags.value = tags.value.filter((x) => x !== t))}>
            {t}
          </Tag>
        ))}
      </Row>
    </Stack>
  )
}
