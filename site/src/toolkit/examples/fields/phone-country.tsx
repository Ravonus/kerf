import { state } from '@weft-js/core'
import { CountrySelect, Grid, LanguageSelect, PhoneField, Stack, Text } from '@weft-js/warp'
import type { E164 } from '@weft-js/warp-core'

/** One state in a States grid: its name, then the field. */
export const Cell = (p: { name: string; children?: unknown }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>
      {p.name}
    </Text>
    {p.children}
  </Stack>
)

/* ---- PhoneField ---- */

export const TEAM_COUNTRIES = ['US', 'GB', 'DE', 'FR', 'SE', 'JP', 'IN', 'BR']

export function PhoneFieldBasic() {
  const phone = state<E164 | null>(null)
  return (
    <Stack gap="related">
      <PhoneField label="Mobile number" hint="We'll text you when a deploy fails." value={phone} />
      <Text subtle>{phone.value ? `Saved as ${phone.value}` : 'Not a full number yet'}</Text>
    </Stack>
  )
}

export const PhoneFieldCountries = () => (
  <PhoneField
    label="Mobile number"
    defaultCountry="DE"
    countries={TEAM_COUNTRIES}
    defaultValue="+4915112345678"
  />
)

export const PhoneFieldStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty">
      <PhoneField label="Mobile number" />
    </Cell>
    <Cell name="Filled">
      <PhoneField label="Mobile number" defaultValue="+14155550123" />
    </Cell>
    <Cell name="Hint">
      <PhoneField label="Mobile number" hint="We'll text a code." />
    </Cell>
    <Cell name="Invalid">
      <PhoneField
        label="Mobile number"
        defaultValue="+14155550123"
        error="This number is already on another account."
      />
    </Cell>
    <Cell name="Disabled">
      <PhoneField label="Mobile number" defaultValue="+14155550123" disabled />
    </Cell>
    <Cell name="Read-only">
      <PhoneField label="Mobile number" defaultValue="+14155550123" readonly />
    </Cell>
  </Grid>
)

/* ---- CountrySelect, LanguageSelect, CurrencySelect, TimeZoneSelect ---- */

export const NEAR_COUNTRIES = ['DE', 'FR', 'SE']

export const NEAR_LANGUAGES = ['en', 'de', 'ja']

export const NEAR_CURRENCIES = ['EUR', 'USD', 'GBP']

export const OFFICE_ZONES = [
  'Europe/Stockholm',
  'Europe/Berlin',
  'Europe/Lisbon',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Tokyo',
]

export const CountrySelectBasic = () => (
  <CountrySelect label="Country" preferred={NEAR_COUNTRIES} defaultValue="DE" />
)

export const CountrySelectLimited = () => (
  <CountrySelect
    label="Billing country"
    options={NEAR_COUNTRIES}
    defaultValue="SE"
    hint="weft invoices in these three."
  />
)

export const CountrySelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty">
      <CountrySelect label="Country" />
    </Cell>
    <Cell name="Filled">
      <CountrySelect label="Country" defaultValue="DE" />
    </Cell>
    <Cell name="Hint">
      <CountrySelect label="Country" hint="Sets your tax rate." />
    </Cell>
    <Cell name="Invalid">
      <CountrySelect label="Country" error="Choose where you're based." />
    </Cell>
    <Cell name="Disabled">
      <CountrySelect label="Country" defaultValue="DE" disabled />
    </Cell>
    <Cell name="Read-only">
      <CountrySelect label="Country" defaultValue="DE" readonly />
    </Cell>
  </Grid>
)

export const LanguageSelectBasic = () => (
  <LanguageSelect label="Language" preferred={NEAR_LANGUAGES} defaultValue="ja" />
)
