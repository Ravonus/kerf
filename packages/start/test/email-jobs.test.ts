// Email (the mailer chosen from the environment, Resend, SMTP, the dev log) and the job queue (enqueue, retries, dead).
import { createServer, type Server } from 'node:net'
import { afterEach, expect, test, vi } from 'vitest'
import {
  consoleMailer,
  currentMailer,
  resendMailer,
  sendEmail,
  smtpMailer,
  useMailer,
  type Mailer,
} from '../src/email'
import { mailed } from '../src/auth/emails'
import { defineJobs, job, jobsState, memoryQueue, type QueuedJob } from '../src/jobs'
import { startJobs } from '../src/server/jobs'
import type { StandardSchemaV1 } from '../src/data'

type Send = (link: {
  user: { email: string; name: string }
  url: string
  token: string
}) => Promise<void>

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  useMailer(undefined, false)
})

test('the mailer comes from the app, then RESEND_API_KEY, then SMTP_URL, then the log in dev', () => {
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('SMTP_URL', '')
  expect(currentMailer()).toBeUndefined()
  useMailer(undefined, true)
  expect(currentMailer()?.name).toBe('console')
  useMailer(undefined, false)
  vi.stubEnv('SMTP_URL', 'smtp://localhost:2525')
  expect(currentMailer()?.name).toBe('smtp')
  useMailer(undefined, false)
  vi.stubEnv('RESEND_API_KEY', 're_test')
  expect(currentMailer()?.name).toBe('resend')
  const mine: Mailer = { name: 'mine', send: () => Promise.resolve() }
  useMailer(mine, false)
  expect(currentMailer()).toBe(mine)
})

test('production with no mailer is E001; no sender is E002', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('SMTP_URL', '')
  await expect(sendEmail({ to: 'a@b.co', subject: 'hi', text: 'x' })).rejects.toMatchObject({
    code: 'E001',
  })
  vi.stubEnv('EMAIL_FROM', '')
  vi.stubGlobal('fetch', vi.fn())
  await expect(
    resendMailer({ apiKey: 'k' }).send({ to: 'a@b.co', subject: 'hi', text: 'x' }),
  ).rejects.toMatchObject({ code: 'E002' })
})

test('Resend gets the message as its API takes it; a refusal is E003', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(
        calls.length === 1
          ? new Response('{"id":"1"}')
          : new Response('bad domain', { status: 422 }),
      )
    }),
  )
  const mailer = resendMailer({ apiKey: 're_key', from: 'App <app@x.co>' })
  await mailer.send({ to: 'a@b.co', subject: 'hi', text: 'body', replyTo: 'r@x.co' })
  expect(calls[0]!.url).toBe('https://api.resend.com/emails')
  expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer re_key')
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
    from: 'App <app@x.co>',
    to: 'a@b.co',
    subject: 'hi',
    text: 'body',
    reply_to: 'r@x.co',
  })
  await expect(mailer.send({ to: 'a@b.co', subject: 'hi', text: 'x' })).rejects.toMatchObject({
    code: 'E003',
  })
})

test('SMTP sends through nodemailer to the server SMTP_URL names', async () => {
  const received: string[] = []
  const server: Server = createServer((socket) => {
    let data = false
    let body = ''
    socket.write('220 test ESMTP\r\n')
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\r\n')) {
        if (data) {
          if (line === '.') {
            data = false
            received.push(body)
            socket.write('250 queued\r\n')
          } else body += line + '\n'
          continue
        }
        const verb = line.slice(0, 4).toUpperCase()
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250 test\r\n')
        else if (verb === 'DATA') {
          data = true
          socket.write('354 go\r\n')
        } else if (verb === 'QUIT') socket.end('221 bye\r\n')
        else if (line) socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((ok) => {
    server.listen(0, '127.0.0.1', ok)
  })
  const { port } = server.address() as { port: number }
  try {
    const mailer = smtpMailer({ url: `smtp://127.0.0.1:${port}`, from: 'app@x.co' })
    await mailer.send({ to: 'a@b.co', subject: 'Over SMTP', text: 'hello there' })
    expect(received).toHaveLength(1)
    expect(received[0]).toContain('Subject: Over SMTP')
    expect(received[0]).toContain('hello there')
  } finally {
    server.close()
  }
})

test('the dev log prints the message, links and all', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  await consoleMailer().send({ to: 'a@b.co', subject: 'Reset', text: 'https://x.co/reset?t=1' })
  expect(info.mock.calls[0]![0]).toContain('https://x.co/reset?t=1')
  info.mockRestore()
})

test("auth's reset and verification emails go through sendEmail unless the app sends its own", async () => {
  const sent: { to: unknown; subject: string; text?: string }[] = []
  useMailer(
    {
      name: 'mine',
      send: (m) => {
        sent.push(m)
        return Promise.resolve()
      },
    },
    false,
  )
  const opts = mailed(undefined)
  const user = { email: 'a@b.co', name: 'Ann' }
  await (opts.emailAndPassword!.sendResetPassword as Send)({
    user,
    url: 'https://x.co/r',
    token: 't',
  })
  await (opts.emailVerification!.sendVerificationEmail as Send)({
    user,
    url: 'https://x.co/v',
    token: 't',
  })
  expect(sent.map((m) => [m.to, m.subject])).toEqual([
    ['a@b.co', 'Reset your password'],
    ['a@b.co', 'Confirm your email'],
  ])
  expect(sent[0]!.text).toContain('https://x.co/r')
  expect(opts.emailAndPassword!.enabled).toBe(true)
  const own = () => Promise.resolve()
  expect(
    mailed({ emailAndPassword: { enabled: false, sendResetPassword: own } }).emailAndPassword,
  ).toEqual({
    enabled: false,
    sendResetPassword: own,
  })
})

const deps = (codes: string[]) => ({
  scopeOptions: { onDiagnostic: (d: { code: string }) => void codes.push(d.code) },
  store: undefined as never,
  boot: () => Promise.resolve(),
  origin: 'http://localhost',
  enter: (_scope: unknown, run: () => Promise<void>) => run(),
})

const positive: StandardSchemaV1<number> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (v) =>
      typeof v === 'number' && v > 0
        ? { value: v }
        : { issues: [{ message: 'expected a positive number' }] },
  },
}

