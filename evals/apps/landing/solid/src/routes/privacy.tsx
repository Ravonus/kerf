import { For } from "solid-js";

import { Seo } from "~/components/seo";

const sections = [
  { title: "What we collect", body: "The email address you give us for the waitlist, and the date you joined. During the beta, customers also send us call recordings and transcripts." },
  { title: "How we use it", body: "We use your email to tell you when your early access opens. Recordings are processed to produce your workspace's signals and nothing else." },
  { title: "Who we share it with", body: "Only the infrastructure providers that host the service. We don't sell data, and customer calls never train a shared model." },
  { title: "How long we keep it", body: "Waitlist emails are deleted once you've had your invitation or asked us to remove you. Workspace data is deleted 30 days after a workspace closes." },
  { title: "Your choices", body: "You can ask us for a copy of your data, or for its deletion, at any time. Email privacy@emberline.example and we'll answer within a week." },
];

export default function Privacy() {
  return (
    <>
      <Seo title="Privacy · Emberline" description="What Emberline collects, why, and how to have it removed." />
      <article class="mx-auto max-w-2xl px-4 pt-12 pb-20 sm:px-6 sm:pt-20">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Privacy</h1>
        <p class="mt-4 text-lg text-muted">Last updated 1 November 2026. Short, because we collect very little.</p>
        <For each={sections}>
          {(s) => (
            <section class="mt-9">
              <h2 class="text-xl font-semibold">{s.title}</h2>
              <p class="mt-2 leading-relaxed text-muted">{s.body}</p>
            </section>
          )}
        </For>
      </article>
    </>
  );
}
