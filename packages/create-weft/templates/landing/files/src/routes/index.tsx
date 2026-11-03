import { Link, type Meta } from '@weft-js/start'
import { Card, Center, Grid, Heading, Split, Stack, Text } from '@weft-js/warp'
import { Media } from '@weft-js/core/media'
import hero from '../../assets/hero.webp?media'
import { WaitlistForm } from '#/components/WaitlistForm'

export const meta: Meta = { title: { absolute: 'Emberline: hear what customers keep asking for' } }
export const prerender = true

const features = [
  { title: 'Every call, heard', body: 'Emberline reads your sales and support calls and pulls out each request, in the customer\'s own words.' },
  { title: 'Ranked, not guessed', body: 'Requests are grouped and weighted by how often they come up and which accounts asked.' },
  { title: 'Proof beside every card', body: 'Each item links back to the quotes behind it, so the roadmap argument ends quickly.' },
]

const steps = [
  { title: 'Connect your calls', body: 'Point Emberline at your call recorder and help desk. Setup takes a few minutes.' },
  { title: 'Read the signals', body: 'Requests arrive grouped into Now, Next and Later, with a count beside each one.' },
  { title: 'Close the loop', body: 'When a feature ships, tell every customer who asked for it, with one digest.' },
]

export default function Home() {
  return (
    <Stack gap="none">
      <section class="hero">
        <Center max="wide" gutter>
          <Split gap="section" side="end" width="half">
            <Stack gap="group" class="hero-copy" id="join">
              <Text role="eyebrow" tone="accent">Early access opens this winter</Text>
              <Heading level={1} role="display">Hear what customers keep asking for</Heading>
              <Text class="lede" subtle>Emberline listens to your customer calls and turns them into a ranked list of what to build next.</Text>
              <WaitlistForm />
            </Stack>
            <Media src={hero} priority sizes="(max-width: 599px) 100vw, min(46vw, 696px)" class="hero-art" alt="The Emberline board: customer requests grouped into Now, Next and Later, with a quote from a renewal call" />
          </Split>
        </Center>
      </section>

      <section class="band">
        <Center max="wide" gutter>
          <Stack gap="section">
            <Heading level={2} role="title" class="band-head">Stop losing what customers tell you</Heading>
            <Grid gap="group" min="sm" cols={3}>
              {features.map(feature => (
                <Card key={feature.title} title={feature.title}>
                  <Text subtle>{feature.body}</Text>
                </Card>
              ))}
            </Grid>
          </Stack>
        </Center>
      </section>

      <section class="band band-sunken">
        <Center max="wide" gutter>
          <Stack gap="section">
            <Heading level={2} role="title">How it works</Heading>
            <Grid as="ol" gap="group" min="sm" cols={3} class="steps">
              {steps.map(step => (
                <li key={step.title}>
                  <Stack gap="related">
                    <Heading level={3}>{step.title}</Heading>
                    <Text subtle>{step.body}</Text>
                  </Stack>
                </li>
              ))}
            </Grid>
          </Stack>
        </Center>
      </section>

      <section class="closing">
        <Center max="narrow" gutter>
          <Stack gap="group" align="center">
            <Heading level={2} role="title">Your customers already told you what to build.</Heading>
            <Link href="#join" class="cta">Get early access</Link>
          </Stack>
        </Center>
      </section>
    </Stack>
  )
}
