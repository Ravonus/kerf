import { For } from "solid-js";

import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  EyeOff,
  FileCheck2,
  HandCoins,
  HandHelping,
  Heart,
  KeyRound,
  Library,
  LineChart,
  MessageCircleQuestion,
  Plus,
  School,
  ShieldCheck,
  UserCheck,
  Users,
} from "~/components/ui/icons";

import { Lemon, type LemonExpression, type LemonPose } from "~/components/lemon";
import { Badge, ButtonLink, Container, Eyebrow, Section, SectionHeader, surfaceStyles } from "~/components/ui";
import { CoachDemo } from "./coach-demo";
import { ContactForm } from "./contact-form";
import { WaitlistForm } from "./waitlist-form";

/* ─────────────────────────── How it works ─────────────────────────── */

const STEPS: Array<{ title: string; body: string; expression: LemonExpression; pose: LemonPose }> = [
  {
    title: "Spark",
    body: "Find a problem worth solving: on your street, at school, in your group chat. Pick the idea you actually care about.",
    expression: "thinking",
    pose: "think",
  },
  {
    title: "Test",
    body: "Talk to real people and run a tiny experiment, like a sign-up sheet, a sample or a sketch, before spending a dollar.",
    expression: "curious",
    pose: "clipboard",
  },
  {
    title: "Build & price",
    body: "Make the first version, count the costs and set a price that works. Real math, with a real reason to care.",
    expression: "focused",
    pose: "point",
  },
  {
    title: "Launch",
    body: "Pitch it, and open the stand once a parent or teacher says yes. Every kid leaves with a portfolio of what they made.",
    expression: "excited",
    pose: "celebrate",
  },
];

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
          <For each={STEPS}>{(s, i) => (
            <li class={surfaceStyles("card", "flex flex-col overflow-hidden")}>
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
          )}</For>
        </ol>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── Meet Lemon ─────────────────────────── */

const GUARDRAILS = [
  {
    icon: MessageCircleQuestion,
    title: "Asks instead of answers",
    body: "Lemon gives hints and questions. It won't write the plan, the pitch or the homework.",
  },
  {
    icon: KeyRound,
    title: "Never asks for personal info",
    body: "Lemon is designed not to ask kids for names, addresses, photos or anything that identifies them.",
  },
  {
    icon: UserCheck,
    title: "Grown-ups approve going public",
    body: "Nothing is published, sold or paid for until a parent, guardian or teacher approves it.",
  },
  {
    icon: FileCheck2,
    title: "People review the work",
    body: "Progress is earned with real evidence that an educator reviews, not by clicking through.",
  },
];

