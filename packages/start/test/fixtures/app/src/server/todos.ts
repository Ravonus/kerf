// The fixture's server module (research 27): the client gets stubs (ids and `optimistic` only).
import { invalidate, mutation, query, redirect } from '@weft-js/start'
import { SERVER_ONLY, type Todo } from '../db'
import { object } from '../schema'

const secret = SERVER_ONLY // must never reach the client

export const listTodos = query({
  tags: ['todos'],
  run: ({ ctx }) => (ctx.db.runs.list++, ctx.db.list.map(t => ({ ...t }))),
})

export const getTodo = query({
  input: object({ id: 'string' }),
  tags: ({ id }) => ['todos', `todo:${id}`],
  run: ({ input, ctx }) => ctx.db.list.find(t => t.id === input.id) ?? redirect('/todos'),
})

/** Cached across requests until a mutation invalidates `todos`. */
export const todoStats = query({
  tags: ['todos'],
  cache: { life: 'minutes' },
  run: ({ ctx }) => ({ total: ctx.db.list.length, done: ctx.db.list.filter(t => t.done).length, runs: ++ctx.db.runs.stats }),
})

/** Q006: a cached query reading the request. */
export const leaky = query({
  cache: { life: 'minutes' },
  run: ({ ctx }) => ctx.request.headers.get('cookie'),
})

const temp = (title: string): Todo => ({ id: `tmp-${title}`, title, done: false })

export const addTodo = mutation({
  input: object({ title: 'string' }),
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => void list.push(temp(input.title))),
  run: async ({ input, ctx }) => {
    if (input.title === 'slow') await new Promise(ok => setTimeout(ok, 300))
    if (input.title === 'fail') throw new Error('refused')
    const todo = { id: String(ctx.db.next++), title: input.title, done: false }
    ctx.db.list.push(todo)
    return todo
  },
})

export const toggleTodo = mutation({
  input: object({ id: 'string' }),
  invalidates: ({ id }) => ['todos', `todo:${id}`],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const t = list.find(x => x.id === input.id)
      if (t) t.done = !t.done
    }),
  run: ({ input, ctx }) => {
    const t = ctx.db.list.find(x => x.id === input.id)
    if (!t) throw new Error(`no todo ${input.id} (${secret.length})`)
    t.done = !t.done
    return t
  },
})

/** Sets a cookie and redirects: the shape a sign-in takes. */
export const signIn = mutation({
  run: ({ ctx }) => {
    ctx.response.headers.append('set-cookie', 'session=abc; Path=/; HttpOnly')
    invalidate('session')
    return redirect('/todos')
  },
})
