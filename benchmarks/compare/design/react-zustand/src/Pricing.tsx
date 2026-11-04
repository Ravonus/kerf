import { Button, card } from './ui'

const plans = [
  {
    name: 'Starter',
    price: '$0',
    blurb: 'For individuals trying things out.',
    cta: 'Start for free',
    features: ['Up to 25 customers', '1 team member', 'Email support'],
  },
  {
    name: 'Team',
    price: '$29',
    blurb: 'For growing teams that need to move fast.',
    cta: 'Start Team trial',
    featured: true,
    features: [
      'Unlimited customers',
      'Up to 10 team members',
      'Roles and permissions',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: '$99',
    blurb: 'For organisations with advanced needs.',
    cta: 'Talk to sales',
    features: [
      'Everything in Team',
      'Unlimited team members',
      'Single sign-on',
      'Dedicated success manager',
    ],
  },
]

const faqs = [
  {
    q: 'Can I change plans later?',
    a: 'Yes. Upgrade or downgrade at any time and we’ll prorate the difference on your next invoice.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Team comes with a 14-day trial. No credit card is needed to start.',
  },
  {
    q: 'How does billing work?',
    a: 'Prices are per seat, per month. Pay by card or invoice, and cancel whenever you like.',
  },
]

export function Pricing() {
  return (
    <>
      <section className="mb-12 rounded-3xl bg-linear-to-br from-indigo-600 to-violet-700 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-indigo-100 sm:text-lg">
          Simple plans that scale with your customer base. Start free and upgrade when you’re ready.
        </p>
        <a
          href="#/customers"
          className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-white px-6 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          Get started today
        </a>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <article
            key={p.name}
            className={`${card} flex flex-col p-6 sm:p-8 ${p.featured ? 'border-2 border-indigo-600 shadow-lg md:-translate-y-2 dark:border-indigo-400' : ''}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              {p.featured && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  Most popular
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{p.blurb}</p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">/ seat / month</span>
            </p>
            <ul className="my-6 flex-1 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-indigo-600 dark:text-indigo-400">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Button variant={p.featured ? 'primary' : 'secondary'}>{p.cta}</Button>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        <dl className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <h3 className="font-medium">
                <dt>{f.q}</dt>
              </h3>
              <dd className="mt-2 text-slate-600 dark:text-slate-400">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
