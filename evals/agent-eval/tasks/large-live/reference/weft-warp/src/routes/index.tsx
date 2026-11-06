import { state } from '@weft-js/core'
import { presence } from '@weft-js/multiplayer'
import { redirect, type LoadArgs, type RouteProps } from '@weft-js/start'
import { deleteMessage, listMessages, postMessage } from '#/server/board'
import { boardRoom } from '#/server/presence'
import { signOut } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/signin')
  return { id: ctx.user.id, email: ctx.user.email }
}
export default function Board(props: RouteProps<typeof load>) {
  const messages = listMessages.live()
  const room = presence(boardRoom.connect({ room: 'board' }), { state: () => ({}) })
  const text = state('')
  const pending = state('')
  const error = state('')
  const post = async () => {
    const value = text.value.trim()
    if (!value) return
    if (value.length > 280) {
      error.value = 'Too long'
      return
    }
    pending.value = value
    text.value = ''
    error.value = ''
    try {
      await postMessage({ id: crypto.randomUUID(), text: value })
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'Post failed'
    } finally {
      pending.value = ''
    }
  }
  return (
    <main>
      <p>Signed in as {props.data.email}</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
      <p>{room.peers.value.length + 1} online</p>
      <label>
        Message
        <input
          value={text.value}
          onInput={(event) => {
            text.value = event.currentTarget.value
          }}
        />
      </label>
      <button type="button" onClick={() => void post()}>
        Post
      </button>
      {error.value && <p role="alert">{error.value}</p>}
      <ul aria-label="Messages">
        {pending.value && (
          <li>
            {pending.value} {props.data.email}
          </li>
        )}
        {(messages.value ?? []).map((message) => (
          <li key={message.id}>
            <span>{message.text}</span> <span>{message.authorEmail}</span>
            {message.authorId === props.data.id && (
              <button type="button" onClick={() => void deleteMessage({ id: message.id })}>
                Delete {message.text}
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
