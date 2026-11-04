import { For } from 'solid-js'

import { type LegalDoc } from '~/content/legal'
import { Container, Eyebrow } from '~/components/ui'
import { SiteFooter, SiteHeader, SkipLink } from './site-chrome'

export function LegalPage(props: { doc: LegalDoc }) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" class="py-16 sm:py-24">
        <Container size="reading">
          <Eyebrow>Last updated {props.doc.updated}</Eyebrow>
          <h1 class="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {props.doc.title}
          </h1>
          <p class="mt-6 text-lg leading-relaxed text-muted">{props.doc.intro}</p>
          <For each={props.doc.sections}>
            {(s) => (
              <section class="mt-12">
                <h2 class="font-display text-2xl font-semibold">{s.heading}</h2>
                <For each={s.body}>
                  {(para) => <p class="mt-4 leading-relaxed text-ink/85">{para}</p>}
                </For>
              </section>
            )}
          </For>
        </Container>
      </main>
      <SiteFooter />
    </>
  )
}
