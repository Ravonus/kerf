import { TraceViewer } from '@weft-js/warp'
import { TRACE } from '../../world'

export const TraceViewerRun = () => (
  <TraceViewer
    spans={TRACE}
    label="Last answer"
  />
)
