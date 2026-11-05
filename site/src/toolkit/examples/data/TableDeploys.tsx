import { Button, Table } from '@weft-js/warp'

import { DEPLOYS } from '../../world'

import { DEPLOY_COLUMNS } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const TableDeploys = () => (
  <Table
    caption="Recent deploys"
    rows={DEPLOYS}
    columns={DEPLOY_COLUMNS}
    filter="Filter deploys"
    density="cozy"
    actions={<Button icon="rocket">Deploy</Button>}
  />
)
