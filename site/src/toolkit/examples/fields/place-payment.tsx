import {
  Grid,
  PaymentCardInput,
  PlaceLookupInput,
} from '@kerf/veneer'
import type {
  ProviderAppearance,
  ProviderField,
} from '@kerf/veneer'
import { Cell } from '../../world'
import { findPlace, PLACES } from './place-lookup'

export const PlaceLookupInputStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
      />
    </Cell>
    <Cell name="Filled">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
        defaultValue={PLACES[1]!}
      />
    </Cell>
    <Cell name="Hint">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
        hint="Used to pick a region."
      />
    </Cell>
    <Cell name="Invalid">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
        error="Pick a place from the list."
      />
    </Cell>
    <Cell name="Disabled">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
        defaultValue={PLACES[1]!}
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <PlaceLookupInput
        label="Office location"
        search={findPlace}
        defaultValue={PLACES[1]!}
        readonly
      />
    </Cell>
  </Grid>
)

/* ---- PaymentCardInput and CardNumberText ---- */

/**
 * Stands in for Stripe Elements or Adyen: you mount
 * their field and pass on its events. Nothing here
 * leaves the page.
 */
export function testProvider(
  el: HTMLElement,
  look: ProviderAppearance,
): ProviderField {
  const input = el.ownerDocument.createElement('input')
  input.inputMode = 'numeric'
  input.setAttribute('aria-label', 'Test card number')
  Object.assign(input.style, {
    all: 'unset',
    width: '100%',
    font: `${look.fontSize} ${look.fontFamily}`,
    color: look.color,
  })
  input.onfocus = () =>
    (input.placeholder = '4242 4242 4242 4242')
  input.onblur = () => (input.placeholder = '')
  el.append(input)
  return {
    on(event, send) {
      if (event !== 'change')
        return input.addEventListener(event, () =>
          send({}),
        )
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\s/g, '')
        send({
          complete: digits.length === 16,
          error: /\D/.test(digits)
            ? 'A card number only has digits.'
            : undefined,
        })
      })
    },
    destroy: () => input.remove(),
  }
}

const failedProvider = (
  el: HTMLElement,
  look: ProviderAppearance,
) => {
  const field = testProvider(el, look)
  return {
    ...field,
    on: (
      event: Parameters<ProviderField['on']>[0],
      send: Parameters<ProviderField['on']>[1],
    ) =>
      event === 'change'
        ? queueMicrotask(() =>
            send({ error: 'This card was declined.' }),
          )
        : field.on(event, send),
  }
}

export const PaymentCardInputBasic = () => (
  <PaymentCardInput
    label="Card details"
    mount={testProvider}
  />
)

export const PaymentCardInputStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <PaymentCardInput
        label="Card details"
        mount={testProvider}
      />
    </Cell>
    <Cell name="Hint">
      <PaymentCardInput
        label="Card details"
        mount={testProvider}
        hint="Charged on the 1st of each month."
      />
    </Cell>
    <Cell name="Invalid">
      <PaymentCardInput
        label="Card details"
        mount={failedProvider}
      />
    </Cell>
  </Grid>
)
