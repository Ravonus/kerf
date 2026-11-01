import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Pricing', description: 'Free for one person. Simple per-seat pricing for teams.' }

const plans = [
  { name: 'Starter', price: '$0', unit: 'forever', blurb: 'For a founder reading their own calls.', items: ['50 calls a month', 'Signals board', 'CSV export'], cta: 'Join for free' },
  { name: 'Team', price: '$24', unit: 'per seat, per month', blurb: 'For product teams that share a roadmap.', items: ['Unlimited calls', 'CRM and Slack digests', 'Team spaces', 'Priority support'], cta: 'Get early access', featured: true },
  { name: 'Enterprise', price: 'Talk to us', unit: 'billed yearly', blurb: 'For companies with records to keep.', items: ['Everything in Team', 'Single sign-on', 'Audit log', 'Data residency'], cta: 'Get in line' },
]

const questions = [
  { q: 'When does it open?', a: 'The first teams start this winter. Everyone on the waitlist hears from us in the order they joined.' },
  { q: 'Is the early price locked in?', a: 'Yes. Teams that join during early access keep their per-seat price for as long as they stay.' },
  { q: 'What happens to my data if I leave?', a: 'It’s yours. Export every signal and quote as CSV at any time, on any plan.' },
]

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:pt-20">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Simple pricing that grows with your team</h1>
        <p className="mt-4 text-lg text-muted">Free for one person. Pay per seat when the whole team comes along.</p>
      </header>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map(p => (
          <section key={p.name} aria-labelledby={p.name} className={`flex flex-col rounded-2xl border bg-raised p-7 ${p.featured ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
            <h2 id={p.name} className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-muted">{p.blurb}</p>
            <p className="mt-6 text-4xl font-bold tracking-tight">{p.price}</p>
            <p className="mt-1 text-sm text-muted">{p.unit}</p>
            <ul className="mt-6 mb-8 flex-1 space-y-2.5">
              {p.items.map(i => (
                <li key={i} className="flex gap-2.5">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 size-5 shrink-0 fill-none stroke-accent stroke-2"><path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {i}
                </li>
              ))}
            </ul>
            <Link href="/#join" className={`rounded-xl px-5 py-3 text-center font-semibold transition-colors ${p.featured ? 'bg-accent text-on-accent hover:bg-accent-strong' : 'border border-line hover:border-ink'}`}>{p.cta}</Link>
          </section>
        ))}
      </div>

      <section aria-labelledby="faq" className="mt-20 max-w-3xl">
        <h2 id="faq" className="text-2xl font-bold tracking-tight">Questions</h2>
        <div className="mt-5 divide-y divide-line border-y border-line">
          {questions.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
