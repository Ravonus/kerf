import { Invoices } from '@kerf-js/veneer'
import { BILLS } from '../../world'

export const InvoicesHistory = () => (
  <Invoices
    invoices={BILLS}
    onExport={() => {}}
  />
)
