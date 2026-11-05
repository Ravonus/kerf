import type { IconComponent } from '@weft-js/warp-icons'

export const button = (
  d: { label: string; href?: string; onClick?: (() => void) | undefined },
  part: string | undefined,
  icon: IconComponent,
) =>
  d.href ? (
    <a
      href={d.href}
      data-scope="button"
      data-emphasis="ghost"
      data-tone="neutral"
      data-icon-only=""
      data-part={part}
      aria-label={d.label}
    >
      {icon({})}
    </a>
  ) : (
    <button
      type="button"
      data-scope="button"
      data-emphasis="ghost"
      data-tone="neutral"
      data-icon-only=""
      data-part={part}
      aria-label={d.label}
      onClick={d.onClick!}
    >
      {icon({})}
    </button>
  )
