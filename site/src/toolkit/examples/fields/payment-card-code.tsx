import { state } from '@kerf-js/core'
import {
  Button,
  CardNumberText,
  CodeInput,
  Input,
  PaymentCardInput,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import type {
  ProviderAppearance,
  ProviderField,
} from '@kerf-js/veneer'
import { testProvider } from './place-payment'

/**
 * A test provider that says when the number is
 * whole, so Pay waits for a complete card.
 */
function watchedProvider(
  done: (complete: boolean) => void,
) {
  return (
    el: HTMLElement,
    look: ProviderAppearance,
  ): ProviderField => {
    const field = testProvider(el, look)
    return {
      ...field,
      on: (event, send) =>
        field.on(
          event,
          event === 'change'
            ? (e) => {
                done(!!e.complete)
                send(e)
              }
            : send,
        ),
    }
  }
}

/**
 * A checkout's card step: Pay stays off until the
 * provider says the card is complete.
 */
export function PaymentCardInputCheckout() {
  const complete = state(false)
  const paid = state(false)
  const pay = (e: Event) => {
    e.preventDefault()
    paid.value = true
  }
  return (
    <Stack
      as="form"
      gap="group"
      onSubmit={pay}
    >
      <Text role="heading">Pay for Team</Text>
      <Input
        label="Name on card"
        autocomplete="cc-name"
        defaultValue="Mara Lindqvist"
      />
      <PaymentCardInput
        label="Card details"
        hint="Try 4242 4242 4242 4242."
        mount={watchedProvider(
          (c) => (complete.value = c),
        )}
      />
      <Row justify="between">
        <Text
          subtle
          role="caption"
        >
          {paid.value
            ? 'Paid. A receipt is on its way.'
            : '$160 today, then monthly.'}
        </Text>
        <Button
          type="submit"
          aria-disabled={
            complete.value ? undefined : 'true'
          }
        >
          Pay $160
        </Button>
      </Row>
    </Stack>
  )
}

const CARDS = [
  {
    last4: '4242',
    bin: '424242',
    month: 9,
    year: 2028,
    note: 'Default',
  },
  {
    last4: '4444',
    bin: '555555',
    month: 3,
    year: 2027,
    note: 'Backup',
  },
  {
    last4: '0005',
    bin: '378282',
    month: 11,
    year: 2026,
    note: 'Expires soon',
  },
]

export const CardNumberTextBasic = () => (
  <CardNumberText
    last4="4242"
    bin="424242"
    expiry={{ month: 9, year: 2028 }}
  />
)

export const CardNumberTextBrands = () => (
  <Stack gap="tight">
    <CardNumberText
      last4="4242"
      bin="424242"
    />
    <CardNumberText
      last4="4444"
      bin="555555"
    />
    <CardNumberText
      last4="0005"
      bin="378282"
    />
    <CardNumberText
      last4="1117"
      brand="Discover"
    />
  </Stack>
)

export function CardNumberTextSaved() {
  const main = state('4242')
  return (
    <Stack
      gap="related"
      divided
    >
      {CARDS.map((c) => (
        <Row
          key={c.last4}
          justify="between"
          gap="group"
        >
          <Stack gap="hair">
            <CardNumberText
              last4={c.last4}
              bin={c.bin}
              expiry={c}
            />
            <Text
              role="caption"
              subtle
            >
              {main.value === c.last4
                ? 'Default'
                : c.note === 'Default'
                  ? 'Saved'
                  : c.note}
            </Text>
          </Stack>
          <Button
            size="sm"
            emphasis="ghost"
            tone="neutral"
            aria-disabled={
              main.value === c.last4 ? 'true' : undefined
            }
            onClick={() => (main.value = c.last4)}
          >
            Make default
          </Button>
        </Row>
      ))}
    </Stack>
  )
}

/* ---- CodeInput ---- */

export const SCRIPT =
  'export async function onDeploy(ctx) {\n' +
  `  const health = await ctx.fetch('/health')
  if (health.status !== 200) {
    return ctx.rollback('Health check failed')
  }
  await ctx.notify('#deploys', ctx.commit)
}
`

export const CodeInputBasic = () => (
  <CodeInput
    label="Post-deploy hook"
    language="ts"
    defaultValue={SCRIPT}
    rows={8}
  />
)
