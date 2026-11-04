export function Logo() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xl font-semibold">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 flex-none">
        <circle cx="16" cy="16" r="16" fill="var(--accent)" />
        <path
          d="M8 23V10l8 8 8-8v13"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Mendwell
    </span>
  )
}
