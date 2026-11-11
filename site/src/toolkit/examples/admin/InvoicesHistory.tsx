import { Invoices } from '@kerf/veneer'
import { BILLS } from '../../world'

export const InvoicesHistory = () => (
  <Invoices
    invoices={BILLS}
    onExport={() => {}}
  />
)
