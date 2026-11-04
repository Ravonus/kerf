import { Show, type JSX } from 'solid-js'

import { cx } from './cx'

/*
 * Coach speech bubble (kid register). Lemon speaks from the left; a learner
 * replies from the right in navy. One 4px "tail" corner, like the product.
 */
export function CoachBubble(props: {
  from?: 'coach' | 'kid'
  /** Small label above the bubble, e.g. "Lemon" or "Maya, 11". */
  name?: string
  class?: string
  children?: JSX.Element
}) {
  const coach = () => (props.from ?? 'coach') === 'coach'
  return (
    <div
      class={cx('flex items-end gap-2.5', coach() ? 'justify-start' : 'justify-end', props.class)}
    >
      <div class={cx('max-w-[19rem]', !coach() && 'text-right')}>
        <Show when={props.name}>
          <p class="mb-1 px-1 text-xs font-semibold text-muted">{props.name}</p>
        </Show>
        <p
          class={cx(
            'inline-block rounded-[1.1rem] px-4 py-2.5 text-left text-[0.95rem] leading-snug',
            coach()
              ? 'rounded-bl-[4px] bg-surface text-ink ring-2 ring-navy shadow-sticker'
              : 'rounded-br-[4px] bg-navy text-white',
          )}
        >
          {props.children}
        </p>
      </div>
    </div>
  )
}
