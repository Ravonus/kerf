import { A } from "@solidjs/router";
import { For } from "solid-js";

import { primary, secondary } from "~/components/button";
import { Check, Chevron } from "~/components/icons";
import { Seo } from "~/components/seo";

const plans = [
  { name: "Starter", price: "$0", per: "forever", blurb: "For founders doing their own calls.", items: ["25 calls a month", "1 seat", "Slack digest"] },
  { name: "Team", price: "$39", per: "per seat, monthly", blurb: "For product and success teams.", items: ["Unlimited calls", "Linear and Jira sync", "Risk alerts", "90-day history"], featured: true },
  { name: "Scale", price: "$79", per: "per seat, monthly", blurb: "For companies with a security review.", items: ["Everything in Team", "SSO and audit log", "Custom retention", "A named contact"] },
];

const faq = [
  { q: "Can I try it before I pay?", a: "Yes. Starter is free for as long as you like, and Team has a 30-day trial with no card." },
  { q: "Do customers know calls are recorded?", a: "Emberline joins as a visible participant and announces itself. You can turn on a consent prompt per workspace." },
  { q: "Where is my data stored?", a: "In the EU or the US, your choice, encrypted at rest and in transit." },
  { q: "What happens when I leave?", a: "Export everything as JSON or CSV. We delete your workspace 30 days after you close it." },
];

export default function Pricing() {
  return (
    <>
      <Seo title="Pricing · Emberline" description="Free for founders, simple per-seat pricing for teams." />
      <section class="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Pricing that grows with your team</h1>
        <p class="mt-4 max-w-xl text-lg text-muted">Start free. Pay per seat when calls become a team habit.</p>
        <ul class="mt-12 grid gap-6 lg:grid-cols-3">
          <For each={plans}>
            {(p) => (
              <li class={`flex flex-col rounded-2xl bg-surface p-7 shadow-card ${p.featured ? "ring-2 ring-accent" : "ring-1 ring-line"}`}>
                <h2 class="text-lg font-semibold">{p.name}</h2>
                <p class="mt-1 text-muted">{p.blurb}</p>
                <p class="mt-5 text-4xl font-extrabold tracking-tight">{p.price}</p>
                <p class="text-sm text-muted">{p.per}</p>
                <ul class="mt-6 mb-8 flex-1 space-y-2.5">
                  <For each={p.items}>
                    {(item) => (
                      <li class="flex items-start gap-2.5">
                        <Check class="mt-0.5 size-5 shrink-0 text-accent-text" />
                        {item}
                      </li>
                    )}
                  </For>
                </ul>
                <A href="/#join" class={p.featured ? primary : secondary} activeClass="" inactiveClass="">
                  Get early access
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section aria-labelledby="faq" class="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h2 id="faq" class="text-2xl font-bold tracking-tight sm:text-3xl">
          Common questions
        </h2>
        <div class="mt-6 divide-y divide-line border-y border-line">
          <For each={faq}>
            {(f) => (
              <details name="faq" class="group">
                <summary class="flex items-center justify-between gap-4 py-4 font-semibold">
                  {f.q}
                  <Chevron class="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p class="pb-5 leading-relaxed text-muted">{f.a}</p>
              </details>
            )}
          </For>
        </div>
      </section>
    </>
  );
}
