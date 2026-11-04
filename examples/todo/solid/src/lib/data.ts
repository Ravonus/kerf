import { action, query } from '@solidjs/router'

import { loadViewer, signIn, signOut } from '~/server/account'
import { insertTodo, loadTodos, removeTodo, setDone } from '~/server/todos'

export const getViewer = query(loadViewer, 'viewer')
export const getTodos = query(loadTodos, 'todos')

export const signInAction = action(signIn, 'signIn')
export const signOutAction = action(signOut, 'signOut')

/**
 * Writes leave one at a time. Each reply carries the list as that write left it, and the last reply to land is what stays on
 * screen, so two writes in flight could leave an older list showing than the database holds.
 */
let tail: Promise<unknown> = Promise.resolve()

type ServerFn<A extends unknown[], R> = ((...args: A) => Promise<R>) & {
  url?: string
  withOptions?: (o: object) => ServerFn<A, R>
}

function inOrder<A extends unknown[], R>(fn: ServerFn<A, R>): ServerFn<A, R> {
  const queued = (...args: A) => {
    const sent = tail.then(() => fn(...args))
    tail = sent.catch(() => {})
    return sent
  }
  return Object.assign(queued, {
    url: fn.url,
    withOptions: fn.withOptions && ((o: object) => inOrder(fn.withOptions!(o))),
  })
}

export const addTodo = action(inOrder(insertTodo), 'addTodo')
export const toggleTodo = action(inOrder(setDone), 'toggleTodo')
export const deleteTodo = action(inOrder(removeTodo), 'deleteTodo')
