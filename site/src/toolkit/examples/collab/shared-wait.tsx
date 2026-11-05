import { Text } from '@weft-js/warp'

import type {
  SyncState,
  Version,
  ChatMessage,
} from '@weft-js/warp'

import {
  CHAT,
  COMMENT_OWNER,
  JUN,
  LENA,
  MARA,
  PRIYA,
  SAM,
} from '../../world'

export const wait = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms)
  })

export const IN_CHANNEL = [SAM, JUN, LENA]

export const EARLY_CHAT = CHAT.slice(0, 3)

export const FAILED: ChatMessage = {
  id: 'failed',
  author: MARA,
  mine: true,
  time: '09:32',
  text: 'Sending the graph from my phone',
  state: 'failed',
}

// The rail fills its parent, so the parent sets the
// height.
export const RailHeight = ({
  children,
}: {
  children: unknown
}) => (
  <div style="display:grid;block-size:180px">
    {children}
  </div>
)

export const ONE_READER = [PRIYA]

// -- comments --

export const newComment = (text: string) => ({
  id: text,
  author: MARA,
  time: 'Now',
  text,
})

export const RESOLVED = {
  ...COMMENT_OWNER,
  resolved: true,
}

export const PREVIEW_LINES: Record<string, string> = {
  v4: 'Roll back first, then read the logs.',
  v3: 'Read the logs, then decide.',
  v2: 'Ask in #incidents.',
  v1: 'To be written.',
}

export const versionPreview = (v: Version) => (
  <Text>{PREVIEW_LINES[v.id] ?? v.meta}</Text>
)

// -- sync --

export const SYNC_STATES: SyncState[] = [
  'saved',
  'saving',
  'offline',
]

export const OWNERS = [
  { value: 'jun', label: 'Jun Tanaka' },
  { value: 'sam', label: 'Sam Okafor' },
]

export const PARTS = [
  { value: 'detect', label: 'Detect' },
  { value: 'roll', label: 'Roll back' },
  { value: 'tell', label: 'Tell people' },
]
