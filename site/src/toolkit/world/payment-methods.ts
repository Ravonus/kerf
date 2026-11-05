import type {
  Invoice,
  PaymentMethod,
} from '@weft-js/warp'
import { BILLS } from './bills'

export const OVERDUE_BILLS: Invoice[] = [
  {
    id: '11',
    date: 'Nov 1',
    number: 'INV-2026-11',
    status: 'failed',
    amount: 8930,
  },
  {
    id: '10r',
    date: 'Oct 1',
    number: 'INV-2026-10',
    status: 'retrying',
    amount: 8560,
  },
  ...BILLS.slice(1, 4),
]

export const CARDS: PaymentMethod[] = [
  {
    id: 'visa',
    brand: 'Visa',
    last4: '4242',
    expires: '08/28',
    default: true,
  },
  {
    id: 'mc',
    brand: 'Mastercard',
    last4: '4444',
    expires: '02/27',
  },
]
