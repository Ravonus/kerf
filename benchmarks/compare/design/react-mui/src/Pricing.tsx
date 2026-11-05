import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const plans = [
  {
    name: 'Starter',
    price: '$0',
    blurb: 'For individuals getting started.',
    cta: 'Start for free',
    features: ['1 workspace', 'Up to 100 products', 'Community support'],
  },
  {
    name: 'Team',
    price: '$29',
    blurb: 'For growing teams that ship together.',
    cta: 'Start free trial',
    features: ['Unlimited products', 'Up to 25 teammates', 'Priority email support', 'Audit log'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    blurb: 'For organizations with advanced needs.',
    cta: 'Contact sales',
    features: ['Single sign-on', 'Unlimited teammates', 'Dedicated manager', '99.9% uptime SLA'],
  },
]

const faqs = [
  [
    'Can I switch plans later?',
    'Yes. Upgrade or downgrade at any time and we will prorate the difference on your next invoice.',
  ],
  ['Is there a free trial?', 'Team includes a 14-day free trial with no credit card required.'],
  [
    'How does billing work?',
    'Prices are per month, billed monthly. Annual billing saves two months and is available on request.',
  ],
]

function planGrid() {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        alignItems: 'stretch',
      }}
    >
      {plans.map((p) => (
        <Paper
          key={p.name}
          variant="outlined"
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            borderWidth: p.featured ? 2 : 1,
            borderColor: p.featured ? 'primary.main' : 'divider',
            boxShadow: p.featured ? 6 : 0,
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h2" component="h2" sx={{ fontSize: '1.5rem' }}>
              {p.name}
            </Typography>
            {p.featured && <Chip label="Most popular" color="primary" size="small" />}
          </Stack>
          <Typography color="text.secondary">{p.blurb}</Typography>
          <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
            {p.price}
            <Typography component="span" color="text.secondary">
              {' '}
              /month
            </Typography>
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, flexGrow: 1, '& li': { py: 0.5 } }}>
            {p.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </Box>
          <Button variant={p.featured ? 'contained' : 'outlined'} size="large" fullWidth>
            {p.cta}
          </Button>
        </Paper>
      ))}
    </Box>
  )
}

export function Pricing() {
  return (
    <Stack spacing={{ xs: 6, md: 8 }}>
      <Box sx={{ textAlign: 'center', py: { xs: 2, md: 4 }, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h1" component="h1">
          Pricing
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          sx={{ mt: 2, fontWeight: 400 }}
        >
          Simple, transparent plans that scale with your catalog. Start free and upgrade when you're
          ready.
        </Typography>
        <Button href="#/customers" variant="contained" size="large" sx={{ mt: 3 }}>
          Get started
        </Button>
      </Box>

      {planGrid()}

      <Box component="section" sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
        <Typography variant="h2" component="h2" sx={{ mb: 3 }}>
          Frequently asked questions
        </Typography>
        <Stack spacing={3}>
          {faqs.map(([q, a]) => (
            <div key={q}>
              <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem' }}>
                {q}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {a}
              </Typography>
            </div>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
