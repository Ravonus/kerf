import { For, type JSX } from "solid-js";

import { Lemon } from "~/components/lemon";
import { Badge, ButtonLink, CoachBubble, Container } from "~/components/ui";
import { ArrowRight, Check } from "~/components/ui/icons";
import { AudienceSwitch, type Audience } from "./audience-switch";
import { WaitlistForm } from "./waitlist-form";

const FACTS = ["Ages 8–18", "No ads. We never sell student data", "Designed around COPPA and FERPA"];

function Lead(props: { children?: JSX.Element }) {
  return <p class="max-w-xl text-lead text-pretty text-muted">{props.children}</p>;
}

const audiences: Audience[] = [
  {
    id: "families",
    label: "Families",
    short: "Families",
    panel: () => (
      <>
        <Lead>
          Your kid picks the idea, talks to real customers, sets a price and pitches it. Lemon, our AI coach, asks the
          questions that keep them moving. The thinking stays theirs, and you approve anything public.
        </Lead>
        <div class="mt-7 max-w-xl">
          <WaitlistForm source="hero-families" defaultRole="parent" />
        </div>
      </>
    ),
  },
  {
    id: "educators",
    label: "Educators & Libraries",
    short: "Educators",
    panel: () => (
      <>
        <Lead>
          A ready-to-run entrepreneurship program for library clubs, camps and classrooms. Run it as a 4-week club or
          2-day camp, or as a 12-week course or 1-month sprint. You don&apos;t need a business background to lead it.
        </Lead>
        <div class="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="#contact" size="lg">
            Plan a pilot <ArrowRight class="size-4" />
          </ButtonLink>
          <ButtonLink href="#programs" size="lg" variant="secondary">
            See the programs
          </ButtonLink>
        </div>
      </>
    ),
  },
  {
    id: "partners",
    label: "Districts & Sponsors",
    short: "Partners",
    panel: () => (
      <>
        <Lead>
          Bring Lemonstand to every school and library in your community. Sponsored seats keep cost from being the
          barrier, and our privacy and AI-safety documentation is ready for your review.
        </Lead>
        <div class="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="#contact" size="lg">
            Start a partnership <ArrowRight class="size-4" />
          </ButtonLink>
          <ButtonLink href="#sponsor" size="lg" variant="secondary">
            Sponsor seats
          </ButtonLink>
        </div>
      </>
    ),
  },
];

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" class="grain relative overflow-hidden">
      <Container class="grid items-center gap-x-12 gap-y-14 pt-10 pb-20 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:pt-20 lg:pb-28">
        <div class="animate-fade-up">
          <Badge tone="amber">
            <span aria-hidden="true" class="size-1.5 rounded-full bg-primary" />
            Now booking pilot partners for 2026–27
          </Badge>
          <h1 id="hero-title" class="mt-6 font-display text-display-xl font-medium text-balance">
            Every kid has a business idea. Let&apos;s <span class="mark">open the stand.</span>
          </h1>
          <div class="mt-8">
            <AudienceSwitch audiences={audiences} />
          </div>
          <ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-medium text-ink/80">
            <For each={FACTS}>{(f) => (
              <li class="inline-flex items-center gap-2">
                <Check class="size-4 text-leaf-ink" strokeWidth={2.75} />
                {f}
              </li>
            )}</For>
          </ul>
        </div>

        <HeroStage />
      </Container>
    </section>
  );
}

function HeroStage() {
  return (
    <div class="relative mx-auto w-full max-w-[30rem] animate-fade-up [animation-delay:120ms]">
      {/* Stage: warm disc + dotted ground. Keeps Lemon's navy line legible in dark mode too. */}
      <div aria-hidden="true" class="absolute inset-x-[2%] top-[8%] aspect-square rounded-full bg-lemon-soft ring-1 ring-lemon/60" />
      <div
        aria-hidden="true"
        class="dots absolute inset-x-[2%] top-[8%] aspect-square rounded-full opacity-70 [mask-image:radial-gradient(circle_at_50%_70%,black_25%,transparent_68%)]"
      />
      <div class="relative flex justify-center pt-12 pb-10 sm:pt-14 sm:pb-6">
        <Lemon
          uid="hero"
          expression="happy"
          pose="wave"
          class="h-auto w-[72%] max-w-[21rem] translate-x-[4%]"
          label="Lemon, the Lemonstand coach, waving hello"
        />
      </div>

      <div class="absolute top-2 left-0 max-w-[15rem] animate-pop-in [animation-delay:500ms] sm:-left-2 lg:-left-8">
        <CoachBubble name="Lemon">
          Who would buy this? Let&apos;s ask five people before we make fifty.
        </CoachBubble>
      </div>

      <StepCard />
    </div>
  );
}

/** Illustrative product moment: a learner's current step (not real data). */
function StepCard() {
  const steps = ["Spark", "Test", "Build", "Launch"];
  return (
    <div class="relative z-10 mx-auto -mt-8 w-[92%] animate-pop-in rounded-card bg-surface p-4 shadow-pop ring-1 ring-line [animation-delay:700ms] sm:absolute sm:-right-2 sm:-bottom-4 sm:mt-0 sm:w-[16rem] lg:-right-6">
      <p class="text-xs font-semibold text-muted">Maya&apos;s stand · Dog-walking</p>
      <p class="mt-1 font-display text-lg leading-snug font-medium">Interview 5 neighbors</p>
      <ol class="mt-3 grid grid-cols-4 gap-1.5" aria-label="Progress: step 2 of 4">
        <For each={steps}>{(s, i) => (
          <li class="grid gap-1.5">
            <span
              class={`h-1.5 rounded-pill ${i() < 1 ? "bg-leaf" : i() === 1 ? "bg-lemon ring-1 ring-lemon-shade" : "bg-sunken ring-1 ring-line"}`}
            />
            <span class={`text-[0.7rem] font-semibold ${i() <= 1 ? "text-ink" : "text-muted"}`}>{s}</span>
          </li>
        )}</For>
      </ol>
    </div>
  );
}
