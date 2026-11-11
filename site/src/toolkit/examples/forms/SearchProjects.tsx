import { derived, state } from '@kerf-js/core'
import { Row, Search, Stack, Text } from '@kerf-js/veneer'
import { PROJECTS } from '../../world'

export function SearchProjects() {
  const q = state('')
  const hits = derived(() => {
    const trimmed = q.value.trim()
    const s = trimmed.toLowerCase()
    return PROJECTS.filter((p) =>
      `${p.name} ${p.owner} ${p.region}`
        .toLowerCase()
        .includes(s),
    ).slice(0, 5)
  })
  return (
    <Stack gap="group">
      <Search
        label="Search projects"
        placeholder="Name, owner or region"
        value={q.value}
        onInput={(e) => (q.value = e.currentTarget.value)}
      />
      <Stack gap="tight">
        {hits.value.map((p) => (
          <Row
            key={p.id}
            justify="between"
          >
            <Text>{p.name}</Text>
            <Text subtle>{p.region}</Text>
          </Row>
        ))}
        {!hits.value.length && (
          <Text subtle>Nothing matches “{q.value}”.</Text>
        )}
      </Stack>
    </Stack>
  )
}
