import { For } from 'solid-js'

import { Seo } from '~/components/seo'

const sections = [
  {
    title: 'What we collect',
    body: 'The waitlist stores your email address and the time you joined. This site sets no cookies and runs no analytics.',
  },
  {
    title: 'Why we collect it',
    body: 'We use your address to tell you when your place in line comes up, and for nothing else. We send no newsletters.',
  },
  {
    title: 'Who sees it',
    body: "Only the people who run Emberline, and the database host that stores it on our behalf. We don't sell or share addresses.",
  },
  {
    title: 'How long we keep it',
    body: 'Until the waitlist closes or you ask us to remove it, whichever comes first.',
  },
  {
    title: 'Removing your address',
    body: "Reply to any message from us and we'll delete your address within seven days.",
  },
]

export default function Privacy() {
  return (
    <>
      <Seo
        title="Privacy · Emberline"
        description="What Emberline collects, why, and how to have it removed."
      />
      <article class="mx-auto max-w-2xl px-4 pt-12 pb-20 sm:px-6 sm:pt-20">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Privacy</h1>
        <p class="mt-4 text-lg text-muted">Last updated 1 November 2026</p>
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
  )
}
