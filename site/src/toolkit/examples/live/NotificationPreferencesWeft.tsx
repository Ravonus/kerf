import { NotificationPreferences } from '@weft-js/warp'
import { CHANNELS, PREF_GROUPS, PREF_LOCKED, PREF_OFFERED, PREFS } from '../../world'
import { pause } from './shared'

export const NotificationPreferencesWeft = () => (
  <NotificationPreferences
    groups={PREF_GROUPS}
    channels={CHANNELS}
    value={PREFS}
    offered={PREF_OFFERED}
    locked={PREF_LOCKED}
    defaults={{ value: PREFS }}
    onChange={() => pause(400)}
    onDigest={() => pause(400)}
  />
)
