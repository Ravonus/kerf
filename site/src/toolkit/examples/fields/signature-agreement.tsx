import { state } from '@weft-js/core'
import {
  Button,
  Grid,
  SignaturePad,
  Stack,
  Text,
} from '@weft-js/warp'
import type { SignatureValue } from '@weft-js/warp'
import { Cell } from '../../world'

export const SignaturePadStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <SignaturePad label="Signature" />
    </Cell>
    <Cell name="Hint">
      <SignaturePad
        label="Signature"
        hint="Sign as Mara Lindqvist, Owner."
      />
    </Cell>
    <Cell name="Invalid">
      <SignaturePad
        label="Signature"
        error="Sign before you continue."
      />
    </Cell>
  </Grid>
)

export function FormDataAgreement() {
  const signature = state<SignatureValue | null>(null)
  const tried = state(false)
  const done = state(false)
  const submit = (e: Event) => {
    e.preventDefault()
    tried.value = true
    if (signature.value) done.value = true
  }
  return (
    <Stack
      as="form"
      gap="group"
      onSubmit={submit}
    >
      <Stack gap="hair">
        <Text role="heading">
          Data processing agreement
        </Text>
        <Text subtle>
          weft GmbH will process logs only to run your
          deploys.
        </Text>
      </Stack>
      <SignaturePad
        label="Signature"
        value={signature}
        error={
          tried.value && !signature.value
            ? 'Sign before you continue.'
            : undefined
        }
      />
      <Button
        type="submit"
        full
      >
        {done.value ? 'Signed' : 'Sign agreement'}
      </Button>
    </Stack>
  )
}
