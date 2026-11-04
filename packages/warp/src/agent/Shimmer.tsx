import '../styles'
import '@weft-js/warp-core/styles/app/shimmer.css'

/** Placeholder text with a light passing over it (07 §1.3); static under reduced motion. */
export function Shimmer({ children, ...rest }: { children?: unknown; [attr: string]: unknown }) {
  return (
    <span data-scope="shimmer" {...rest}>
      {children}
    </span>
  )
}
