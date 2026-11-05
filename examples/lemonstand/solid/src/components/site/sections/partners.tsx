import { For } from 'solid-js'

import {
  ArrowRight,
  BookOpen,
  Check,
  EyeOff,
  HandCoins,
  HandHelping,
  Heart,
  LineChart,
  Plus,
  ShieldCheck,
  KeyRound,
  UserCheck,
  Users,
} from '~/components/ui/icons'
import { Lemon } from '~/components/lemon'
import {
  ButtonLink,
  Container,
  Eyebrow,
  Section,
  SectionHeader,
  surfaceStyles,
} from '~/components/ui'
import { ContactForm } from '../contact-form'
import { WaitlistForm } from '../waitlist-form'

/* ─────────────────────────── Mission / sponsored seats ─────────────────────────── */

const PILLARS = [
  {
    icon: HandCoins,
    title: 'Sponsored seats',
    body: 'Businesses, foundations and community groups fund seats for libraries, Title I schools and youth nonprofits.',
  },
  {
    icon: LineChart,
    title: 'Reporting funders can use',
    body: 'Completion, skills and the projects kids built, shared in a format you can bring to your board.',
  },
  {
    icon: Heart,
    title: 'Community first',
    body: 'Kids solve local problems for local customers. The showcase is a neighborhood event, not a leaderboard.',
  },
]

