import '@weft/warp-core/styles/rich/prose.css'
import '@weft/warp-core/styles/rich/codeblock.css'
import '@weft/warp-core/styles/rich/props.css'
import '@weft/warp-core/styles/components/copy.css'
import { warpGroups } from '../lib/warp-nav'
import type { Area } from '../lib/pages'
import { FrameTools } from './FrameTools'
import { SideNav } from './SideNav'
import '../styles/docs.css'
import '../styles/toolkit.css'

/** The kit's pages: a rail for this area only, on the docs' shell. Nothing here pins a stop, so every tile and stage follows the dial. */
export function WarpShell(props: { area: Area; children?: any }) {
  return (
    <div data-site="docs">
      <SideNav label={props.area} groups={warpGroups(props.area)} />
      <FrameTools />
      {props.children}
    </div>
  )
}
