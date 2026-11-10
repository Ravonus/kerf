import { ScrollView } from '@weft-js/warp'

const builds = Array.from({ length: 60 }, (_, i) => i + 1)

export const ScrollViewRows = () => (
  <ScrollView
    label="Build log"
    axes="y"
    style="height:220px"
  >
    {builds.map((n) => (
      <p style="margin:0;padding:8px 12px">
        Build {n} passed
      </p>
    ))}
  </ScrollView>
)
