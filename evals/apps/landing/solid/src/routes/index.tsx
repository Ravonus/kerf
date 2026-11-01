import { For } from "solid-js";

import { primary } from "~/components/button";
import { HeroImage } from "~/components/hero-image";
import { Bell, Layers, Lock, Mic, Plug, Quote } from "~/components/icons";
import { Seo } from "~/components/seo";
import { WaitlistForm } from "~/components/waitlist-form";

const features = [
  { icon: Mic, title: "Every call, captured", body: "Connect Zoom, Meet or a phone line. Emberline transcribes each call and pulls out what the customer asked for." },
  { icon: Layers, title: "Grouped by request", body: "The same ask in forty different wordings becomes one signal, with the accounts and revenue behind it." },
  { icon: Quote, title: "Quotes with receipts", body: "Every signal links to the moment it was said, so a roadmap debate starts from the customer's own words." },
  { icon: Bell, title: "Risk you can see", body: "Renewal language, workarounds and frustration are flagged weeks before a customer asks to cancel." },
  { icon: Plug, title: "Fits your stack", body: "Signals flow into Linear, Jira, Slack and your CRM. Nobody has to learn another inbox." },
  { icon: Lock, title: "Private by default", body: "Transcripts are encrypted and never train a shared model. You decide who sees each call." },
];

const steps = [
  { title: "Connect your calls", body: "Ten minutes, one sign-in, nothing to install." },
  { title: "Read the board", body: "A week's calls become a short list of what customers want." },
  { title: "Ship with evidence", body: "Send a signal to your tracker with the quotes attached." },
];

export default function Home() {
  return (
    <>
      <Seo
        title="Emberline: turn customer calls into what to build next"
        description="Emberline listens to your customer calls and groups every request, so your roadmap starts from what people actually said."
      />
      <section class="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_35rem] lg:pb-24">
        <div>
          <p class="mb-4 inline-block rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-text">
            Now in private beta
          </p>
          <h1 class="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Turn customer calls into what to build next
          </h1>
          <p class="mt-5 mb-8 max-w-xl text-lg leading-relaxed text-muted">
            Emberline listens to every call your team has and groups each request, so your roadmap starts from what
            people actually said.
          </p>
          <WaitlistForm />
        </div>
        <HeroImage />
      </section>

      <section aria-labelledby="features" class="border-y border-line bg-surface">
        <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 id="features" class="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Everything customers tell you, in one place you'll actually read
          </h2>
          <ul class="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            <For each={features}>
              {(f) => (
                <li>
                  <span class="mb-3 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <f.icon />
                  </span>
                  <h3 class="font-semibold">{f.title}</h3>
                  <p class="mt-1.5 leading-relaxed text-muted">{f.body}</p>
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" class="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 id="how" class="text-3xl font-bold tracking-tight sm:text-4xl">
          Live before your next standup
        </h2>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          <For each={steps}>
            {(s, i) => (
              <li class="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-line">
                <span class="text-sm font-bold text-accent-text">Step {i() + 1}</span>
                <h3 class="mt-2 text-lg font-semibold">{s.title}</h3>
                <p class="mt-1.5 leading-relaxed text-muted">{s.body}</p>
              </li>
            )}
          </For>
        </ol>
      </section>

      <section aria-labelledby="quote" class="px-4 pb-20 sm:px-6">
        <div class="mx-auto max-w-6xl rounded-3xl bg-[#2a1610] px-6 py-12 text-center text-[#fbeee2] sm:px-12 sm:py-16">
          <h2 id="quote" class="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            "We stopped arguing about the roadmap. The calls settle it."
          </h2>
          <p class="mt-3 text-[#d9c2b2]">Priya Nair, head of product at a 60-person SaaS team</p>
          <a href="#join" class={`${primary} mt-7`}>
            Join the waitlist
          </a>
        </div>
      </section>
    </>
  );
}