export function Sponsor() {
  return (
    <Section id="sponsor" tone="navy" labelledBy="sponsor-title" class="relative overflow-hidden">
      <Container class="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Eyebrow tone="onNavy">Mission & sponsored seats</Eyebrow>
          <h2 id="sponsor-title" class="mt-4 font-display text-display-lg font-medium text-balance">
            A first try at business shouldn&apos;t depend on whose parents own one.
          </h2>
          <p class="mt-5 max-w-xl text-lead text-white/80">
            Lemonstand is built to be funded by the communities it serves: school budgets, library
            grants and sponsors who want every kid to get a first try.
          </p>
          <ul class="mt-10 grid gap-6 sm:grid-cols-3">
            <For each={PILLARS}>
              {(p) => (
                <li>
                  <p.icon class="size-6 text-lemon" />
                  <h3 class="mt-3 font-semibold">{p.title}</h3>
                  <p class="mt-1.5 text-[0.95rem] leading-relaxed text-white/75">{p.body}</p>
                </li>
              )}
            </For>
          </ul>
          <div class="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="#contact" variant="lemon" size="lg">
              <HandHelping class="size-5" /> Sponsor seats
            </ButtonLink>
            <ButtonLink href="#contact" variant="inverse" size="lg">
              Ask about grant support
            </ButtonLink>
          </div>
        </div>
        <div class="relative mx-auto w-full max-w-sm">
          <div
            aria-hidden="true"
            class="absolute inset-[4%] top-[10%] rounded-full bg-white/6 ring-1 ring-white/10"
          />
          <div
            aria-hidden="true"
            class="absolute inset-[14%] top-[20%] rounded-full bg-[#eef2fb]"
          />
          <Lemon
            uid="sponsor"
            expression="proud"
            pose="present"
            class="relative mx-auto h-auto w-[78%]"
            label="Lemon, looking proud and presenting with an open hand"
          />
        </div>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Families vs. educators ─────────────────────────── */

function audienceColumns() {
  return [
    {
      id: 'families',
      icon: Users,
      eyebrow: 'For families',
      title: 'Screen time that builds something real.',
      points: [
        'For ages 8–18, with coaching that adjusts to reading level and age',
        'You approve anything public, paid or sold',
        'No ads. We never sell student data',
        'Works on a phone or a shared computer',
      ],
      cta: { label: 'Join the waitlist', href: '#join' },
      expression: 'encouraging' as const,
    },
    {
      id: 'educators',
      icon: BookOpen,
      eyebrow: 'For educators & librarians',
      title: 'A program you can run on Thursday.',
      points: [
        'Facilitator guide, slides and printable worksheets',
        'Lemon handles one-on-one nudges so you can focus on the room',
        'Evidence from every step, organized for quick review',
        'Standards alignment docs on request',
      ],
      cta: { label: 'Plan a pilot', href: '#contact' },
      expression: 'happy' as const,
    },
  ]
}

export function Audiences() {
  const cols = audienceColumns()
  return (
    <Section id="audiences" labelledBy="audiences-title">
      <Container>
        <SectionHeader
          id="audiences-title"
          eyebrow={<Eyebrow>Who it&apos;s for</Eyebrow>}
          title={
            <>
              Built with the people who <span class="mark">raise founders</span>.
            </>
          }
        />
        <div class="mt-12 grid gap-5 lg:grid-cols-2">
          <For each={cols}>
            {(c) => (
              <article
                class={surfaceStyles('card', 'relative flex flex-col overflow-hidden p-7 sm:p-9')}
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <Eyebrow tone={c.id === 'families' ? 'leaf' : 'amber'}>{c.eyebrow}</Eyebrow>
                    <h3 class="mt-3 max-w-sm font-display text-display-md font-medium text-balance">
                      {c.title}
                    </h3>
                  </div>
                  <c.icon class="size-7 shrink-0 text-muted" />
                </div>
                <ul class="mt-7 grid gap-3.5">
                  <For each={c.points}>
                    {(p) => (
                      <li class="flex gap-3">
                        <Check class="mt-0.5 size-5 shrink-0 text-leaf-ink" strokeWidth={2.5} />
                        <span>{p}</span>
                      </li>
                    )}
                  </For>
                </ul>
                <div class="mt-auto pt-8">
                  <ButtonLink href={c.cta.href} variant={c.id === 'families' ? 'primary' : 'ink'}>
                    {c.cta.label} <ArrowRight class="size-4" />
                  </ButtonLink>
                </div>
              </article>
            )}
          </For>
        </div>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Safety & privacy ─────────────────────────── */

const SAFETY = [
  {
    icon: EyeOff,
    title: 'No ads. We never sell student data.',
    body: "Lemonstand doesn't show ads to kids and doesn't sell what they share. Full stop.",
  },
  {
    icon: ShieldCheck,
    title: 'Designed around COPPA and FERPA',
    body: "Children's privacy and student-record rules shaped the product from the first sketch, not after launch.",
  },
  {
    icon: KeyRound,
    title: 'Minimal data by default',
    body: "We collect what's needed to run the program and nothing more. Lemon doesn't ask kids for personal details.",
  },
  {
    icon: UserCheck,
    title: 'Adults stay in the loop',
    body: 'Parents and educators approve anything public or paid, and educators review the work along the way.',
  },
]

export function Safety() {
  return (
    <Section id="safety" tone="surface" labelledBy="safety-title" class="border-y border-line">
      <Container class="grid gap-14 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <SectionHeader
            id="safety-title"
            eyebrow={<Eyebrow tone="leaf">Safety & privacy</Eyebrow>}
            title="Built for kids, so privacy comes first."
            lead="Schools and districts reviewing Lemonstand get our privacy, security and AI-safety documentation on request."
          />
          <div class="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#contact" variant="secondary">
              Request the privacy packet
            </ButtonLink>
            <ButtonLink href="/privacy" variant="ghost">
              Privacy policy <ArrowRight class="size-4" />
            </ButtonLink>
          </div>
        </div>
        <ul class="grid gap-px overflow-hidden rounded-card bg-line ring-1 ring-line sm:grid-cols-2">
          <For each={SAFETY}>
            {(item) => (
              <li class="bg-surface p-6 sm:p-7">
                <item.icon class="size-6 text-leaf-ink" />
                <h3 class="mt-4 font-semibold text-pretty">{item.title}</h3>
                <p class="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{item.body}</p>
              </li>
            )}
          </For>
        </ul>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── FAQ ─────────────────────────── */

const FAQS = [
  [
    'What ages is Lemonstand for?',
    'Ages 8 to 18. Lemon adjusts reading level and examples to each learner, and facilitators can group kids by age or mix them, since older kids make great mentors.',
  ],
  [
    'Does the AI do the work for kids?',
    "No. Lemon is a coach, not a ghostwriter. It asks questions and gives hints, and the ideas, interviews, prices and pitches are the kid's own.",
  ],
  [
    'Do kids need their own computer?',
    'No. Library and classroom versions work on shared devices, and core activities have printable versions. A phone is enough for kids working from home.',
  ],
  [
    'Do I need business or tech experience to lead it?',
    'Not at all. The facilitator guide walks you through every session, and Lemon handles the one-on-one nudges so you can focus on the room.',
  ],
  [
    'Does it cost anything?',
    "Joining the waitlist is free. We're working with pilot partners on fair pricing for schools and districts, and on sponsored seats so libraries, Title I schools and youth nonprofits can run it at low or no cost.",
  ],
  [
    'Do kids actually sell things?',
    "They can, with a parent or guardian's OK. Many programs end with a showcase or market day; others stop at prototypes and pitches. You decide what fits your community.",
  ],
  [
    'How is student data handled?',
    'We collect the minimum needed to run the program, never sell it and never show ads. Lemonstand is designed around COPPA and FERPA, and we share our privacy and AI-safety documentation with any school or district reviewing it.',
  ],
  [
    'Can homeschool groups or co-ops join?',
    'Yes. Homeschool pods and co-ops are a great fit. Tell us about your group in the contact form below.',
  ],
] as const

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <Container class="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
        <SectionHeader
          id="faq-title"
          eyebrow={<Eyebrow>FAQ</Eyebrow>}
          title="Questions we hear a lot"
        />
        <div class="divide-y divide-line border-y border-line">
          <For each={FAQS}>
            {(faq) => (
              <details class="group">
                <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-5 text-[1.05rem] font-semibold">
                  {faq[0]}
                  <Plus class="faq-icon size-5 shrink-0 text-primary-ink transition-transform duration-200" />
                </summary>
                <p class="-mt-1 pb-6 leading-relaxed text-pretty text-muted">{faq[1]}</p>
              </details>
            )}
          </For>
        </div>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Contact ─────────────────────────── */

const NOTES = [
  ['Now booking pilot partners for 2026–27', 'Clubs, camps, courses and multi-site partnerships.'],
  ['A person replies, not a bot', 'Someone on our team reads every note.'],
  ['Docs on request', 'Privacy, safety, standards alignment and grant support.'],
] as const

export function Contact() {
  return (
    <Section id="contact" tone="sunken" labelledBy="contact-title" grain>
      <Container class="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <SectionHeader
            id="contact-title"
            eyebrow={<Eyebrow>Contact</Eyebrow>}
            title="Bring Lemonstand to your community."
            lead="Teachers, librarians, district leaders, nonprofits, sponsors and curious parents: tell us what you're picturing, and we'll help you shape it."
          />
          <ul class="mt-8 grid gap-4">
            <For each={NOTES}>
              {(row) => (
                <li class="flex gap-3">
                  <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-leaf text-white">
                    <Check class="size-3.5" strokeWidth={3} />
                  </span>
                  <div>
                    <p class="font-semibold">{row[0]}</p>
                    <p class="text-[0.95rem] text-muted">{row[1]}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <div class="mt-10 hidden lg:block">
            <Lemon uid="contact" expression="encouraging" pose="clipboard" size={260} decorative />
          </div>
        </div>
        <div class={surfaceStyles('card', 'p-6 sm:p-9')}>
          <ContactForm />
        </div>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Final CTA ─────────────────────────── */

export function FinalCta() {
  return (
    <Section id="join" labelledBy="join-title">
      <Container>
        <div class="relative overflow-hidden rounded-panel bg-navy px-6 py-14 text-white shadow-navy sm:px-12 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10 lg:py-16">
          <div class="relative max-w-xl">
            <Eyebrow tone="onNavy">Early access</Eyebrow>
            <h2 id="join-title" class="mt-4 font-display text-display-lg font-medium text-balance">
              The first stand opens soon. <span class="text-lemon">Save your spot.</span>
            </h2>
            <p class="mt-4 text-lead text-white/80">
              Waitlist families and educators get first invites and a say in what we build next.
            </p>
            <div class="mt-8">
              <WaitlistForm source="footer-cta" tone="dark" />
            </div>
          </div>
          <div class="relative mx-auto mt-10 w-48 sm:w-56 lg:mt-0 lg:w-64">
            <div
              aria-hidden="true"
              class="absolute inset-x-[4%] top-[14%] aspect-square rounded-full bg-[#eef2fb]"
            />
            <Lemon
              uid="final"
              expression="excited"
              pose="celebrate"
              class="relative h-auto w-full"
              label="Lemon, jumping with both arms up"
            />
          </div>
        </div>
      </Container>
    </Section>
  )
}