export function MeetLemon() {
  return (
    <Section id="coach" tone="sunken" labelledBy="coach-title" grain>
      <Container class="grid items-start gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div class="lg:sticky lg:top-28">
          <CoachDemo />
          <p class="mt-4 text-center text-sm text-muted">An example conversation, shown for illustration.</p>
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
            <For each={GUARDRAILS}>{(g) => (
              <li class={surfaceStyles("card", "p-5")}>
                <span class="grid size-10 place-items-center rounded-control bg-leaf-soft text-leaf-ink">
                  <g.icon class="size-5" />
                </span>
                <h4 class="mt-4 font-semibold">{g.title}</h4>
                <p class="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{g.body}</p>
              </li>
            )}</For>
          </ul>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── Programs ─────────────────────────── */

const PROGRAMS = [
  {
    icon: Library,
    tag: "Libraries & community centers",
    title: "Lemonstand Club",
    formats: ["4-week club", "2-day camp"],
    cta: "Plan a library club",
    points: [
      "Facilitator guide, slides and printable worksheets",
      "Works on shared devices, with no accounts needed at home",
      "Ends in a community showcase families can attend",
      "No business background needed to lead it",
    ],
  },
  {
    icon: School,
    tag: "Schools & classrooms",
    title: "Venture Builder course",
    formats: ["12-week course", "1-month sprint"],
    cta: "Bring it to your classroom",
    points: [
      "Fits business, CTE, advisory or after-school blocks",
      "Evidence from every step, organized for quick review",
      "A portfolio of real work for every student",
      "Standards alignment docs on request",
    ],
  },
  {
    icon: Building2,
    tag: "Districts & nonprofits",
    title: "Community Partnership",
    formats: ["Multi-site partnership"],
    cta: "Start a partnership",
    points: [
      "Sponsored seats so cost is never the barrier",
      "Impact reporting you can share with funders and boards",
      "Privacy and security packet for procurement review",
      "Staff training and a named partner contact",
    ],
  },
];

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
          <For each={PROGRAMS}>{(p) => (
            <article class={surfaceStyles("card", "flex flex-col p-7")}>
              <div class="flex items-center justify-between gap-3">
                <span class="grid size-11 place-items-center rounded-control bg-gold-soft text-primary-ink ring-1 ring-primary/15">
                  <p.icon class="size-5" />
                </span>
                <p class="text-right text-xs font-semibold text-muted">{p.tag}</p>
              </div>
              <h3 class="mt-6 font-display text-display-sm font-medium">{p.title}</h3>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={p.formats}>{(f) => (
                  <Badge tone="neutral">
                    {f}
                  </Badge>
                )}</For>
              </div>
              <ul class="mt-6 grid gap-3 border-t border-line pt-6 text-[0.95rem]">
                <For each={p.points}>{(point) => (
                  <li class="flex gap-2.5">
                    <Check class="mt-0.5 size-4.5 shrink-0 text-leaf-ink" strokeWidth={2.5} />
                    <span>{point}</span>
                  </li>
                )}</For>
              </ul>
              <a
                href="#contact"
                class="group mt-auto inline-flex min-h-11 items-center gap-1.5 pt-6 font-semibold text-primary-ink"
              >
                {p.cta}
                <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </article>
          )}</For>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── Mission / sponsored seats ─────────────────────────── */

const PILLARS = [
  {
    icon: HandCoins,
    title: "Sponsored seats",
    body: "Businesses, foundations and community groups fund seats for libraries, Title I schools and youth nonprofits.",
  },
  {
    icon: LineChart,
    title: "Reporting funders can use",
    body: "Completion, skills and the projects kids built, shared in a format you can bring to your board.",
  },
  {
    icon: Heart,
    title: "Community first",
    body: "Kids solve local problems for local customers. The showcase is a neighborhood event, not a leaderboard.",
  },
];

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
            Lemonstand is built to be funded by the communities it serves: school budgets, library grants and sponsors
            who want every kid to get a first try.
          </p>
          <ul class="mt-10 grid gap-6 sm:grid-cols-3">
            <For each={PILLARS}>{(p) => (
              <li>
                <p.icon class="size-6 text-lemon" />
                <h3 class="mt-3 font-semibold">{p.title}</h3>
                <p class="mt-1.5 text-[0.95rem] leading-relaxed text-white/75">{p.body}</p>
              </li>
            )}</For>
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
          <div aria-hidden="true" class="absolute inset-[4%] top-[10%] rounded-full bg-white/6 ring-1 ring-white/10" />
          <div aria-hidden="true" class="absolute inset-[14%] top-[20%] rounded-full bg-[#eef2fb]" />
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
  );
}

/* ─────────────────────────── Families vs. educators ─────────────────────────── */

