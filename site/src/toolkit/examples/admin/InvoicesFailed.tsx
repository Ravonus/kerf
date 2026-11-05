import { state } from '@weft-js/core'
import { Invoices } from '@weft-js/warp'
import { BILLS, OVERDUE_BILLS } from '../../world'

export function InvoicesFailed() {
  const fixed = state(false)
  return (
    <Invoices
      invoices={fixed.value ? BILLS : OVERDUE_BILLS}
      onUpdatePayment={() => (fixed.value = true)}
    />
  )
}
