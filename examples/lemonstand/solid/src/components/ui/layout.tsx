import { Show, type JSX } from 'solid-js'

import { cx } from './cx'

/** Page-width container with the fluid gutter. The only place max-width + gutter live. */
export function Container(props: {
  children?: JSX.Element
  class?: string
  size?: 'page' | 'reading' | 'narrow'
}) {
  const size = () => props.size ?? 'page'
  return (
    <div
      class={cx(
        'mx-auto w-full px-gutter',
        size() === 'page' && 'max-w-page',
        size() === 'reading' && 'max-w-reading',
        size() === 'narrow' && 'max-w-[56rem]',
        props.class,
      )}
    >
      {props.children}
    </div>
  )
}

const TONES = {
  default: '',
  surface: 'bg-surface',
  sunken: 'bg-sunken',
  lemon: 'bg-lemon-soft',
  navy: 'bg-navy text-white [--ls-muted:#b9c2d8] [--ls-line:rgb(255_255_255/0.14)]',
} as const

/** Vertical rhythm for a page band. `tone` swaps the band background. */
export function Section(props: {
  children?: JSX.Element
  id?: string
  tone?: keyof typeof TONES
  class?: string
  labelledBy?: string
  grain?: boolean
}) {
  return (
    <section
      id={props.id}
      aria-labelledby={props.labelledBy}
      class={cx('py-section', TONES[props.tone ?? 'default'], props.grain && 'grain', props.class)}
    >
      {props.children}
    </section>
  )
}

/** Eyebrow + H2 + lead. Pass `id` so the section can be labelled by its heading. */
export function SectionHeader(props: {
  eyebrow: JSX.Element
  title: JSX.Element
  lead?: string
  id?: string
  align?: 'start' | 'center'
  class?: string
}) {
  return (
    <div class={cx('max-w-2xl', props.align === 'center' && 'mx-auto text-center', props.class)}>
      {props.eyebrow}
      <h2 id={props.id} class="mt-4 font-display text-display-lg font-medium text-balance">
        {props.title}
      </h2>
      <Show when={props.lead}>
        <p class="mt-5 text-lead text-pretty text-muted">{props.lead}</p>
      </Show>
    </div>
  )
}
