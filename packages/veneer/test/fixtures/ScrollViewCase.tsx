import type { Scroller } from '@kerf-js/scroll'
import { ScrollView } from '../../src/ScrollView'

/** Where a test reads the scroller the case hands out. */
export const got: { s?: Scroller } = {}

export function ScrollViewCase() {
  return (
    <ScrollView
      label="Rows"
      axes="y"
      thumb={{ size: 32 }}
      style="height:120px"
      controller={(s) => (got.s = s)}
    >
      <p>one</p>
      <p>two</p>
    </ScrollView>
  )
}
