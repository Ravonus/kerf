import Image from 'next/image'
import hero from '@/assets/hero.webp'
import { WaitlistForm } from '@/components/waitlist-form'

const features = [
  { title: 'Every call, heard', body: 'Emberline reads your sales and support calls and pulls out each request, in the customer’s own words.' },
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
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:pt-20">
        <div>
          <p className="mb-4 text-sm font-semibold text-accent">Early access opens this winter</p>
          <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Hear what customers keep asking for
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted">
            Emberline listens to your customer calls and turns them into a ranked list of what to build next.
          </p>
          <div className="mt-8 max-w-md">
            <WaitlistForm />
          </div>
        </div>
        <Image
          src={hero}
          alt="The Emberline board: customer requests grouped into Now, Next and Later, with a quote from a renewal call"
          sizes="(min-width: 1200px) 600px, (min-width: 1024px) 52vw, 100vw"
          placeholder="blur"
          preload
          className="h-auto w-full rounded-3xl"
        />
      </section>

      <section aria-labelledby="why" className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <h2 id="why" className="max-w-2xl text-3xl font-bold tracking-tight text-balance">Stop losing what customers tell you</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {features.map(f => (
            <article key={f.title} className="rounded-2xl border border-line bg-raised p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <h2 id="how" className="text-3xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="flex size-9 items-center justify-center rounded-full bg-tint text-sm font-bold text-accent">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