test('enqueue checks input (J006), and a key holds one job until it has run', async () => {
  const queue = memoryQueue()
  const jobs = defineJobs({ charge: job({ input: positive, run: () => {} }) }, { queue })
  await expect(jobs.charge.enqueue(-1)).rejects.toMatchObject({ code: 'J006' })
  expect(await jobs.charge.enqueue(5, { key: 'order-1' })).toMatch(/^[0-9a-f-]{36}$/)
  expect(await jobs.charge.enqueue(5, { key: 'order-1' })).toBeNull()
  expect(queue.size()).toBe(1)
  const [claimed] = await queue.claim(Date.now(), 1000, 10)
  await queue.done(claimed!)
  expect(await jobs.charge.enqueue(5, { key: 'order-1' })).not.toBeNull()
})

test('a claimed job is hidden for its lease, then due again if its process died', async () => {
  const queue = memoryQueue()
  await queue.push({ id: 'a', name: 'x', input: null, attempt: 0, runAt: 0 })
  expect((await queue.claim(1000, 500, 10)).map((j) => j.attempt)).toEqual([1])
  expect(await queue.claim(1400, 500, 10)).toEqual([])
  expect((await queue.claim(1500, 500, 10)).map((j) => j.attempt)).toEqual([2])
})

test('the runner runs jobs, retries with backoff (J003), and sets dead ones aside (J004)', async () => {
  vi.useFakeTimers()
  try {
    const codes: string[] = []
    const ran: string[] = []
    const queue = memoryQueue()
    const jobs = defineJobs(
      {
        welcome: job<{ to: string }>({
          run: ({ input, ctx }) => void ran.push(`welcome ${input.to} ${typeof ctx}`),
        }),
        flaky: {
          retries: 2,
          backoff: () => 1000,
          run: ({ attempt }) => {
            ran.push(`flaky ${attempt}`)
            throw new Error('down')
          },
        },
      },
      { queue, poll: 100 },
    )
    const stop = startJobs(jobs, deps(codes))
    await jobs.welcome.enqueue({ to: 'ann' })
    await jobs.flaky.enqueue()
    await vi.advanceTimersByTimeAsync(10)
    expect(ran).toEqual(['welcome ann object', 'flaky 1'])
    expect(codes).toEqual(['J003'])
    await vi.advanceTimersByTimeAsync(2500)
    expect(ran.slice(2)).toEqual(['flaky 2', 'flaky 3'])
    expect(codes).toEqual(['J003', 'J003', 'J004'])
    expect(queue.size()).toBe(0)
    expect(queue.dead.map((d) => [d.name, d.attempt, d.error.split('\n')[0]])).toEqual([
      ['flaky', 3, 'out of retries after 3 attempts: Error: down'],
    ])
    await stop()
  } finally {
    vi.useRealTimers()
  }
})

test('a job no definition names is dead; stopping waits for running jobs', async () => {
  const codes: string[] = []
  const queue = memoryQueue()
  let finish!: () => void
  const jobs = defineJobs(
    {
      slow: {
        run: () =>
          new Promise<void>((ok) => {
            finish = ok
          }),
      },
    },
    { queue },
  )
  await queue.push({
    id: 'gone',
    name: 'renamed',
    input: null,
    attempt: 0,
    runAt: 0,
  } satisfies QueuedJob)
  await jobs.slow.enqueue()
  const stop = startJobs(jobs, deps(codes))
  await vi.waitFor(() => expect(codes).toEqual(['J004']))
  let stopped = false
  const done = stop().then(() => (stopped = true))
  await Promise.resolve()
  expect(stopped).toBe(false)
  finish()
  await done
  expect(queue.size()).toBe(0)
  expect(jobsState(jobs)?.queue).toBe(queue)
})
