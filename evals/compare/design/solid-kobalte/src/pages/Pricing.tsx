import { For } from 'solid-js'

const plans = [
  { name: 'Starter', price: '$0', blurb: 'For individuals getting going.', cta: 'Start for free', features: ['Up to 100 customers', '1 team member', 'Basic reports', 'Community support'] },
  { name: 'Team', price: '$29', blurb: 'For growing teams that need more.', cta: 'Start free trial', featured: true, features: ['Unlimited customers', 'Up to 15 team members', 'Advanced reports', 'Priority email support'] },
  { name: 'Enterprise', price: '$99', blurb: 'For organisations with advanced needs.', cta: 'Contact sales', features: ['Unlimited everything', 'Single sign-on', 'Audit logs', 'Dedicated success manager'] },
]
const faqs = [
  ['Can I change plans later?', 'Yes. Upgrade or downgrade at any time and we’ll prorate the difference on your next invoice.'],
  ['Is there a free trial?', 'Team comes with a 14-day free trial. No credit card is required to get started.'],
  ['How does billing work?', 'Plans are billed per team member each month. Annual billing saves two months.'],
]

export default function Pricing() {
  return (
    <>
      <section class="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-12 text-center text-white sm:px-12 sm:py-16 dark:from-indigo-700 dark:to-violet-900">
        <h1 class="text-3xl font-bold tracking-tight sm:text-5xl">Pricing</h1>
        <p class="mx-auto mt-4 max-w-xl text-lg text-indigo-100">Simple, transparent plans that scale with your business. Start free and upgrade when you’re ready.</p>
        <a href="#plans" class="mt-8 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Compare plans</a>
      </section>

      <section id="plans" class="mt-12 grid gap-6 lg:grid-cols-3 lg:items-stretch" aria-label="Plans">
        <For each={plans}>
          {(p) => (
            <div class={`card relative flex flex-col p-6 sm:p-8 ${p.featured ? 'border-2 !border-indigo-600 shadow-lg lg:-my-3 dark:!border-indigo-400' : ''}`}>
              {p.featured && <span class="absolute -top-3 left-6 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white dark:bg-indigo-400 dark:text-slate-950">Most popular</span>}
              <h2 class="text-xl font-semibold">{p.name}</h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{p.blurb}</p>
              <p class="mt-6"><span class="text-4xl font-bold">{p.price}</span><span class="text-slate-600 dark:text-slate-400"> / month</span></p>
              <ul class="my-6 flex-1 space-y-3 text-sm">
                <For each={p.features}>{(f) => <li class="flex gap-2"><span class="text-indigo-600 dark:text-indigo-400" aria-hidden="true">✓</span>{f}</li>}</For>
              </ul>
              <button type="button" class={`btn ${p.featured ? 'btn-primary' : 'btn-secondary'}`}>{p.cta}</button>
            </div>
          )}
        </For>
      </section>

      <section class="mx-auto mt-16 max-w-3xl">
        <h2 class="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        <dl class="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
          <For each={faqs}>
            {([q, a]) => (
              <div class="py-5">
                <dt><h3 class="font-semibold">{q}</h3></dt>
                <dd class="mt-2 text-slate-600 dark:text-slate-400">{a}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
    </>
  )
}
