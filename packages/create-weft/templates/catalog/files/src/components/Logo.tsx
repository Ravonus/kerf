/** Mendwell's mark: an M stitched with one line. */
export function Logo() {
  return (
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--warp-color-accent-solid)" />
      <path d="M8 23V10l8 8 8-8v13" fill="none" stroke="var(--warp-color-accent-on-solid)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}
