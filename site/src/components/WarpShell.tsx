import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/rich/props.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '@weft-js/warp'
import { AREA_LABEL, toolkitSections, SITE_LINKS } from '../lib/sections'
import type { Area } from '../lib/pages'
import { FrameTools } from './FrameTools'
import '../styles/docs.css'
import '../styles/toolkit.css'

/** The kit's pages: a rail for this area only, on the docs' shell. Nothing here pins a stop, so every tile and stage follows the dial. */
export function WarpShell(props: { area: Area; slug?: string | undefined; children?: unknown }) {
  return (
    <div data-site="docs">
      <SideNav lead={SITE_LINKS} label={AREA_LABEL[props.area]} sections={toolkitSections(props.area)} current={props.slug ? `/${props.area}/${props.slug}` : `/${props.area}`} filter remember="weft:site:toolkit" />
      <FrameTools />
      {props.children}
    </div>
  )
}
