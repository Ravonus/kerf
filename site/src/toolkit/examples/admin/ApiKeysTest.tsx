import { state } from '@kerf/core'
import { ApiKeys, Toaster } from '@kerf/veneer'
import type { ApiKey } from '@kerf/veneer'
import { API_KEYS, NOW } from '../../world'
import { wait } from './shared'

// -- keys --

export function ApiKeysTest() {
  const keys = state<readonly ApiKey[]>(API_KEYS)
  const create = async (draft: {
    name: string
    scopes: string[]
  }) => {
    await wait(600)
    keys.value = [
      {
        id: draft.name,
        name: draft.name,
        prefix: 'tsl_test_77aa',
        scopes: draft.scopes,
        created: 'Today',
      },
      ...keys.value,
    ]
    return 'tsl_test_77aa_sample_not_a_real_key'
  }
  return (
    <>
      <ApiKeys
        keys={keys}
        now={NOW}
        onCreate={create}
        onRevoke={(key) => {
          keys.value = keys.value.filter((k) => k !== key)
        }}
      />
      <Toaster />
    </>
  )
}
