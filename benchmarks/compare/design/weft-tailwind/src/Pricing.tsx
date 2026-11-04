import { Button, Card } from './ui'

const plans = [
  {
    name: 'Starter',
    price: '$0',
    note: 'For individuals getting going',
    cta: 'Start for free',
    featured: false,
    features: ['Up to 3 projects', '1 team member', 'Community support'],
  },
  {
    name: 'Team',
    price: '$29',
    note: 'For growing teams, per seat',
    cta: 'Start free trial',
    featured: true,
    features: ['Unlimited projects', 'Up to 25 members', 'Priority email support', 'Audit log'],
  },
  {
    name: 'Enterprise',
    price: '$99',
    note: 'For organisations, per seat',
    cta: 'Contact sales',
    featured: false,
    features: ['Unlimited members', 'Single sign-on', 'Dedicated manager', '99.99% uptime SLA'],
  },
]
const faqs = [
  [
    'Can I change plans later?',
    'Yes. Upgrade or downgrade at any time and we prorate the difference on your next invoice.',
  ],
  ['Is there a free trial?', 'Team comes with a 14-day trial. No card is needed to start.'],
  ['How does billing work?', 'Plans are billed monthly per seat. Annual billing saves two months.'],
]

export function Pricing() {
  return (
    <section class="flex flex-col gap-12">
      <header class="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-12 text-center text-white sm:py-16">
        <h1 class="text-3xl font-bold tracking-tight sm:text-5xl">Pricing</h1>
        <p class="mx-auto mt-4 max-w-xl text-indigo-100">
          Simple plans that scale with your team. Start free, upgrade when you're ready.
        </p>
        <a
          href="#/pricing"
          class="mt-8 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Compare plans
        </a>
      </header>
      <div class="grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.name}
            class={`flex flex-col ${p.featured ? 'ring-2 ring-indigo-600 lg:scale-105 dark:ring-indigo-400' : ''}`}
          >
            <h2 class="text-lg font-semibold">{p.name}</h2>
            <p class="text-sm text-slate-600 dark:text-slate-400">{p.note}</p>
            <p class="mt-4 text-4xl font-bold">
              {p.price}
              <span class="text-base font-normal text-slate-500"> /mo</span>
            </p>
            <ul class="my-6 flex flex-1 flex-col gap-2 text-sm">
              {p.features.map((f) => (
                <li key={f} class="flex gap-2">
                  <span aria-hidden="true" class="text-indigo-600 dark:text-indigo-400">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Button tone={p.featured ? 'primary' : 'secondary'}>{p.cta}</Button>
          </Card>
        ))}
      </div>
      <section class="mx-auto w-full max-w-3xl">
        <h2 class="mb-6 text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        <div class="flex flex-col gap-4">
          {faqs.map(([q, a]) => (
            <div key={q} class="border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3 class="font-semibold">{q}</h3>
              <p class="mt-1 text-slate-600 dark:text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}
