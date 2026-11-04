import { CheckIcon } from '@weft-js/warp-icons'
import { Link, type Meta } from '@weft-js/start'
import { Accordion, Badge, Card, Center, Grid, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = {
  title: 'Pricing',
  description: 'Free for one person. Simple per-seat pricing for teams.',
}
export const prerender = true

const plans = [
  {
    name: 'Starter',
    price: '$0',
    unit: 'forever',
    blurb: 'For a founder reading their own calls.',
    items: ['50 calls a month', 'Signals board', 'CSV export'],
    cta: 'Join for free',
  },
  {
    name: 'Team',
    price: '$24',
    unit: 'per seat, per month',
    blurb: 'For product teams that share a roadmap.',
    items: ['Unlimited calls', 'CRM and Slack digests', 'Team spaces', 'Priority support'],
    cta: 'Get early access',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Talk to us',
    unit: 'billed yearly',
    blurb: 'For companies with records to keep.',
    items: ['Everything in Team', 'Single sign-on', 'Audit log', 'Data residency'],
    cta: 'Get in line',
  },
]

const questions = [
  {
    value: 'open',
    title: 'When does it open?',
    content:
      'The first teams start this winter. Everyone on the waitlist hears from us in the order they joined.',
  },
  {
    value: 'price',
    title: 'Is the early price locked in?',
    content:
      'Yes. Teams that join during early access keep their per-seat price for as long as they stay.',
  },
  {
    value: 'data',
    title: 'What happens to my data if I leave?',
    content: "It's yours. Export every signal and quote as CSV at any time, on any plan.",
  },
]

export default function Pricing() {
  return (
    <Stack gap="none">
      <section class="page-head">
        <Center gutter>
          <Stack gap="related" align="center">
            <Heading level={1} role="display">
              Simple pricing that grows with your team
            </Heading>
            <Text class="lede" subtle>
              Free for one person. Pay per seat when the whole team comes along.
            </Text>
          </Stack>
        </Center>
      </section>

      <section class="band band-tight">
        <Center max="wide" gutter>
          <Grid gap="group" min="sm" cols={3}>
            {plans.map((plan) => (
              <Card key={plan.name} class="plan" data-featured={plan.featured ? '' : undefined}>
                <Stack gap="group" class="plan-body">
                  <Stack gap="tight">
                    <Heading level={2} role="title">
                      {plan.name}
                    </Heading>
                    <Text subtle>{plan.blurb}</Text>
                  </Stack>
                  {plan.featured && (
                    <Badge tone="accent" emphasis="solid" class="plan-flag">
                      Most popular
                    </Badge>
                  )}
                  <Stack gap="hair">
                    <Text class="plan-price">{plan.price}</Text>
                    <Text role="caption" subtle>
                      {plan.unit}
                    </Text>
                  </Stack>
                  <Stack as="ul" gap="tight" class="plan-items">
                    {plan.items.map((item) => (
                      <li key={item}>
                        <CheckIcon /> {item}
                      </li>
                    ))}
                  </Stack>
                  <Link
                    href="/#join"
                    class="cta"
                    data-emphasis={plan.featured ? undefined : 'outline'}
                  >
                    {plan.cta}
                  </Link>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Center>
      </section>

      <section class="band band-sunken">
        <Center max="narrow" gutter>
          <Stack gap="group">
            <Heading level={2} role="title">
              Questions
            </Heading>
            <Accordion items={questions} variant="line" level={3} />
          </Stack>
        </Center>
      </section>
    </Stack>
  )
}
