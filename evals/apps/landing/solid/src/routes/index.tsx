import { For } from "solid-js";

import { primary } from "~/components/button";
import { HeroImage } from "~/components/hero-image";
import { Seo } from "~/components/seo";
import { WaitlistForm } from "~/components/waitlist-form";

const features = [
  { title: "Every call, heard", body: "Emberline reads your sales and support calls and pulls out each request, in the customer's own words." },
  { title: "Ranked, not guessed", body: "Requests are grouped and weighted by how often they come up and which accounts asked." },
  { title: "Proof beside every card", body: "Each item links back to the quotes behind it, so the roadmap argument ends quickly." },
];

const steps = [
  { title: "Connect your calls", body: "Point Emberline at your call recorder and help desk. Setup takes a few minutes." },
  { title: "Read the signals", body: "Requests arrive grouped into Now, Next and Later, with a count beside each one." },
  { title: "Close the loop", body: "When a feature ships, tell every customer who asked for it, with one digest." },
];

export default function Home() {
  return (
    <>
      <Seo
        title="Emberline: hear what customers keep asking for"
        description="Emberline listens to your customer calls and turns them into a ranked list of what to build next."
      />
      <section class="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_35rem] lg:pb-24">
        <div>
          <p class="mb-4 inline-block rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-text">
            Early access opens this winter
          </p>
          <h1 class="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Hear what customers keep asking for
          </h1>
          <p class="mt-5 mb-8 max-w-xl text-lg leading-relaxed text-muted">
            Emberline listens to your customer calls and turns them into a ranked list of what to build next.
          </p>
          <WaitlistForm />
        </div>
        <HeroImage />
      </section>

      <section aria-labelledby="features" class="border-y border-line bg-surface">
        <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 id="features" class="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Stop losing what customers tell you
          </h2>
          <ul class="mt-12 grid gap-x-10 gap-y-9 md:grid-cols-3">
            <For each={features}>
              {(f) => (
                <li>
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
          How it works
        </h2>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          <For each={steps}>
            {(s, i) => (
              <li class="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-line">
                <span class="text-sm font-bold text-accent-text">{i() + 1}</span>
                <h3 class="mt-2 text-lg font-semibold">{s.title}</h3>
                <p class="mt-1.5 leading-relaxed text-muted">{s.body}</p>
              </li>
            )}
          </For>
        </ol>
      </section>

      <section aria-labelledby="closing" class="px-4 pb-20 sm:px-6">
        <div class="mx-auto max-w-6xl rounded-3xl bg-[#2a1610] px-6 py-12 text-center text-[#fbeee2] sm:px-12 sm:py-16">
          <h2 id="closing" class="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Your customers already told you what to build.
          </h2>
          <a href="#join" class={`${primary} mt-7`}>
            Get early access
          </a>
        </div>
      </section>
    </>
  );
}
