import { Alert } from '../Alert'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { AddressField } from '../PlaceField'
import type { CheckoutModel, CheckoutNav } from './Checkout-view'

export function checkoutAddress(model: CheckoutModel, Nav: CheckoutNav) {
  const {
    id,
    step,
    phone,
    address,
    billing,
    sameBilling,
    addressErrors,
    billingErrors,
    addressAlert,
  } = model.s
  const { input } = model
  const live = addressProps(input)
  const { submitAddress } = model.nav
  return (
    <section
      data-part="step"
      data-step="address"
      data-state={step.value === 'address' ? 'active' : undefined}
      aria-labelledby={`${id}-address`}
    >
      <form data-part="step-body" novalidate onSubmit={submitAddress}>
        <h2 data-part="step-title" id={`${id}-address`} tabindex="-1">
          Where should it go?
        </h2>
        {addressAlert.value && <Alert tone="critical">{addressAlert.value}</Alert>}
        {checkoutContact(model)}
        <AddressField
          label="Shipping address"
          value={address}
          countries={live.countries}
          defaultCountry={live.defaultCountry!}
          provider={live.addressProvider}
          locale={live.locale}
          errors={addressErrors.value}
        />
        <Input
          label="Phone (optional)"
          type="tel"
          autocomplete="tel"
          inputmode="tel"
          hint="Only for the courier, if they can’t find you."
          value={phone.value}
          onInput={(e) => (phone.value = e.currentTarget.value)}
        />
        <Checkbox
          checked={sameBilling.value}
          onChange={(e: Event) =>
            (sameBilling.value = (e.currentTarget as HTMLInputElement).checked)
          }
        >
          Use as billing address
        </Checkbox>
        {!sameBilling.value && (
          <AddressField
            label="Billing address"
            value={billing}
            countries={live.countries}
            defaultCountry={live.defaultCountry!}
            locale={live.locale}
            errors={billingErrors.value}
          />
        )}
        <Nav back="cart">
          <Button type="submit">Continue to shipping</Button>
        </Nav>
      </form>
    </section>
  )
}

function checkoutContact(model: CheckoutModel) {
  const { name, email, nameError, emailError } = model.s
  return (
    <div data-part="cols">
      <Input
        label="Full name"
        autocomplete="name"
        value={name.value}
        error={nameError.value}
        onInput={(e) => {
          name.value = e.currentTarget.value
          nameError.value = ''
        }}
      />
      <Input
        label="Email for receipt"
        type="email"
        autocomplete="email"
        inputmode="email"
        value={email.value}
        error={emailError.value}
        onInput={(e) => {
          email.value = e.currentTarget.value
          emailError.value = ''
        }}
      />
    </div>
  )
}

function addressProps(input: CheckoutModel['input']) {
  return {
    get countries() {
      return input.countries()
    },
    get defaultCountry() {
      return input.defaultCountry()
    },
    get addressProvider() {
      return input.addressProvider()
    },
    get locale() {
      return input.locale()
    },
  }
}
