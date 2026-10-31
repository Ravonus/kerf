import { Button } from './ui'

const plans = [
  { name: 'Starter', price: '$0', blurb: 'For individuals getting going.', cta: 'Get started', features: ['Up to 100 customers', '1 team member', 'Basic reports', 'Community support'] },
  { name: 'Team', price: '$29', blurb: 'For growing teams that ship together.', cta: 'Start free trial', featured: true, features: ['Unlimited customers', 'Up to 15 team members', 'Advanced reports', 'Priority email support'] },
  { name: 'Enterprise', price: '$99', blurb: 'For organizations with advanced needs.', cta: 'Contact sales', features: ['Unlimited everything', 'Single sign-on', 'Audit log', 'Dedicated success manager'] },
]

const faqs = [
  ['Can I change plans later?', 'Yes. Upgrade or downgrade at any time and we’ll prorate the difference on your next invoice.'],
  ['Is there a free trial?', 'Team comes with a 14-day trial. No credit card is needed to start.'],
  ['How does billing work?', 'Plans are billed monthly per workspace. Price shown is per member per month, and annual billing saves 20%.'],
]

export function Pricing() {
  return (
    <>
      <section className="rounded-3xl bg-linear-to-br from-brand-600 to-brand-700 px-6 py-12 text-center text-white sm:py-16 dark:from-brand-700 dark:to-slate-900">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-brand-100 sm:text-lg">
          Simple plans that scale with your business. Start free and upgrade when you’re ready.
        </p>
        <a
          href="#plans"
          onClick={(e) => { e.preventDefault(); document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' }) }}
          className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-white px-6 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Compare plans
        </a>
      </section>

      <div id="plans" className="mt-10 grid scroll-mt-6 gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <section
            key={p.name}
            className={`relative flex flex-col rounded-2xl border bg-white p-6 dark:bg-slate-900 ${
              p.featured
                ? 'border-brand-500 shadow-lg ring-2 ring-brand-500 lg:-translate-y-2'
                : 'border-slate-200 shadow-xs dark:border-slate-800'
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">Most popular</span>
            )}
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{p.blurb}</p>
            <p className="mt-5">
              <span className="text-4xl font-bold tracking-tight">{p.price}</span>
              <span className="text-sm text-slate-600 dark:text-slate-400"> / member / month</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-brand-600 dark:text-brand-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Button variant={p.featured ? 'primary' : 'secondary'} className="mt-8 w-full">{p.cta}</Button>
          </section>
        ))}
      </div>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
          {faqs.map(([q, a]) => (
            <div key={q} className="py-5">
              <h3 className="font-semibold">{q}</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
