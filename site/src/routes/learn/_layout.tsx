import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '@weft-js/warp'
import { learnSections, SITE_LINKS } from '../../lib/sections'
import '../../styles/docs.css'
import '../../styles/learn.css'

/** Only the chapter holding this page starts open. A layout's params are its page's, so `slug` is here. */
export default function LearnLayout(props: RouteProps) {
  return (
    <div data-site="docs" data-learn="">
      <SideNav
        lead={SITE_LINKS}
        label="Learn"
        sections={learnSections}
        current={props.params.slug ? `/learn/${props.params.slug}` : '/learn'}
        remember="weft:site:learn"
      />
      {props.children}
    </div>
  )
}
