import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/rich/props.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { derived } from '@weft-js/core'
import { currentPath } from '@weft-js/start'
import { SideNav, type SideNavSection } from '@weft-js/warp'
import type { Area } from '../lib/pages'
import { AREA_LABEL, learnSections, referenceSections, toolkitSections } from '../lib/sections'
import { ROOM_TITLES } from '../toolkit/art/shared'
import { FrameTools } from './FrameTools'
import '../styles/docs.css'
import '../styles/learn.css'
import '../styles/toolkit.css'

interface Rail {
  label: string
  sections: SideNavSection[]
  filter: boolean
  remember: string
  /** Learn's own styles. */
  learn?: boolean
  /** The kit's pages: the dial and frame controls. */
  tools?: boolean
}

const TOOLKIT = new Set<string>(['components', 'blocks', 'charts'])
const rails = new Map<string, Rail>()

/** The rooms on the art page. */
const artSections = (): SideNavSection[] => [
  ...toolkitSections('art'),
  {
    title: 'Rooms',
    pinned: true,
    items: ROOM_TITLES.map(([kind, label]) => ({ href: `/art#${kind}`, label })),
  },
]

/** The rail for a top-level section, made once: moving inside a section hands SideNav the same sections. */
function railFor(section: string): Rail | undefined {
  const made = rails.get(section)
  if (made) return made
  const rail: Rail | undefined =
    section === 'learn'
      ? {
          label: 'Learn',
          sections: learnSections,
          filter: false,
          remember: 'weft:site:learn',
          learn: true,
        }
      : section === 'reference'
        ? {
            label: 'Reference',
            sections: referenceSections,
            filter: true,
            remember: 'weft:site:reference',
          }
        : section === 'icons' || section === 'art'
          ? {
              label: section === 'icons' ? 'Icons' : 'Art',
              sections: section === 'icons' ? toolkitSections('icons') : artSections(),
              filter: false,
              remember: 'weft:site:toolkit',
            }
          : TOOLKIT.has(section)
            ? {
                label: AREA_LABEL[section as Area],
                sections: toolkitSections(section as Area),
                filter: true,
                remember: 'weft:site:toolkit',
                tools: true,
              }
            : undefined
  if (rail) rails.set(section, rail)
  return rail
}

/**
 * The docs shell: one sidebar for every section that has one, in the root layout. A move between sections (Components
 * to Blocks, Learn to Reference) swaps the sidebar's items and the page, and the sidebar itself stays: a layout per
 * section would be replaced, sidebar and all, on each such move.
 */
export function DocsRail(props: { children?: unknown }) {
  const path = derived(currentPath)
  const rail = derived(() => railFor(path.value.split('/')[1] ?? ''))
  // Booleans for what's shown, so Components to Blocks keeps the same SideNav and only its props move.
  const docs = derived(() => rail.value !== undefined)
  const side = derived(() => (rail.value?.sections.length ?? 0) > 0)
  const tools = derived(() => !!rail.value?.tools)
  // One wrapper on every page, with the page always its last child: a page outlet that moved between parents would be
  // rebuilt where the router no longer writes. Off the docs it lays nothing out.
  return (
    <div
      data-site={docs.value ? 'docs' : undefined}
      data-learn={rail.value?.learn ? '' : undefined}
      style={docs.value ? undefined : 'display:contents'}
    >
      {side.value && (
        <SideNav
          overlay="under"
          label={rail.value!.label}
          sections={rail.value!.sections}
          current={path.value}
          filter={rail.value!.filter}
          remember={rail.value!.remember}
        />
      )}
      {tools.value && <FrameTools />}
      {props.children}
    </div>
  )
}
