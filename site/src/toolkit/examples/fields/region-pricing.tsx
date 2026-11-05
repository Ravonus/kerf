import { state } from '@weft-js/core'
import {
  Button,
  CountrySelect,
  CurrencySelect,
  Grid,
  LanguageSelect,
  Row,
  Stack,
  Text,
  TimeZoneSelect,
  Toaster,
  toast,
} from '@weft-js/warp'
import { Cell } from '../../world'
import { NEAR_COUNTRIES, NEAR_LANGUAGES, NEAR_CURRENCIES, OFFICE_ZONES } from './phone-country'

export const TimeZoneSelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty">
      <TimeZoneSelect label="Time zone" />
    </Cell>
    <Cell name="Filled">
      <TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" />
    </Cell>
    <Cell name="Hint">
      <TimeZoneSelect label="Time zone" hint="Deploy windows follow this zone." />
    </Cell>
    <Cell name="Invalid">
      <TimeZoneSelect label="Time zone" error="Choose a time zone." />
    </Cell>
    <Cell name="Disabled">
      <TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" disabled />
    </Cell>
    <Cell name="Read-only">
      <TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" readonly />
    </Cell>
  </Grid>
)

export function FormWorkspaceRegion() {
  const save = (e: Event) => {
    e.preventDefault()
    toast.show({ title: 'Workspace updated', description: 'New invoices use these settings.' })
  }
  return (
    <>
      <Stack as="form" gap="group" onSubmit={save}>
        <Text role="heading">Workspace region</Text>
        <Grid cols={2} gap="group">
          <CountrySelect
            label="Country"
            name="country"
            preferred={NEAR_COUNTRIES}
            defaultValue="SE"
          />
          <LanguageSelect
            label="Language"
            name="language"
            preferred={NEAR_LANGUAGES}
            defaultValue="en"
          />
          <CurrencySelect
            label="Currency"
            name="currency"
            preferred={NEAR_CURRENCIES}
            defaultValue="EUR"
          />
          <TimeZoneSelect
            label="Time zone"
            name="zone"
            zones={OFFICE_ZONES}
            defaultValue="Europe/Stockholm"
          />
        </Grid>
        <Row justify="end">
          <Button type="submit">Save changes</Button>
        </Row>
      </Stack>
      <Toaster />
    </>
  )
}

/** Only the currencies you can bill in. */
export const CurrencySelectLimited = () => (
  <CurrencySelect
    label="Billing currency"
    options={['EUR', 'USD', 'GBP', 'SEK']}
    defaultValue="SEK"
    hint="Stripe pays out in these four."
  />
)

/** `locale` names the currencies in another language: Japanese here. */
export const CurrencySelectLocale = () => (
  <CurrencySelect label="通貨" locale="ja" preferred={['JPY', 'USD', 'EUR']} defaultValue="JPY" />
)

/** The same plan, priced in the chosen currency. */
const PLAN_PRICE: Record<string, number> = { EUR: 20, USD: 22, GBP: 17, SEK: 229, JPY: 3300 }

const PRICED = Object.keys(PLAN_PRICE)

export function CurrencySelectPrice() {
  const cur = state<string | null>('EUR')
  const price = () =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: cur.value ?? 'EUR',
      maximumFractionDigits: 0,
    }).format(PLAN_PRICE[cur.value ?? 'EUR']!)
  return (
    <Stack gap="group">
      <CurrencySelect label="Pay in" options={PRICED} value={cur} />
      <Row justify="between">
        <Text>Team plan, per seat</Text>
        <Row gap="tight" align="baseline">
          <Text role="heading">{price()}</Text>
          <Text subtle>a month</Text>
        </Row>
      </Row>
    </Stack>
  )
}

/* ---- AddressField ---- */

export const OFFICE = {
  country: 'DE',
  lines: ['Torstraße 140'],
  locality: 'Berlin',
  postalCode: '10119',
}
