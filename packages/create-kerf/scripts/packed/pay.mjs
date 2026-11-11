import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fnId } from '../../../start/src/vite.mjs'

/** Preloaded into the built server of the pay app: a request that leaves this machine fails the gate instead of being sent. */
const LOOPBACK_ONLY = `const real = globalThis.fetch
globalThis.fetch = (input, init) => {
  const { hostname } = new URL(input?.url ?? input)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) throw new Error('no-network: refused a request to ' + hostname)
  return real(input, init)
}
`

/** The add path, a page that sells, and a report only a buyer may read. The rail talks to `mock`, a local stand-in for Stripe. */
export async function payApp(app, kerf, mock, log, sh) {
  await sh(kerf, ['add', 'pay'], app)
  const config = join(app, 'kerf.config.ts')
  const text = readFileSync(config, 'utf8')
  const pointed = text.replace(/\b(\w*[sS]tripe)\(\)/, `$1({ api: 'http://127.0.0.1:${mock}' })`)
  if (pointed === text)
    throw new Error(`pay: no Stripe plugin call to point at the mock in:\n${text}`) // never fall through to the real API
  writeFileSync(config, pointed)
  await sh(kerf, ['plugins', 'approve', '--all'], app)
  if (!readFileSync(join(app, '.kerf/slots/pay.rail.ts'), 'utf8').includes(`127.0.0.1:${mock}`))
    await sh(kerf, ['plugins', 'sync'], app)
  if (!readFileSync(join(app, '.kerf/slots/pay.rail.ts'), 'utf8').includes(`127.0.0.1:${mock}`))
    throw new Error('pay: the rail is not pointed at the mock')
  writeFileSync(join(app, 'no-network.mjs'), LOOPBACK_ONLY)
  writeFileSync(
    join(app, 'src/server/report.ts'),
    `import { query } from '@kerf-js/start'\n\nexport const report = query({ auth: 'user', requires: ['pro'], run: () => 'the numbers' })\n`,
  )
  writeFileSync(
    join(app, 'src/routes/pricing.tsx'),
    `import { price } from '@kerf-js/pay'
import { pro } from '#/pay/catalog'
import { checkout, entitlements } from '#/server/pay'

export default function Pricing() {
  const mine = entitlements.live()
  return (
    <main>
      <p>{mine.value?.includes('pro') ? 'Thanks' : 'Free'}</p>
      <button onClick={() => checkout({ product: 'pro', plan: 'month' })}>Go Pro: {price(pro, 'month').display}</button>
    </main>
  )
}
`,
  )
  log('kerf add pay, approve: pass')
}

/** A whole purchase against the built server: sign up, check out at the mock, then signed webhooks, forged and repeated ones. */
export async function payServed(port, sessions, secret, log) {
  const base = `http://localhost:${port}`
  const email = 'buyer@example.test'
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ name: 'Buyer', email, password: 'correct-horse-battery' }),
  })
  if (!signup.ok) throw new Error(`pay: sign-up answered ${signup.status}: ${await signup.text()}`)
  const cookie = signup.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const user = (await signup.json()).user.id
  const call = (name, file) =>
    fetch(`${base}/_kerf/fn/${fnId(name, file)}`, {
      headers: { cookie, accept: 'application/json' },
    })
  const report = () => call('report', 'src/server/report.ts').then((r) => r.status)
  const first = await call('report', 'src/server/report.ts')
  if (first.status !== 403)
    throw new Error(`pay: a non-buyer got ${first.status}: ${await first.text()}`)

  const mutate = await fetch(`${base}/_kerf/fn/${fnId('checkout', 'src/server/pay.ts')}`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      accept: 'application/json',
      'x-kerf': '1',
      origin: base,
    },
    body: JSON.stringify({ i: { product: 'pro', plan: 'month' }, f: [] }),
  })
  const answer = await mutate.json()
  if (!answer.r?.startsWith('http://127.0.0.1'))
    throw new Error(`pay: checkout answered ${JSON.stringify(answer)}`)
  if (sessions.length !== 1 || !sessions[0].authorized)
    throw new Error(`pay: the mock saw ${JSON.stringify(sessions)}`)
  if ((await report()) !== 403) throw new Error('pay: checkout granted something')
  log('checkout reaches the mock rail and grants nothing: pass')

  const hook = (event, key = secret) => {
    const body = JSON.stringify(event),
      t = Math.floor(Date.now() / 1000)
    const v1 = createHmac('sha256', key).update(`${t}.${body}`).digest('hex')
    return fetch(`${base}/_kerf/x/pay/stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' },
      body,
    }).then((r) => r.status)
  }
  const event = (id, status, ahead = 0) => ({
    id,
    type: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000) + ahead,
    data: {
      object: {
        id: 'sub_1',
        status,
        customer: 'cus_1',
        current_period_end: Math.floor(Date.now() / 1000) + 2_592_000,
        metadata: { kerf_user: user, kerf_product: 'pro', kerf_plan: 'month' },
      },
    },
  })
  if (
    (await hook(event('evt_forged', 'active'), 'whsec_wrong')) !== 400 ||
    (await report()) !== 403
  )
    throw new Error('pay: a forged webhook was believed')
  if ((await hook(event('evt_1', 'active'))) !== 200 || (await report()) !== 200)
    throw new Error('pay: a signed webhook granted nothing')
  if ((await hook(event('evt_2', 'canceled', 5))) !== 200 || (await report()) !== 403)
    throw new Error('pay: a cancellation was ignored')
  if ((await hook(event('evt_1', 'active'))) !== 200 || (await report()) !== 403)
    throw new Error('pay: a redelivery changed the ledger')
  log('webhooks: forged refused, signed granted, cancelled, redelivered: pass')
}

/** A local stand-in for Stripe: what the rail sends to `/v1/checkout/sessions`, answered with a URL. Nothing leaves the machine. */
export function mockStripe(port, sessions) {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += c
    })
    req.on('end', () => {
      sessions.push({
        path: req.url,
        authorized: req.headers.authorization === 'Bearer sk_test_placeholder',
        body,
      })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ id: 'cs_1', url: `http://127.0.0.1:${port}/hosted` }))
    })
  })
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => ok(server))
  })
}
