import { Stack, Card, Text } from '@weft-js/warp'

export const CardPlay = (p: { eyebrow: string; title: string; sweep: boolean }) => (
  <Stack>
    <Card eyebrow={p.eyebrow} title={p.title} sweep={p.sweep}>
      <Text subtle>Live in eu-west, updated 2 minutes ago.</Text>
    </Card>
  </Stack>
)
