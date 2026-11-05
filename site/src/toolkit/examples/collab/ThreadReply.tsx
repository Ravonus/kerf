import { state } from '@weft-js/core'

import { CommentThread } from '@weft-js/warp'

import { COMMENT_TIMEOUTS } from '../../world'

import { newComment } from './shared-wait'

export function CommentThreadReply() {
  const thread = state(COMMENT_TIMEOUTS)
  const reply = (text: string) =>
    (thread.value = {
      ...thread.value,
      comments: [
        ...thread.value.comments,
        newComment(text),
      ],
    })
  return (
    <CommentThread
      thread={thread}
      onReply={reply}
    />
  )
}
