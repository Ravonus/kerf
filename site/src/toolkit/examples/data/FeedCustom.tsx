import { Badge, Feed } from '@kerf-js/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { ACTIVITY } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const FeedCustom = () => (
  <Feed
    label="Deploys"
    items={ACTIVITY}
    height="340px"
  >
    {(item) => (
      <>
        <span
          data-part="knot"
          style={
            `--_dc:var(--veneer-color-` +
            `${item().tone}-solid)`
          }
        ></span>
        <span data-part="what">{item().what}</span>
        <Badge tone={item().tone}>{item().when}</Badge>
        <span
          data-part="detail"
          data-measure=""
        >
          {item().detail}
        </span>
      </>
    )}
  </Feed>
)
