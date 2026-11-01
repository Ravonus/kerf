import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

import { primary, secondary } from "~/components/button";
import { Check, Chevron } from "~/components/icons";
import { Seo } from "~/components/seo";

const plans = [
  { name: "Starter", price: "$0", unit: "forever", blurb: "For a founder reading their own calls.", items: ["50 calls a month", "Signals board", "CSV export"], cta: "Join for free" },
  { name: "Team", price: "$24", unit: "per seat, per month", blurb: "For product teams that share a roadmap.", items: ["Unlimited calls", "CRM and Slack digests", "Team spaces", "Priority support"], cta: "Get early access", featured: true },
  { name: "Enterprise", price: "Talk to us", unit: "billed yearly", blurb: "For companies with records to keep.", items: ["Everything in Team", "Single sign-on", "Audit log", "Data residency"], cta: "Get in line" },
];

const faq = [
  { q: "When does it open?", a: "The first teams start this winter. Everyone on the waitlist hears from us in the order they joined." },
  { q: "Is the early price locked in?", a: "Yes. Teams that join during early access keep their per-seat price for as long as they stay." },
  { q: "What happens to my data if I leave?", a: "It's yours. Export every signal and quote as CSV at any time, on any plan." },
];

export default function Pricing() {
  return (
    <>
      <Seo title="Pricing · Emberline" description="Free for one person. Simple per-seat pricing for teams." />
      <section class="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Simple pricing that grows with your team</h1>
        <p class="mt-4 max-w-xl text-lg text-muted">Free for one person. Pay per seat when the whole team comes along.</p>
        <ul class="mt-12 grid gap-6 lg:grid-cols-3">
          <For each={plans}>
            {(p) => (
              <li class={`flex flex-col rounded-2xl bg-surface p-7 shadow-card ${p.featured ? "ring-2 ring-accent" : "ring-1 ring-line"}`}>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-lg font-semibold">{p.name}</h2>
                  <Show when={p.featured}>
                    <span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-ink">Most popular</span>
                  </Show>
                </div>
                <p class="mt-1 text-muted">{p.blurb}</p>
                <p class="mt-5 text-4xl font-extrabold tracking-tight">{p.price}</p>
                <p class="text-sm text-muted">{p.unit}</p>
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
                  {p.cta}
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section aria-labelledby="faq" class="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h2 id="faq" class="text-2xl font-bold tracking-tight sm:text-3xl">
          Questions
        </h2>
        <div class="mt-6 divide-y divide-line border-y border-line">
          <For each={faq}>
            {(f) => (
              <details class="group">
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
