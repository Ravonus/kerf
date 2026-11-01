/** Backroom's mark: a door left ajar, with light coming through. */
export function Logo() {
  return (
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--warp-color-accent-solid)" />
      <path d="M10 25V7h12v18" fill="none" stroke="var(--warp-color-accent-on-solid)" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M10 7l8 3v15h-8z" fill="var(--warp-color-accent-on-solid)" />
    </svg>
  )
}
