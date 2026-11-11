import { state } from '@kerf-js/core'
import { Invoices } from '@kerf-js/veneer'
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
