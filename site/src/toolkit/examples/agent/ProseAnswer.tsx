import { Prose } from '@kerf-js/veneer'
import { SparkleIcon } from '@kerf-js/veneer-icons'
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
