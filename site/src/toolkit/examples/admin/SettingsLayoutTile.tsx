import {
  SettingRow,
  SettingsSection,
  Stack,
  Switch,
} from '@weft-js/warp'
import { SettingsWidth } from './shared'

export const SettingsLayoutTile = () => (
  <Stack style="inline-size:340px">
    <SettingsWidth>
      <SettingsSection
        id="tile-general"
        title="Deploys"
        description="How storefront ships."
      >
        <SettingRow
          title="Preview environments"
          description="A URL for every pull request."
        >
          <Switch
            size="sm"
            defaultChecked
            aria-label="Preview environments"
          />
        </SettingRow>
      </SettingsSection>
    </SettingsWidth>
  </Stack>
)
