import type { ArtifactVersion } from '@weft-js/warp'

export const CONFIG_VERSIONS: ArtifactVersion[] = [
  {
    id: 'v3',
    label: 'v3 · two retries',
    meta: 'Assistant · now',
    code: 'project: mobile-bff\nregion: ap-south\nretry:\n  attempts: 2\n  timeout: 3s',
  },
  {
    id: 'v2',
    label: 'v2 · five retries',
    meta: 'Sam Okafor · 15:20',
    code: 'project: mobile-bff\nregion: ap-south\nretry:\n  attempts: 5\n  timeout: 3s',
  },
  {
    id: 'v1',
    label: 'v1 · first draft',
    meta: 'Sam Okafor · Oct 12',
    code: 'project: mobile-bff\nregion: ap-south',
  },
]
