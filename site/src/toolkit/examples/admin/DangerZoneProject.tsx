import { state } from '@kerf/core'
import {
  Button,
  ConfirmDialog,
  DangerZone,
  SettingRow,
  TypeToConfirm,
} from '@kerf/veneer'
import { wait, SettingsWidth } from './shared'

export function DangerZoneProject() {
  const remove = state(false)
  const transfer = state(false)
  return (
    <SettingsWidth>
      <DangerZone
        id="danger-demo"
        description={[
          'These change who can reach ',
          "storefront. One can't be undone.",
        ].join('')}
      >
        <SettingRow
          title="Transfer project"
          description={[
            'Give storefront to another ',
            'workspace.',
          ].join('')}
        >
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            onClick={() => (transfer.value = true)}
          >
            Transfer
          </Button>
        </SettingRow>
        <SettingRow
          title="Delete project"
          description={[
            'Deletes storefront and its 412 ',
            'deploys for good.',
          ].join('')}
        >
          <Button
            emphasis="soft"
            tone="critical"
            size="sm"
            onClick={() => (remove.value = true)}
          >
            Delete project
          </Button>
        </SettingRow>
        <ConfirmDialog
          open={transfer}
          title="Transfer storefront?"
          description={[
            'You lose access until the new ',
            'owner invites you.',
          ].join('')}
          action="Transfer project"
          onConfirm={() => wait(600)}
        />
        <TypeToConfirm
          open={remove}
          title="Delete storefront?"
          description={[
            'This permanently deletes the ',
            'project.',
          ].join('')}
          confirmText="storefront"
          items={[
            '412 deploys and their logs',
            'Its environment variables',
          ]}
          action="Delete project"
          onConfirm={() => wait(800)}
        />
      </DangerZone>
    </SettingsWidth>
  )
}
