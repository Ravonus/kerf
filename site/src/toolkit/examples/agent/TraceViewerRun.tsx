import { TraceViewer } from '@kerf/veneer'
import { TRACE } from '../../world'

export const TraceViewerRun = () => (
  <TraceViewer
    spans={TRACE}
    label="Last answer"
  />
)
