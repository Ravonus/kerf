import { UsageMeter, UsageMeters } from '@weft-js/warp'
import { gigabytes } from './shared'

export const UsageMetersThisMonth = () => (
  <UsageMeters>
    <UsageMeter
      label="Build minutes"
      value={1240}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
    />
    <UsageMeter
      label="Bandwidth"
      value={412}
      limit={500}
      format={gigabytes}
      note="Slows down past the limit, never stops."
    />
    <UsageMeter
      label="Seats"
      value={8}
      limit={10}
    />
    <UsageMeter
      label="Log storage"
      value={11.2}
      limit={10}
      format={gigabytes}
      overage="+ $12.40 overage"
    />
  </UsageMeters>
)
