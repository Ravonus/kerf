import { AuditLog } from '@weft-js/warp'
import { AUDIT, AUDIT_CATEGORIES, NOW } from '../../world'

// -- audit and integrations --

export const AuditLogWorkspace = () => (
  <AuditLog
    events={AUDIT}
    now={NOW}
    categories={AUDIT_CATEGORIES}
    live="live"
    onExport={() => Promise.resolve({ retryAfter: 20 })}
  />
)
