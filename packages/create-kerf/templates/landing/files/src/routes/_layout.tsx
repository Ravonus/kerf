import '../theme.css'
import type { RouteProps } from '@kerf-js/start'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'

export default function Root(props: RouteProps) {
  return (
    <div class="site">
      <SiteHeader />
      <main id="content">{props.children}</main>
      <SiteFooter />
    </div>
  )
}
