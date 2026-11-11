/** Daybook's mark: a tick on a ruled square. */
export function Logo() {
  return (
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="var(--veneer-color-accent-solid)" />
      <path
        d="M8 17l5.5 5.5L24 10"
        fill="none"
        stroke="var(--veneer-color-accent-on-solid)"
        stroke-width="3.5"
      />
    </svg>
  )
}
