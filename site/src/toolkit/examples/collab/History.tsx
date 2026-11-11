import { state } from '@kerf-js/core'

import { VersionHistory } from '@kerf-js/veneer'

import type { Version } from '@kerf-js/veneer'

import { VERSIONS } from '../../world'

import { versionPreview } from './shared-wait'

export function VersionHistoryRunbook() {
  const versions = state(VERSIONS)
  const restore = (v: Version) => {
    const [now, ...older] = versions.value as [
      Version,
      ...Version[],
    ]
    versions.value = [
      {
        id: `v${versions.value.length + 1}`,
        title: 'Current',
        meta: `Restored from "${v.title}"`,
        current: true,
      },
      {
        ...now,
        title: 'Before the restore',
        current: false,
      },
      ...older,
    ]
  }
  return (
    <VersionHistory
      versions={versions}
      preview={versionPreview}
      onRestore={restore}
    />
  )
}
