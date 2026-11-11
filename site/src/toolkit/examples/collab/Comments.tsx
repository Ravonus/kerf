import { state } from '@kerf/core'

import {
  CommentAnchor,
  CommentRail,
  Heading,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'

import type { CommentThreadData } from '@kerf/veneer'

import {
  COMMENT_OWNER,
  COMMENT_TIMEOUTS,
} from '../../world'

import { newComment } from './shared-wait'

export function CommentRailDocument() {
  const active = state<string | null>('c-timeouts')
  const threads = state<CommentThreadData[]>([
    COMMENT_TIMEOUTS,
    COMMENT_OWNER,
  ])
  const reply = (id: string, text: string) =>
    (threads.value = threads.value.map((t) =>
      t.id === id
        ? {
            ...t,
            comments: [...t.comments, newComment(text)],
          }
        : t,
    ))
  return (
    <Row
      gap="group"
      align="start"
      reflow="tablet"
    >
      <Stack gap="related">
        <Heading level={3}>Rollback runbook</Heading>
        <Text>
          The cache keeps a page for{' '}
          <CommentAnchor
            thread="c-timeouts"
            active={active}
          >
            60 seconds
          </CommentAnchor>{' '}
          after a deploy, so a rollback can take a minute
          to reach everyone.
        </Text>
        <Text>
          <CommentAnchor
            thread="c-owner"
            active={active}
          >
            The person on call
          </CommentAnchor>{' '}
          decides, and tells support once it is done.
        </Text>
      </Stack>
      <CommentRail
        threads={threads}
        active={active}
        onReply={reply}
      />
    </Row>
  )
}