export function Audiences() {
  const cols = [
    {
      id: "families",
      icon: Users,
      eyebrow: "For families",
      title: "Screen time that builds something real.",
      points: [
        "For ages 8–18, with coaching that adjusts to reading level and age",
        "You approve anything public, paid or sold",
        "No ads. We never sell student data",
        "Works on a phone or a shared computer",
      ],
      cta: { label: "Join the waitlist", href: "#join" },
      expression: "encouraging" as const,
    },
    {
      id: "educators",
      icon: BookOpen,
      eyebrow: "For educators & librarians",
      title: "A program you can run on Thursday.",
      points: [
        "Facilitator guide, slides and printable worksheets",
        "Lemon handles one-on-one nudges so you can focus on the room",
        "Evidence from every step, organized for quick review",
        "Standards alignment docs on request",
      ],
      cta: { label: "Plan a pilot", href: "#contact" },
      expression: "happy" as const,
    },
  ];
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
          <For each={cols}>{(c) => (
            <article class={surfaceStyles("card", "relative flex flex-col overflow-hidden p-7 sm:p-9")}>
              <div class="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow tone={c.id === "families" ? "leaf" : "amber"}>{c.eyebrow}</Eyebrow>
                  <h3 class="mt-3 max-w-sm font-display text-display-md font-medium text-balance">{c.title}</h3>
                </div>
                <c.icon class="size-7 shrink-0 text-muted" />
              </div>
              <ul class="mt-7 grid gap-3.5">
                <For each={c.points}>{(p) => (
                  <li class="flex gap-3">
                    <Check class="mt-0.5 size-5 shrink-0 text-leaf-ink" strokeWidth={2.5} />
                    <span>{p}</span>
                  </li>
                )}</For>
              </ul>
              <div class="mt-auto pt-8">
                <ButtonLink href={c.cta.href} variant={c.id === "families" ? "primary" : "ink"}>
                  {c.cta.label} <ArrowRight class="size-4" />
                </ButtonLink>
              </div>
            </article>
          )}</For>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── Safety & privacy ─────────────────────────── */

const SAFETY = [
  {
    icon: EyeOff,
    title: "No ads. We never sell student data.",
    body: "Lemonstand doesn't show ads to kids and doesn't sell what they share. Full stop.",
  },
  {
    icon: ShieldCheck,
    title: "Designed around COPPA and FERPA",
    body: "Children's privacy and student-record rules shaped the product from the first sketch, not after launch.",
  },
  {
    icon: KeyRound,
    title: "Minimal data by default",
    body: "We collect what's needed to run the program and nothing more. Lemon doesn't ask kids for personal details.",
  },
  {
    icon: UserCheck,
    title: "Adults stay in the loop",
    body: "Parents and educators approve anything public or paid, and educators review the work along the way.",
  },
];

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
          <For each={SAFETY}>{(item) => (
            <li class="bg-surface p-6 sm:p-7">
              <item.icon class="size-6 text-leaf-ink" />
              <h3 class="mt-4 font-semibold text-pretty">{item.title}</h3>
              <p class="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{item.body}</p>
            </li>
          )}</For>
        </ul>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

const FAQS = [
  [
    "What ages is Lemonstand for?",
    "Ages 8 to 18. Lemon adjusts reading level and examples to each learner, and facilitators can group kids by age or mix them, since older kids make great mentors.",
  ],
  [
    "Does the AI do the work for kids?",
    "No. Lemon is a coach, not a ghostwriter. It asks questions and gives hints, and the ideas, interviews, prices and pitches are the kid's own.",
  ],
  [
    "Do kids need their own computer?",
    "No. Library and classroom versions work on shared devices, and core activities have printable versions. A phone is enough for kids working from home.",
  ],
  [
    "Do I need business or tech experience to lead it?",
    "Not at all. The facilitator guide walks you through every session, and Lemon handles the one-on-one nudges so you can focus on the room.",
  ],
  [
    "Does it cost anything?",
    "Joining the waitlist is free. We're working with pilot partners on fair pricing for schools and districts, and on sponsored seats so libraries, Title I schools and youth nonprofits can run it at low or no cost.",
  ],
  [
    "Do kids actually sell things?",
    "They can, with a parent or guardian's OK. Many programs end with a showcase or market day; others stop at prototypes and pitches. You decide what fits your community.",
  ],
  [
    "How is student data handled?",
    "We collect the minimum needed to run the program, never sell it and never show ads. Lemonstand is designed around COPPA and FERPA, and we share our privacy and AI-safety documentation with any school or district reviewing it.",
  ],
  [
    "Can homeschool groups or co-ops join?",
    "Yes. Homeschool pods and co-ops are a great fit. Tell us about your group in the contact form below.",
  ],
] as const;

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <Container class="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
        <SectionHeader id="faq-title" eyebrow={<Eyebrow>FAQ</Eyebrow>} title="Questions we hear a lot" />
        <div class="divide-y divide-line border-y border-line">
          <For each={FAQS}>{(faq) => (
            <details class="group">
              <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-5 text-[1.05rem] font-semibold">
                {faq[0]}
                <Plus
                  class="faq-icon size-5 shrink-0 text-primary-ink transition-transform duration-200" />
              </summary>
              <p class="-mt-1 pb-6 leading-relaxed text-pretty text-muted">{faq[1]}</p>
            </details>
          )}</For>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────── Contact ─────────────────────────── */

const NOTES = [
  ["Now booking pilot partners for 2026–27", "Clubs, camps, courses and multi-site partnerships."],
  ["A person replies, not a bot", "Someone on our team reads every note."],
  ["Docs on request", "Privacy, safety, standards alignment and grant support."],
] as const;

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
            <For each={NOTES}>{(row) => (
              <li class="flex gap-3">
                <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-leaf text-white">
                  <Check class="size-3.5" strokeWidth={3} />
                </span>
                <div>
                  <p class="font-semibold">{row[0]}</p>
                  <p class="text-[0.95rem] text-muted">{row[1]}</p>
                </div>
              </li>
            )}</For>
          </ul>
          <div class="mt-10 hidden lg:block">
            <Lemon uid="contact" expression="encouraging" pose="clipboard" size={260} decorative />
          </div>
        </div>
        <div class={surfaceStyles("card", "p-6 sm:p-9")}>
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
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
            <div aria-hidden="true" class="absolute inset-x-[4%] top-[14%] aspect-square rounded-full bg-[#eef2fb]" />
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
  );
}
