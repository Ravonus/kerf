import { KeyIcon } from '@weft-js/warp-icons'
import type { State } from '@weft-js/core'
import { Modal } from '../Modal'
import { Table, type Column } from '../Table'
import { ConfirmDialog, TypeToConfirm } from './Danger'
import { SecretReveal } from './Secret'
import { keyForm } from './ApiKeys-form'
import type { ApiKey } from './ApiKeys'
import type { KeyActionsContext, createKeyActions, revokeKeyActions } from './ApiKeys-actions'

type View = KeyActionsContext &
  Pick<ReturnType<typeof createKeyActions>, 'make' | 'toggle'> &
  Pick<ReturnType<typeof revokeKeyActions>, 'gone'> & {
    armed: State<boolean>
    dialog: State<boolean>
    seen: State<boolean>
    title: { readonly value: string }
    tools: { readonly value: unknown }
    footer: { readonly value: unknown }
    columns: Column<ApiKey>[]
    scopes: () => { value: string; label: string }[]
    expiries: () => { value: string; label: string }[]
    setForm: (node: HTMLElement) => void
  }

export function keyView(view: View) {
  const { title, list, columns, tools, armed, dialog, secret, footer } = view
  const { name, seen, nameError, chosen, scopeError, expires } = view
  const { toggle, make, setForm, typedOpen, revoking, gone, plainOpen } = view
  return (
    <div data-scope="stack">
      <Table
        caption={`${title.value === 'live' ? 'Live' : 'Test'} API keys`}
        captionHidden
        rows={list}
        columns={columns}
        picker={false}
        heading={3}
        actions={tools.value}
        empty={{ title: 'No keys yet', text: 'Create one to call the API.' }}
      />
      {armed.value && (
        <Modal
          open={dialog}
          alert={!!secret.value}
          title={secret.value ? 'Copy your new key' : `Create a ${title.value} key`}
          description={
            secret.value
              ? 'You won’t see it again. Store it in your secrets manager now.'
              : 'Give it a name you’ll recognise in the audit log.'
          }
          footer={<>{footer.value}</>}
        >
          {secret.value ? (
            <SecretReveal
              label={name.value}
              secret={secret.value}
              done={seen}
              ack="I’ve saved this key somewhere safe"
            />
          ) : (
            keyForm({
              name,
              nameError,
              chosen,
              scopeError,
              get scopes() {
                return view.scopes()
              },
              expires,
              get expiries() {
                return view.expiries()
              },
              toggle,
              make,
              setForm,
            })
          )}
        </Modal>
      )}
      <TypeToConfirm
        open={typedOpen}
        glyph={KeyIcon}
        title={`Revoke “${revoking.value?.name}”?`}
        description="This key was used in the last 24 hours. Anything using it stops working right away."
        confirmText={revoking.value?.name ?? ''}
        action="Revoke key"
        onConfirm={gone}
      />
      <ConfirmDialog
        open={plainOpen}
        glyph={KeyIcon}
        tone="critical"
        title={`Revoke “${revoking.value?.name}”?`}
        description="Anything still using it stops working right away."
        action="Revoke key"
        onConfirm={gone}
      />
    </div>
  )
}
