import {
  AddressField,
  Button,
  CurrencySelect,
  Grid,
  Input,
  PhoneField,
  Row,
  Stack,
  Text,
  Toaster,
  toast,
} from '@kerf-js/veneer'
import {
  TEAM_COUNTRIES,
  NEAR_CURRENCIES,
} from './phone-country'
import { OFFICE } from './region-pricing'

const STREETS = [
  {
    id: 'a',
    label: '548 Market Street',
    secondary: 'San Francisco, CA 94104',
    address: {
      country: 'US',
      lines: ['548 Market Street'],
      locality: 'San Francisco',
      region: 'CA',
      postalCode: '94104',
    },
  },
  {
    id: 'b',
    label: '1 Infinite Loop',
    secondary: 'Cupertino, CA 95014',
    address: {
      country: 'US',
      lines: ['1 Infinite Loop'],
      locality: 'Cupertino',
      region: 'CA',
      postalCode: '95014',
    },
  },
  {
    id: 'c',
    label: '350 Fifth Avenue',
    secondary: 'New York, NY 10118',
    address: {
      country: 'US',
      lines: ['350 Fifth Avenue'],
      locality: 'New York',
      region: 'NY',
      postalCode: '10118',
    },
  },
]

const streetProvider = {
  suggest: (q: string) => {
    const query = q.toLowerCase()
    const matches = STREETS.filter(({ label }) =>
      label.toLowerCase().includes(query),
    )
    return Promise.resolve(matches)
  },
  resolve: (id: string) =>
    Promise.resolve(
      STREETS.find((s) => s.id === id)!.address,
    ),
}

export const AddressFieldBasic = () => (
  <AddressField
    label="Billing address"
    defaultValue={OFFICE}
  />
)

export const AddressFieldLookup = () => (
  <AddressField
    label="Shipping address"
    provider={streetProvider}
    countries={['US', 'CA']}
  />
)

export const AddressFieldErrors = () => (
  <AddressField
    label="Billing address"
    defaultValue={OFFICE}
    errors={{
      postalCode:
        "This postal code doesn't match Berlin.",
    }}
  />
)

export function FormBilling() {
  const pay = (e: Event) => {
    e.preventDefault()
    toast.show({ title: 'Billing details saved' })
  }
  return (
    <>
      <Stack
        as="form"
        gap="group"
        onSubmit={pay}
      >
        <Text role="heading">Billing details</Text>
        <Input
          label="Company"
          autocomplete="organization"
          defaultValue="kerf GmbH"
        />
        <AddressField
          label="Billing address"
          name="address"
          defaultValue={OFFICE}
        />
        <Grid
          cols={2}
          gap="group"
        >
          <PhoneField
            label="Phone"
            name="phone"
            defaultCountry="DE"
            countries={TEAM_COUNTRIES}
          />
          <CurrencySelect
            label="Currency"
            name="currency"
            preferred={NEAR_CURRENCIES}
            defaultValue="EUR"
          />
        </Grid>
        <Row justify="end">
          <Button type="submit">Save details</Button>
        </Row>
      </Stack>
      <Toaster />
    </>
  )
}
