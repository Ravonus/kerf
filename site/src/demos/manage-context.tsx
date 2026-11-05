import { context } from '@weft-js/core'
import { Card, Heading, Inset } from '@weft-js/warp'

type Level = 2 | 3 | 4 | 5 | 6
// Heading depth. Outside every Section, the fallback
// is 2.
const LevelContext = context<Level>(2)

function Section({ children }: { children?: unknown }) {
  // Everything inside reads one level deeper than
  // this section.
  const inner = Math.min(LevelContext.use + 1, 6) as Level
  return LevelContext.provide(inner, () => (
    <Inset as="section">{children}</Inset>
  ))
}

function Title({ children }: { children?: unknown }) {
  const level = LevelContext.use
  return (
    <Heading level={level}>
      {children} (h{level})
    </Heading>
  )
}

export default function Outline() {
  return (
    <Card>
      <Title>Trip plan</Title>
      <Section>
        <Title>Lisbon</Title>
        <Section>
          <Title>Where to eat</Title>
          <Title>Where to stay</Title>
        </Section>
      </Section>
      <Section>
        <Title>Porto</Title>
      </Section>
    </Card>
  )
}
