import type { JSX } from 'solid-js'

function Icon(props: { class?: string; children: JSX.Element }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class ?? 'size-5'}
    >
      {props.children}
    </svg>
  )
}

export const Check = (p: { class?: string }) => (
  <Icon class={p.class}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)
export const Chevron = (p: { class?: string }) => (
  <Icon class={p.class}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)
