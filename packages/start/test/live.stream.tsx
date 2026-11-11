import { state, untrack, watch } from '@kerf/core'
import { flush, net, render, screen } from '@kerf/core/test'
import { stream, topic, tracked, type StandardSchemaV1 } from '@kerf/start'

type Price = { symbol?: string; price: number }

function createBrokenStream() {
  const numeric: StandardSchemaV1<unknown, number> = {
    '~standard': {
      version: 1,
      vendor: 't',
      validate: (v) =>
        typeof v === 'number' ? { value: v } : { issues: [{ message: 'not a number' }] },
    },
  }
  // oxlint-disable typescript/require-await -- `run` is an async generator whatever its body does
  const broken = stream(
    {
      $id: 'live.broken',
      message: numeric,
      async *run() {
        yield 'nope' as unknown as number
      },
    } /* oxlint-enable typescript/require-await */,
  )

  return broken
}

function createStreamFixtures(any: StandardSchemaV1<unknown>, typed: <T>() => StandardSchemaV1<T>) {
  const priceTopic = topic('prices', {
    key: any as StandardSchemaV1<unknown, string>,
    message: typed<Price>(),
  })
  const prices = stream({
    $id: 'live.prices',
    input: typed<{ symbols: string[] }>(),
    message: typed<Price>(),
    async *run({ input, signal, lastEventId }) {
      yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId })
    },
  })
  // oxlint-disable typescript/require-await -- `run` is an async generator whatever its body does
  const counter = stream(
    {
      $id: 'live.count',
      async *run({ lastEventId }) {
        let n = Number(lastEventId ?? 0)
        for (;;) {
          yield tracked(String(++n), n)
          if (n % 2 === 0) return
        }
      },
    } /* oxlint-enable typescript/require-await */,
  )
  // oxlint-disable typescript/require-await -- `run` is an async generator whatever its body does
  const secret = stream(
    {
      $id: 'live.secret',
      auth: 'user',
      async *run() {
        yield 'hidden'
      },
    } /* oxlint-enable typescript/require-await */,
  )
  // oxlint-disable typescript/require-await -- `run` is an async generator whatever its body does
  const once = stream(
    {
      $id: 'live.once',
      async *run() {
        yield 1
        yield 2
      },
    } /* oxlint-enable typescript/require-await */,
  )
  const broken = createBrokenStream()

  function Tick() {
    const tick = prices({ symbols: ['A'] })
    return (
      <p aria-label="tick">
        {tick.status.value}: {tick.value?.price ?? 'none'}
      </p>
    )
  }
  const tick = () => screen.getByLabelText('tick').textContent

  return { priceTopic, prices, counter, secret, once, broken, Tick, tick }
}

type StreamFixture = ReturnType<typeof createStreamFixtures>

function registerStreamSharingTests(fixture: StreamFixture) {
  const { Tick, tick, priceTopic, prices } = fixture
  test('topic → stream → box: messages update in place', async () => {
    render(Tick)
    await net.settle()
    await flush()
    await priceTopic.publish('A', { symbol: 'A', price: 1 })
    await vi.waitFor(() => expect(tick()).toBe('live: 1'))
    await expect(async () => {
      await priceTopic.publish('A', { symbol: 'A', price: 2 })
      await vi.waitFor(() => expect(tick()).toBe('live: 2'))
    }).toTouchAtMost(1)
  })

  test('a fold lives in the cache: a remount within `keep` finds its state', async () => {
    const show = state(true)
    function Board() {
      const board = prices(
        { symbols: ['A'] },
        {
          fold: (acc: number[], m: { price: number }) => [...acc, m.price],
          initial: [] as number[],
          keep: '30s',
        },
      )
      return <p aria-label="board">{board.value.join(',')}</p>
    }
    render(() => <div>{show.value ? <Board /> : null}</div>)
    await net.settle()
    await net.push(prices, { price: 1 })
    await net.push(prices, { price: 2 })
    show.value = false
    await flush()
    await net.push(prices, { price: 3 })
    show.value = true
    await flush()
    expect(screen.getByLabelText('board').textContent).toBe('1,2,3')
  })

  test('two folds over one key share one server subscription', async () => {
    function Both() {
      const sum = prices(
        { symbols: ['A'] },
        { fold: (a: number, m: { price: number }) => a + m.price, initial: 0 },
      )
      const max = prices(
        { symbols: ['A'] },
        { fold: (a: number, m: { price: number }) => Math.max(a, m.price), initial: 0 },
      )
      return (
        <p aria-label="both">
          {sum.value} {max.value}
        </p>
      )
    }
    render(Both)
    await net.settle()
    expect(await net.push(prices, { price: 2 })).toBe(1)
    await net.push(prices, { price: 3 })
    expect(screen.getByLabelText('both').textContent).toBe('5 3')
  })
}

