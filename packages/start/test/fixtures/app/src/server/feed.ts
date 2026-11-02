// Realtime in the fixture (research 30): a topic, a stream over it, and a live query.
import { mutation, query, realtimeStats, stream, topic } from '@weft-js/start'
import { object } from '../schema'

export const notes = topic('notes', { message: object({ text: 'string' }) })

export const noteFeed = stream({
  message: object({ text: 'string' }),
  async *run({ signal, lastEventId }) { yield* notes.subscribe('all', { signal, after: lastEventId }) },
})

export const postNote = mutation({
  input: object({ text: 'string' }),
  run: async ({ input }) => { await notes.publish('all', { text: input.text }) },
})

let hits = 0
export const counter = query({ tags: ['counter'], run: () => ({ hits }) })
export const bump = mutation({ invalidates: ['counter'], run: () => { hits++ } })

/** The hub's counts, so a test can see a closed tab reach the server. */
export const rtStats = query({ run: () => realtimeStats() })
