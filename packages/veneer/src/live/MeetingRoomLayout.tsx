import { Segmented } from '../Choice'
import { G, type GlyphName } from './shared'
import type { MeetingLayout } from './MeetingRoomTypes'

const LAYOUTS: [MeetingLayout, string, GlyphName][] = [
  ['gallery', 'Gallery', 'grid'],
  ['speaker', 'Speaker', 'speaker'],
  ['presentation', 'Presentation', 'present'],
  ['board', 'Board', 'board'],
]

/** Built once a mount: an option's label is a node, and a read of the prop would otherwise make it again. */
export function LayoutPicker(props: {
  value: MeetingLayout
  onChange: (l: MeetingLayout) => void
}) {
  const options = LAYOUTS.map((l) => ({
    value: l[0],
    label: (
      <>
        <G name={l[2]} />
        {l[1]}
      </>
    ),
  }))
  return <Segmented label="Layout" size="sm" options={options} {...props} />
}
