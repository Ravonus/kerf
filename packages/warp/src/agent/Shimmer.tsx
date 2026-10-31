import '../styles'
import '@weft/ui-core/styles/app/shimmer.css'

/** Placeholder text with a light passing over it (07 §1.3); static under reduced motion. */
export function Shimmer({ children, ...rest }: { children?: any; [attr: string]: any }) {
  return <span data-scope="shimmer" {...rest}>{children}</span>
}
