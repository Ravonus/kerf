import { Feed } from '@kerf/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { ACTIVITY } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const FeedActivity = () => (
  <Feed
    label="Activity"
    items={ACTIVITY}
    height="400px"
  />
)
