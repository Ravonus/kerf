import { state } from '@kerf-js/core'

import {
  Badge,
  Button,
  MonthPicker,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'

import type { IsoMonth } from '@kerf-js/veneer'

import { INVOICES } from '../../world'

import { TODAY, usd } from './shared-event'

/** Pick a month and the list shows that month's
 * invoice; Show all clears it. */
export function MonthPickerInvoices() {
  const month = state<IsoMonth | null>('2026-09')
  const shown = () =>
    INVOICES.filter(
      (i) =>
        !month.value || i.date.startsWith(month.value),
    )
  const total = () =>
    usd(shown().reduce((t, i) => t + i.amount, 0))
  return (
    <Stack gap="group">
      <Row
        gap="related"
        wrap={false}
      >
        <MonthPicker
          label="Invoices for"
          today={TODAY}
          value={month}
          min="2026-07"
          max="2026-10"
        />
        <Button
          emphasis="ghost"
          tone="neutral"
          aria-disabled={month.value ? undefined : 'true'}
          onClick={() => (month.value = null)}
        >
          Show all
        </Button>
      </Row>
      <Stack
        gap="related"
        divided
      >
        {shown().map((i) => (
          <Row
            key={i.id}
            justify="between"
            gap="group"
          >
            <Stack gap="hair">
              <Text role="label">{i.id}</Text>
              <Text
                role="caption"
                subtle
              >
                Issued {i.date}
              </Text>
            </Stack>
            <Row gap="related">
              <Badge tone="positive">{i.status}</Badge>
              <Text>{usd(i.amount)}</Text>
            </Row>
          </Row>
        ))}
      </Stack>
      <Text
        subtle
        role="caption"
      >
        {shown().length} of {INVOICES.length}
        {' invoices, '}
        {total()} in all
      </Text>
    </Stack>
  )
}
