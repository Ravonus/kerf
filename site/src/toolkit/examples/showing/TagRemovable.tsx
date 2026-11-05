import { state } from '@weft-js/core'
import { Tag, Button } from '@weft-js/warp'

export function TagRemovable() {
  const tags = state([
    'frontend',
    'eu-west',
    'needs review',
  ])
  return (
    <>
      {tags.value.map((t) => (
        <Tag
          key={t}
          label={t}
          onRemove={() =>
            (tags.value = tags.value.filter(
              (x) => x !== t,
            ))
          }
        >
          {t}
        </Tag>
      ))}
      {!tags.value.length && (
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
          onClick={() =>
            (tags.value = [
              'frontend',
              'eu-west',
              'needs review',
            ])
          }
        >
          Put them back
        </Button>
      )}
    </>
  )
}
