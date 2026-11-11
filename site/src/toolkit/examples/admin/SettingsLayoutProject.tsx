import { state } from '@kerf-js/core'
import type { State } from '@kerf-js/core'
import {
  Button,
  ConfirmDialog,
  DangerZone,
  Input,
  Select,
  SettingRow,
  SettingsLayout,
  SettingsSection,
  Switch,
} from '@kerf-js/veneer'
import { wait, SECTIONS, REGIONS } from './shared'

export function SettingsLayoutProject() {
  const section = state('general')
  const previews = state(true)
  const failures = state(true)
  const archive = state(false)
  return (
    <SettingsLayout
      sections={SECTIONS}
      current={section.value}
      onNavigate={(id) => (section.value = id)}
    >
      <SettingsSection
        id="general"
        title="General"
        description="How storefront appears across kerf."
      >
        <SettingRow layout="stack">
          <Input
            label="Project name"
            defaultValue="storefront"
          />
        </SettingRow>
        <SettingRow
          title="Region"
          description="Where its builds and logs live."
        >
          <Select
            label="Region"
            options={REGIONS}
            defaultValue="eu-west"
          />
        </SettingRow>
      </SettingsSection>
      <ProjectDeploys previews={previews} />
      <ProjectAlerts failures={failures} />
      <DangerZone id="project-danger">
        <SettingRow
          title="Archive project"
          description={[
            'Stops deploys and makes it ',
            'read-only.',
          ].join('')}
        >
          <Button
            emphasis="soft"
            tone="critical"
            size="sm"
            onClick={() => (archive.value = true)}
          >
            Archive
          </Button>
        </SettingRow>
      </DangerZone>
      <ConfirmDialog
        open={archive}
        title="Archive storefront?"
        description={[
          'Deploys stop. You can restore it ',
          'at any time.',
        ].join('')}
        action="Archive project"
        onConfirm={() => wait(600)}
      />
    </SettingsLayout>
  )
}

function ProjectDeploys({
  previews,
}: {
  previews: State<boolean>
}) {
  return (
    <SettingsSection
      id="deploys"
      title="Deploys"
    >
      <SettingRow
        title="Preview environments"
        description="Every pull request gets its own URL."
      >
        {(ids: {
          label: string
          description: string
        }) => (
          <Switch
            size="sm"
            checked={previews.value}
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
            onChange={() =>
              (previews.value = !previews.value)
            }
          />
        )}
      </SettingRow>
    </SettingsSection>
  )
}

function ProjectAlerts({
  failures,
}: {
  failures: State<boolean>
}) {
  return (
    <SettingsSection
      id="alerts"
      title="Notifications"
    >
      <SettingRow
        title="Failed deploys"
        description={[
          "Mail the project's owner when a ",
          'deploy fails.',
        ].join('')}
      >
        {(ids: {
          label: string
          description: string
        }) => (
          <Switch
            size="sm"
            checked={failures.value}
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
            onChange={() =>
              (failures.value = !failures.value)
            }
          />
        )}
      </SettingRow>
    </SettingsSection>
  )
}
