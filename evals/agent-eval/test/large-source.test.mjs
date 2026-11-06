import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = new URL('../tasks/large-live/reference/weft-warp/', import.meta.url)
const read = (name) => readFileSync(new URL(name, root), 'utf8')
const sources = {
  board: read('src/server/board.ts'),
  origin: read('src/lib/origin.ts'),
  session: read('src/server/session.ts'),
  presence: read('src/server/presence.ts'),
  auth: read('src/auth.server.ts'),
  context: read('src/context.server.ts'),
  schema: read('src/db/schema.ts'),
  page: read('src/routes/index.tsx'),
}
function verify(input) {
  assert.match(input.board, /auth: 'user'/)
  assert.match(input.board, /eq\(messages\.authorId, ctx\.user\.id\)/, 'author guard')
  assert.equal((input.board.match(/requireSameOrigin\(ctx\.request\)/g) ?? []).length, 2)
  assert.equal((input.session.match(/requireSameOrigin\(ctx\.request\)/g) ?? []).length, 3)
  assert.match(input.origin, /origin !== new URL\(request\.url\)\.origin/, 'origin guard')
  assert.match(input.board, /\.max\(280, 'Too long'\)/)
  assert.match(input.board, /invalidates: \['messages'\]/)
  assert.match(input.presence, /authorize: \(\{ ctx \}\) => ctx\.user !== null/)
  assert.match(input.auth, /@weft-js\/start\/auth\/better-auth/)
  assert.match(input.auth, /drizzleAuth\(db, schema\)/)
  assert.match(input.context, /session\(auth, request\)/)
  assert.match(input.schema, /export const (user|messages) = sqliteTable/g)
  assert.match(input.page, /listMessages\.live\(\)/)
  assert.match(input.page, /presence\(boardRoom\.connect/)
}

test('large reference source contracts and planted guard removals', () => {
  verify(sources)
  assert.throws(
    () =>
      verify({
        ...sources,
        board: sources.board.replace('eq(messages.authorId, ctx.user.id)', 'true'),
      }),
    /author guard/,
  )
  assert.throws(
    () =>
      verify({
        ...sources,
        origin: sources.origin.replace('origin !== new URL(request.url).origin', 'false'),
      }),
    /origin guard/,
  )
})

test('reference imports use declared public packages and include all source files', () => {
  const rootPath = fileURLToPath(root)
  const all = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(path)) all.push(path)
    }
  }
  walk(rootPath)
  assert.equal(all.length, 13)
  const allowed = new Set([
    '@weft-js/start',
    '@weft-js/start/auth',
    '@weft-js/start/auth/better-auth',
    '@weft-js/start/auth/drizzle',
    '@weft-js/start/db/sqlite',
    '@weft-js/core',
    '@weft-js/multiplayer',
    '@weft-js/multiplayer/server',
    '@t3-oss/env-core',
    'drizzle-orm',
    'drizzle-orm/sqlite-core',
    'drizzle-kit',
    'zod',
  ])
  for (const path of all) {
    const text = readFileSync(path, 'utf8')
    for (const match of text.matchAll(/from ['"]([^'"]+)['"]/g)) {
      const name = match[1]
      if (name.startsWith('.') || name.startsWith('#/')) continue
      assert.ok(allowed.has(name), `${path}: undeclared import ${name}`)
    }
  }
})
