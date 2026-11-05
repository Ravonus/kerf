import { Invoices } from '@weft-js/warp'
import { BILLS } from '../../world'

export const InvoicesHistory = () => (
  <Invoices
    invoices={BILLS}
    onExport={() => {}}
  />
)
