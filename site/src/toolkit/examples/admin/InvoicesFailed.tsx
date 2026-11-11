import { state } from '@kerf/core'
import { Invoices } from '@kerf/veneer'
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
