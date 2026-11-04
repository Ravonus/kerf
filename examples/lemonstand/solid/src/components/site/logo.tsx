import { cx } from '~/components/ui'

/**
 * Brand mark: Lemon's silhouette reduced to a sticker (lemon + leaf, navy line).
 * Same shape language as the mascot, so the logo and character feel like one system.
 */
export function LogoMark(props: { class?: string }) {
  return (
    <svg viewBox="0 0 40 40" class={props.class ?? 'size-9'} aria-hidden="true">
      <path
        d="M20 7.2c1.6 0 2.4 1 3.3 1.6 6.4 1.6 10.1 6.6 10.1 13.3 0 7.2-5.2 12.2-10.5 13.4-.9.3-1.4 1.5-2.9 1.5s-2-1.2-2.9-1.5C11.8 34.3 6.6 29.3 6.6 22.1c0-6.7 3.7-11.7 10.1-13.3.9-.6 1.7-1.6 3.3-1.6Z"
        fill="#ffd43b"
        stroke="#16243f"
        stroke-width="2.4"
        stroke-linejoin="round"
      />
      <path
        d="M26.8 23.5c0 4.6-3.2 8.2-7.6 9"
        fill="none"
        stroke="#f2b705"
        stroke-width="2.4"
        stroke-linecap="round"
      />
      <ellipse
        cx="13.6"
        cy="15.2"
        rx="2.6"
        ry="1.3"
        transform="rotate(-38 13.6 15.2)"
        fill="#fff7cf"
      />
      <path
        d="M20.4 7.4c1.2-3.6 4.8-5.6 9-4.4-1.4 3.4-5 5.4-9 4.4Z"
        fill="#3fae55"
        stroke="#16243f"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </svg>
  )
}

export function Logo(props: { class?: string; tone?: 'default' | 'onNavy' }) {
  const onNavy = () => props.tone === 'onNavy'
  return (
    <span class={cx('inline-flex items-center gap-2', props.class)}>
      <LogoMark class="size-9 shrink-0" />
      <span
        class={cx(
          'font-display text-[1.4rem] leading-none font-semibold tracking-[-0.02em]',
          onNavy() ? 'text-white' : 'text-ink',
        )}
      >
        lemonstand
        <span class={onNavy() ? 'text-lemon' : 'text-leaf-ink'}>.ai</span>
      </span>
    </span>
  )
}
