import { state } from '@weft-js/core'

import {
  Button,
  Input,
  Row,
  Select,
  Stack,
  Switch,
  SyncedForm,
} from '@weft-js/warp'

import type { Peer } from '@weft-js/warp'

import { JUN } from '../../world'

import { OWNERS } from './shared-wait'

export function SyncedFormRunbook() {
  const ops = state<
    {
      seq: number
      name: string
      value: string | boolean
      peer: Peer
    }[]
  >([])
  const remote = (
    name: string,
    value: string | boolean,
  ) =>
    (ops.value = [
      ...ops.value,
      {
        seq: ops.value.length + 1,
        name,
        value,
        peer: JUN,
      },
    ])
  return (
    <Stack gap="group">
      <SyncedForm
        ops={ops}
        label="Runbook details"
      >
        <Input
          label="Title"
          name="title"
          defaultValue="Rollback runbook"
        />
        <Select
          label="Owner"
          name="owner"
          options={OWNERS}
          defaultValue="sam"
        />
        <Switch
          name="notify"
          defaultChecked
        >
          Tell #incidents
        </Switch>
      </SyncedForm>
      <Row gap="tight">
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() =>
            remote('title', 'Rollback runbook v2')
          }
        >
          Jun edits the title
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() => remote('notify', false)}
        >
          Jun flips the switch
        </Button>
      </Row>
    </Stack>
  )
}
