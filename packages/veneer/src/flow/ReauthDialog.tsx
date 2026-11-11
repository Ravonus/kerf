import { uid } from '@kerf-js/veneer-core'
import { derived, untrack, type State } from '@kerf-js/core'
import { Button } from '../Button'
import { Input } from '../Field'
import { Modal } from '../Modal'
import { FormError, useStepForm, type FlowForm } from './kit'
import { PasskeyButton } from './Sso'

/** Props for ReauthDialog. */
export interface ReauthProps extends Omit<FlowForm<{ password: string }>, 'form' | 'onSubmit'> {
  open: State<boolean>
  /** Why it asks: "Deleting a project needs your password." */
  reason?: unknown
  /** With the password; close `open` when it's accepted. */
  onConfirm?: (password: string) => void
  /** Shows "Use a passkey"; WebAuthn is the app's. */
  onPasskey?: () => unknown
}

/** Re-auth (09 §2.1): a Dialog before a sensitive act, with the password or a passkey. The 5-minute grant is the server's. */
export function ReauthDialog(p: ReauthProps) {
  const id = uid('reauth')
  const src = untrack(() => p)
  const ctl = useStepForm<{ password: string }>(
    {
      get errors() {
        return src.errors
      },
      get error() {
        return src.error
      },
      get pending() {
        return src.pending
      },
      get errorOptions() {
        return src.errorOptions
      },
      get onRetry() {
        return src.onRetry
      },
      onSubmit: (v) => src.onConfirm?.(v.password),
    },
    (v) => ({ password: v.password ? undefined : 'Enter your password.' }),
  )
  const foot = derived(() => ctl.pending.value)
  return (
    <Modal
      open={p.open}
      size="sm"
      title="Confirm it's you"
      description={<>{p.reason} You won't be asked again for 5 minutes.</>}
      footer={
        <>
          {p.onPasskey && (
            <PasskeyButton full={false} onPasskey={p.onPasskey}>
              Use a passkey
            </PasskeyButton>
          )}
          <Button type="submit" form={id} loading={foot.value}>
            Confirm
          </Button>
        </>
      }
    >
      <form ref={(n) => ctl.bind(n)} id={id} data-scope="stack" novalidate onSubmit={ctl.submit}>
        <FormError ctl={ctl} />
        <Input
          label="Password"
          name="password"
          type="password"
          autocomplete="current-password"
          hint=""
          autofocus
          error={ctl.errors.value.password}
        />
      </form>
    </Modal>
  )
}
