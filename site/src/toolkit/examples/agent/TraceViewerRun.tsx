import { TraceViewer } from '@kerf-js/veneer'
import { TRACE } from '../../world'

export const TraceViewerRun = () => (
  <TraceViewer
    spans={TRACE}
    label="Last answer"
  />
)
