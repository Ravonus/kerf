import { Badge, Button, Card, Grid, Heading, Stack, Text } from '@weft-js/warp'

const plans = [
  {
    name: 'Starter',
    price: '$19',
    blurb: 'For individuals getting going.',
    features: ['Up to 3 projects', '1 GB storage', 'Email support'],
    cta: 'Start free trial',
    featured: false,
  },
  {
    name: 'Team',
    price: '$49',
    blurb: 'For growing teams that ship together.',
    features: ['Unlimited projects', '100 GB storage', 'Roles and permissions', 'Priority support'],
    cta: 'Choose Team',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '$199',
    blurb: 'For organisations with extra needs.',
    features: ['Single sign-on', 'Audit log', 'Dedicated manager', '99.9% uptime SLA'],
    cta: 'Contact sales',
    featured: false,
  },
]

const faqs = [
  {
    q: 'Can I change plans later?',
    a: 'Yes. Upgrade or downgrade at any time and we prorate the difference on your next invoice.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Every plan starts with a 14-day trial. No card is needed until you decide to stay.',
  },
  {
    q: 'How does billing work?',
    a: 'Plans are billed monthly per workspace. Annual billing saves two months.',
  },
]

export function Pricing() {
  return (
    <Stack gap="section">
      <Stack gap="related">
        <Heading level={1} role="display">
          Pricing
        </Heading>
        <Text role="lead" subtle>
          Simple plans that scale with your business. Try any of them free for 14 days.
        </Text>
        <div>
          <Button
            size="lg"
            onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Compare plans
          </Button>
        </div>
      </Stack>
      <Grid min="md" gap="group" id="plans">
        {plans.map((p) => (
          <Card key={p.name} data-featured={p.featured ? '' : undefined}>
            <Stack gap="group">
              <Stack gap="related">
                {p.featured && (
                  <div>
                    <Badge tone="accent" emphasis="solid">
                      Most popular
                    </Badge>
                  </div>
                )}
                <Heading level={2} role="heading">
                  {p.name}
                </Heading>
                <Text subtle>{p.blurb}</Text>
                <Text role="title">
                  {p.price}{' '}
                  <Text inline subtle>
                    per month
                  </Text>
                </Text>
              </Stack>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Button
                full
                emphasis={p.featured ? 'solid' : 'outline'}
                tone={p.featured ? 'accent' : 'neutral'}
              >
                {p.cta}
              </Button>
            </Stack>
          </Card>
        ))}
      </Grid>
      <Stack gap="group" as="section">
        <Heading level={2} role="title">
          Frequently asked questions
        </Heading>
        <Stack gap="group" divided>
          {faqs.map((f) => (
            <Stack key={f.q} gap="related">
              <Heading level={3} role="heading">
                {f.q}
              </Heading>
              <Text subtle>{f.a}</Text>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Stack>
  )
}
