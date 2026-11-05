import { For } from 'solid-js'

import {
  ArrowRight,
  Building2,
  Check,
  FileCheck2,
  KeyRound,
  Library,
  MessageCircleQuestion,
  School,
  ShieldCheck,
  UserCheck,
} from '~/components/ui/icons'

import { Lemon, type LemonExpression, type LemonPose } from '~/components/lemon'
import { Badge, Container, Eyebrow, Section, SectionHeader, surfaceStyles } from '~/components/ui'
import { CoachDemo } from './coach-demo'

/* ─────────────────────────── How it works ─────────────────────────── */

const STEPS: Array<{ title: string; body: string; expression: LemonExpression; pose: LemonPose }> =
  [
    {
      title: 'Spark',
      body: 'Find a problem worth solving: on your street, at school, in your group chat. Pick the idea you actually care about.',
      expression: 'thinking',
      pose: 'think',
    },
    {
      title: 'Test',
      body: 'Talk to real people and run a tiny experiment, like a sign-up sheet, a sample or a sketch, before spending a dollar.',
      expression: 'curious',
      pose: 'clipboard',
    },
    {
      title: 'Build & price',
      body: 'Make the first version, count the costs and set a price that works. Real math, with a real reason to care.',
      expression: 'focused',
      pose: 'point',
    },
    {
      title: 'Launch',
      body: 'Pitch it, and open the stand once a parent or teacher says yes. Every kid leaves with a portfolio of what they made.',
      expression: 'excited',
      pose: 'celebrate',
    },
  ]

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title">
      <Container>
        <SectionHeader
          id="how-title"
          eyebrow={<Eyebrow>How it works</Eyebrow>}
          title={
            <>
              From “what if” to <span class="mark">first customer</span>.
            </>
          }
          lead="Lemonstand follows the path real founders take, sized for a kid. Every step ends with something they made, so progress is visible to them, their teacher and their family."
        />
        <ol class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <For each={STEPS}>
            {(s, i) => (
              <li class={surfaceStyles('card', 'flex flex-col overflow-hidden')}>
                <div class="relative flex h-44 items-end justify-center bg-lemon-soft pt-4">
                  <span class="absolute top-3.5 left-4 font-display text-sm font-semibold text-primary-ink tabular-nums">
                    0{i() + 1}
                  </span>
                  <Lemon
                    uid={`step-${i()}`}
                    expression={s.expression}
                    pose={s.pose}
                    size={150}
                    shadow={false}
                    decorative
                    class="translate-y-3"
                  />
                </div>
                <div class="flex-1 border-t border-line p-6">
                  <h3 class="font-display text-display-sm font-medium">{s.title}</h3>
                  <p class="mt-2 leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Meet Lemon ─────────────────────────── */

const GUARDRAILS = [
  {
    icon: MessageCircleQuestion,
    title: 'Asks instead of answers',
    body: "Lemon gives hints and questions. It won't write the plan, the pitch or the homework.",
  },
  {
    icon: KeyRound,
    title: 'Never asks for personal info',
    body: 'Lemon is designed not to ask kids for names, addresses, photos or anything that identifies them.',
  },
  {
    icon: UserCheck,
    title: 'Grown-ups approve going public',
    body: 'Nothing is published, sold or paid for until a parent, guardian or teacher approves it.',
  },
  {
    icon: FileCheck2,
    title: 'People review the work',
    body: 'Progress is earned with real evidence that an educator reviews, not by clicking through.',
  },
]

export function MeetLemon() {
  return (
    <Section id="coach" tone="sunken" labelledBy="coach-title" grain>
      <Container class="grid items-start gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div class="lg:sticky lg:top-28">
          <CoachDemo />
          <p class="mt-4 text-center text-sm text-muted">
            An example conversation, shown for illustration.
          </p>
        </div>
        <div>
          <SectionHeader
            id="coach-title"
            eyebrow={<Eyebrow tone="leaf">Meet Lemon</Eyebrow>}
            title={
              <>
                A coach, <span class="mark">not a ghostwriter.</span>
              </>
            }
            lead="AI should make young people braver, not lazier. Lemon is there when the idea won't let go, asks one good question at a time, and never takes the pen out of their hand."
          />
          <h3 class="mt-12 flex items-center gap-2 text-eyebrow font-semibold text-muted uppercase">
            <ShieldCheck class="size-4 text-leaf-ink" /> Guardrails, built in
          </h3>
          <ul class="mt-5 grid gap-4 sm:grid-cols-2">
            <For each={GUARDRAILS}>
              {(g) => (
                <li class={surfaceStyles('card', 'p-5')}>
                  <span class="grid size-10 place-items-center rounded-control bg-leaf-soft text-leaf-ink">
                    <g.icon class="size-5" />
                  </span>
                  <h4 class="mt-4 font-semibold">{g.title}</h4>
                  <p class="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{g.body}</p>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Container>
    </Section>
  )
}

/* ─────────────────────────── Programs ─────────────────────────── */

const PROGRAMS = [
  {
    icon: Library,
    tag: 'Libraries & community centers',
    title: 'Lemonstand Club',
    formats: ['4-week club', '2-day camp'],
    cta: 'Plan a library club',
    points: [
      'Facilitator guide, slides and printable worksheets',
      'Works on shared devices, with no accounts needed at home',
      'Ends in a community showcase families can attend',
      'No business background needed to lead it',
    ],
  },
  {
    icon: School,
    tag: 'Schools & classrooms',
    title: 'Venture Builder course',
    formats: ['12-week course', '1-month sprint'],
    cta: 'Bring it to your classroom',
    points: [
      'Fits business, CTE, advisory or after-school blocks',
      'Evidence from every step, organized for quick review',
      'A portfolio of real work for every student',
      'Standards alignment docs on request',
    ],
  },
  {
    icon: Building2,
    tag: 'Districts & nonprofits',
    title: 'Community Partnership',
    formats: ['Multi-site partnership'],
    cta: 'Start a partnership',
    points: [
      'Sponsored seats so cost is never the barrier',
      'Impact reporting you can share with funders and boards',
      'Privacy and security packet for procurement review',
      'Staff training and a named partner contact',
    ],
  },
]

export function Programs() {
  return (
    <Section id="programs" labelledBy="programs-title">
      <Container>
        <SectionHeader
          id="programs-title"
          align="center"
          eyebrow={<Eyebrow>Programs</Eyebrow>}
          title={
            <>
              Run it at the library, in class, or <span class="mark">across a district</span>.
            </>
          }
          lead="The same kid-centered journey comes in three sizes. Start with one Thursday club and grow into a course when you're ready."
        />
        <div class="mt-14 grid gap-5 lg:grid-cols-3">
          <For each={PROGRAMS}>
            {(p) => (
              <article class={surfaceStyles('card', 'flex flex-col p-7')}>
                <div class="flex items-center justify-between gap-3">
                  <span class="grid size-11 place-items-center rounded-control bg-gold-soft text-primary-ink ring-1 ring-primary/15">
                    <p.icon class="size-5" />
                  </span>
                  <p class="text-right text-xs font-semibold text-muted">{p.tag}</p>
                </div>
                <h3 class="mt-6 font-display text-display-sm font-medium">{p.title}</h3>
                <div class="mt-3 flex flex-wrap gap-2">
                  <For each={p.formats}>{(f) => <Badge tone="neutral">{f}</Badge>}</For>
                </div>
                <ul class="mt-6 grid gap-3 border-t border-line pt-6 text-[0.95rem]">
                  <For each={p.points}>
                    {(point) => (
                      <li class="flex gap-2.5">
                        <Check class="mt-0.5 size-4.5 shrink-0 text-leaf-ink" strokeWidth={2.5} />
                        <span>{point}</span>
                      </li>
                    )}
                  </For>
                </ul>
                <a
                  href="#contact"
                  class="group mt-auto inline-flex min-h-11 items-center gap-1.5 pt-6 font-semibold text-primary-ink"
                >
                  {p.cta}
                  <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </article>
            )}
          </For>
        </div>
      </Container>
    </Section>
  )
}

export { Sponsor, Audiences, Safety, Faq, Contact, FinalCta } from './sections/partners'
