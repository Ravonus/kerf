import { Badge, Card, Row, Stack } from '@weft-js/warp'

// One component, defined once at the top level.
function Profile({
  name,
  field,
}: {
  name: string
  field: string
}) {
  return (
    <Row gap="related">
      <Badge emphasis="solid" tone="accent">
        {name[0]}
      </Badge>
      <span>
        <strong>{name}</strong>, {field}
      </span>
    </Row>
  )
}

// Another component that uses it three times.
export default function Gallery() {
  return (
    <Card title="Amazing scientists">
      <Stack gap="related">
        <Profile
          name="Katherine Johnson"
          field="mathematician"
        />
        <Profile name="Mario Molina" field="chemist" />
        <Profile name="Hedy Lamarr" field="inventor" />
      </Stack>
    </Card>
  )
}
