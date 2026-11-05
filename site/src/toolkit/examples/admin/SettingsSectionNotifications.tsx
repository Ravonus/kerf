import {
  SettingRow,
  SettingsSection,
  Switch,
} from '@weft-js/warp'
import { SettingsWidth } from './shared'

export const SettingsSectionNotifications = () => (
  <SettingsWidth>
    <SettingsSection
      id="mail"
      title="Email"
      description="Choose what reaches your inbox."
    >
      <SettingRow
        title="Weekly summary"
        description={[
          'Deploys, uptime and spend, every ',
          'Monday.',
        ].join('')}
      >
        {(ids: {
          label: string
          description: string
        }) => (
          <Switch
            size="sm"
            defaultChecked
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
          />
        )}
      </SettingRow>
      <SettingRow
        title="Product news"
        description="A few times a year."
      >
        {(ids: {
          label: string
          description: string
        }) => (
          <Switch
            size="sm"
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
          />
        )}
      </SettingRow>
    </SettingsSection>
  </SettingsWidth>
)
