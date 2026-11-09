import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { provision, psql } from '../../shared/pg/env.mjs'
import { signIn } from '../flow.mjs'
import { launchBrowser } from '../measure.mjs'
import { startServer } from '../serve.mjs'

export const pgUp = await psql('postgres', 'select 1').then(
  () => true,
  () => false,
)

export const manifest = {
  name: 'fixture',
  db: { rtt: [2, 40], pool: 10 },
  login: { path: '/login', email: 'Email', password: 'Password', submit: 'Sign in' },
  pages: [
    { path: '/login' },
    {
      path: '/todos',
      canary: { sql: "update todos set title = $1 where id = md5('todo-1')::uuid", text: true },
      interact: ['checkbox:Seeded todo 1', 'checkbox:Seeded todo 2'],
      nav: { click: 'link:Active', url: 'filter=active', see: 'Seeded todo 2' },
      mutate: { fill: { 'textbox:New todo': '$value' }, click: 'button:Add', see: '$value' },
      rows: {
        50: "delete from todos where user_id = 'bench-user' and created_at > timestamptz '2026-10-01 00:50:00+00'",
      },
    },
  ],
  race: {
    path: '/todos',
    list: 'Todos',
    input: 'New todo',
    submit: 'Add',
    toggle: 'Seeded todo 1',
    state: "select title, done from todos where user_id = 'bench-user'",
    away: { link: 'Active', keep: { done: false } },
  },
}

async function startFixture(variant, env, browser) {
  const db = await provision('fixture', variant),
    root = fileURLToPath(new URL('../fixture', import.meta.url))
  const v = {
    name: variant,
    root,
    start: 'node server.mjs',
    stack: { out: [] },
    dbEnv: db.env,
    buildEnv: { ...db.env, ...env },
    log: join(mkdtempSync(join(tmpdir(), 'bench-log-')), 'log'),
  }
  const server = await startServer(v, '/__up', { proveBuild: false }),
    site = {
      db,
      url: server.url,
      jar: [],
      cookies: () => site.jar,
      login: async () => {
        site.jar = await signIn(browser(), server.url, manifest.login)
      },
    }
  return {
    db,
    server,
    site,
    stop: async () => {
      await server.stop()
      await db.stop()
    },
  }
}

/** Call inside a `describe`: one browser for its tests, and `up` to start the fixture server on its own database. */
export function liveHarness() {
  let browser
  const up = (variant, env = {}) => startFixture(variant, env, () => browser)
  const fresh = (s) => async () => {
    await s.db.reset()
    await s.site.login()
    return s.site.cookies()
  }
  before(async () => {
    browser = await launchBrowser()
  })
  after(() => browser.close())
  return { up, fresh, getBrowser: () => browser }
}
