import { Button, Table } from '@kerf-js/veneer'

import { COLUMNS, NONE } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const TableEmpty = () => (
  <Table
    caption="Projects"
    captionHidden
    rows={NONE}
    columns={COLUMNS}
    picker={false}
    empty={{
      title: 'No projects yet',
      text:
        'Connect a repository and your first deploy ' +
        'runs in about a minute.',
      action: <Button icon="plus">New project</Button>,
    }}
  />
)