function registerStreamResumeTests(fixture: StreamFixture) {
  const { prices, priceTopic, once, counter } = fixture
  test('resume: a reconnect gets what the ring still has, exactly once', async () => {
    function Log() {
      const log = prices(
        { symbols: ['A'] },
        {
          fold: (acc: number[], m: { price: number }) => [...acc, m.price],
          initial: [] as number[],
        },
      )
      return <p aria-label="log">{log.value.join(',')}</p>
    }
    render(Log)
    await net.settle()
    await flush()
    await priceTopic.publish('A', { price: 1 })
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1'))
    await net.offline()
    await priceTopic.publish('A', { price: 2 })
    await priceTopic.publish('A', { price: 3 })
    await net.online()
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1,2,3'))
    await priceTopic.publish('A', { price: 4 })
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1,2,3,4'))
  })

  test('a finished stream reports done and is not rerun by a reconnect', async () => {
    function One() {
      const s = once(undefined as void, { fold: (a: number, m: number) => a + m, initial: 0 })
      return (
        <p aria-label="once">
          {s.status.value}: {s.value}
        </p>
      )
    }
    render(One)
    await vi.waitFor(() => expect(screen.getByLabelText('once').textContent).toBe('done: 3'))
  })

  test('`tracked` ids come back as lastEventId', async () => {
    function Count() {
      const s = counter(undefined as void)
      return (
        <p aria-label="count">
          {s.status.value} {s.value}
        </p>
      )
    }
    render(Count)
    await vi.waitFor(() => expect(screen.getByLabelText('count').textContent).toBe('done 2'))
  })
}

function registerStreamErrorTests(fixture: StreamFixture) {
  const { secret, broken, prices } = fixture
  test("auth: 'user' with no session fails with A002", async () => {
    let seen: unknown
    function S() {
      const s = secret(undefined as void)
      watch(
        () => s.error,
        (e) => {
          seen = e
        },
      )
      return <p aria-label="err">{s.error ? (s.error as Error).message : 'none'}</p>
    }
    net.context({ user: null })
    render(S)
    await vi.waitFor(() => expect(screen.getByLabelText('err').textContent).toContain('A002'))
    expect(seen).toBeTruthy()
  })

  test('a message its schema rejects is C002 in dev', async () => {
    function B() {
      const s = broken(undefined as void)
      return <p aria-label="c002">{s.error ? (s.error as Error).message : 'none'}</p>
    }
    render(B)
    await vi.waitFor(() => expect(screen.getByLabelText('c002').textContent).toContain('C002'))
  })

  test('W051: a stream outside an owner throws', () => {
    expect(() => untrack(() => prices({ symbols: ['A'] }))).toThrow(/W051/)
  })

  test('net.push needs a connection, and says so', () => {
    expect(() => net.push(prices, {})).toThrow(/no realtime connection/)
  })
}

export function registerLiveStreamTests(
  any: StandardSchemaV1<unknown>,
  typed: <T>() => StandardSchemaV1<T>,
) {
  const fixture = createStreamFixtures(any, typed)
  describe('stream', () => {
    registerStreamSharingTests(fixture)
    registerStreamResumeTests(fixture)
    registerStreamErrorTests(fixture)
  })
}
