import { Button, Input, Select, SettingRow, SettingsSection } from '@weft-js/warp'
import { SettingsWidth, NODE_VERSIONS } from './shared'

export const SettingRowControls = () => (
  <SettingsWidth>
    <SettingsSection
      id="row-kinds"
      title="Build"
      description="A control on the end, or stacked for a wide field."
    >
      <SettingRow title="Node version" description="Used for every build of this project.">
        <Select label="Node version" options={NODE_VERSIONS} defaultValue="26" />
      </SettingRow>
      <SettingRow title="Clear the build cache" description="The next build starts from nothing.">
        <Button emphasis="outline" tone="neutral" size="sm">
          Clear cache
        </Button>
      </SettingRow>
      <SettingRow layout="stack">
        <Input label="Build command" defaultValue="pnpm build" />
      </SettingRow>
    </SettingsSection>
  </SettingsWidth>
)
