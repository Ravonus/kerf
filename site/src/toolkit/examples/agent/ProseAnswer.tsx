import { Prose } from '@weft-js/warp'
import { SparkleIcon } from '@weft-js/warp-icons'
import { CITED, REPORT } from './shared'

export const ProseAnswer = () => (
  <div data-scope="assistant">
    <span data-part="mark">
      <SparkleIcon />
    </span>
    <div data-part="content">
      <Prose
        text={REPORT}
        sources={CITED}
        base="report"
      />
    </div>
  </div>
)
