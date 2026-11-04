import {
  addressProblems,
  addTags,
  agoText,
  autoMap,
  badRows,
  cartCount,
  cartTotals,
  checkImport,
  confirmMatches,
  dirtyKeys,
  errorStep,
  httpsEndpoint,
  importRecords,
  inviteProblem,
  isCsvFile,
  isLastOwner,
  leaveGuard,
  meterParts,
  missingTargets,
  money,
  parseCsv,
  planPrice,
  prorate,
  usedWithinDay,
  type ImportTarget,
} from '../src/admin'

const iso = /^\d{4}-\d\d-\d\d$/
const targets: ImportTarget[] = [
  { id: 'name', label: 'Full name' },
  {
    id: 'email',
    label: 'Email',
    required: true,
    aliases: ['e-mail', 'mail'],
    check: (v) => (/@.+\./.test(v) ? undefined : 'Not a valid email'),
  },
  {
    id: 'start',
    label: 'Start date',
    aliases: ['start'],
    check: (v) => (iso.test(v) ? undefined : 'Use YYYY-MM-DD'),
  },
]

describe('parseCsv', () => {
  test('headers, rows, trimming and CRLF', () => {
    expect(parseCsv('Name, Email\r\nAda , ada@x.dev\r\n')).toEqual({
      headers: ['Name', 'Email'],
      rows: [['Ada', 'ada@x.dev']],
      problem: undefined,
    })
  })
  test('quotes: delimiters, doubled quotes and line breaks inside', () => {
    const t = parseCsv('a,b\n"x, y","he said ""hi"""\n"two\nlines",z')
    expect(t.rows).toEqual([
      ['x, y', 'he said "hi"'],
      ['two\nlines', 'z'],
    ])
  })
  test('a BOM goes, blank lines go, short rows pad, long rows trim to the header', () => {
    expect(parseCsv('﻿a,b\n\n1\n1,2,3\n').rows).toEqual([
      ['1', ''],
      ['1', '2'],
    ])
  })
  test('finds semicolons and tabs; an explicit delimiter wins', () => {
    expect(parseCsv('a;b\n1;2').rows).toEqual([['1', '2']])
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([['1', '2']])
    expect(parseCsv('a;b,c\n1;2,3', ';').headers).toEqual(['a', 'b,c'])
  })
  test('reports an open quote and an empty file', () => {
    expect(parseCsv('a\n"oops').problem).toMatch(/never closes/)
    expect(parseCsv('').problem).toMatch(/empty/)
  })
})

test('isCsvFile by name or type', () => {
  expect(isCsvFile('People.CSV')).toBe(true)
  expect(isCsvFile('x', 'text/csv')).toBe(true)
  expect(isCsvFile('people.xlsx', 'application/vnd.ms-excel')).toBe(false)
})

test('autoMap by id, label and alias, first claim wins, the rest skip', () => {
  expect(autoMap(['Full Name', 'E-mail', 'mail', 'Start', 'Team'], targets)).toEqual([
    'name',
    'email',
    'skip',
    'start',
    'skip',
  ])
})

describe('import validation', () => {
  const rows = [
    ['Ada', 'ada@x.dev', '2026-11-03'],
    ['Grace', 'grace@acme', '2026-11-03'],
    ['Alan', 'alan@x.dev', '11/10/2026'],
    ['Kat', '', '2026-11-17'],
  ]
  const map = ['name', 'email', 'start']
  test('per cell, in the server shape', () => {
    const issues = checkImport(rows, map, targets)
    expect(issues).toEqual([
      { row: 1, path: 'email', message: 'Not a valid email' },
      { row: 2, path: 'start', message: 'Use YYYY-MM-DD' },
      { row: 3, path: 'email', message: 'Email is required' },
    ])
    expect(badRows(issues)).toBe(3)
    expect(importRecords(rows, map, issues)).toEqual([
      { name: 'Ada', email: 'ada@x.dev', start: '2026-11-03' },
    ])
  })
  test('an unmapped required target is one report, not one per row', () => {
    const skipped = ['name', 'skip', 'start']
    expect(missingTargets(skipped, targets).map((t) => t.id)).toEqual(['email'])
    expect(checkImport(rows, skipped, targets).filter((i) => i.path === 'email')).toEqual([])
    expect(importRecords(rows, skipped, [])[0]).toEqual({ name: 'Ada', start: '2026-11-03' })
  })
})

test('dirtyKeys compares by value, either way round', () => {
  expect(dirtyKeys({ a: 1, b: [1], c: 'x' }, { a: 1, b: [1], c: 'y', d: 2 })).toEqual(['c', 'd'])
})

describe('leaveGuard', () => {
  const link = (href: string) => {
    const a = document.body.appendChild(document.createElement('a'))
    a.setAttribute('href', href)
    a.addEventListener('click', (e) => e.preventDefault(), { once: true })
    return a
  }
  test('catches a link only while dirty, and passes fragments', () => {
    const seen: string[] = []
    const g = leaveGuard(document.body, { dirty: false, onAttempt: (h) => seen.push(h) })
    const away = link('/away')
    away.click()
    expect(seen).toEqual([])
    g.update({ dirty: true, onAttempt: (h) => seen.push(h) })
    link('#here').click()
    away.addEventListener('click', (e) => e.preventDefault(), { once: true })
    away.click()
    expect(seen).toEqual(['/away'])
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    g.destroy()
    document.body.innerHTML = ''
  })
})

describe('invites', () => {
  test('addTags splits on commas, space and semicolons, drops repeats', () => {
    expect(addTags(['a@x.dev'], 'a@x.dev, b@x.dev;c@x.dev\nb@x.dev')).toEqual({
      list: ['a@x.dev', 'b@x.dev', 'c@x.dev'],
      added: ['b@x.dev', 'c@x.dev'],
    })
  })
  test('one message per cause, bad addresses before seats', () => {
    expect(inviteProblem([], 3)).toMatch(/at least one/)
    expect(inviteProblem(['nope'], 3)).toBe("“nope” isn't a valid email. Remove or fix it.")
    expect(inviteProblem(['nope', 'nah', 'a@x.dev'], 3)).toMatch(/^2 addresses/)
    expect(inviteProblem(['a@x.dev', 'b@x.dev', 'c@x.dev', 'd@x.dev'], 3)).toBe(
      'You have 3 seats left. Remove 1, or add seats in Billing.',
    )
    expect(inviteProblem(['a@x.dev'], 1)).toBeUndefined()
  })
  test('the last owner is protected, a second owner lifts it', () => {
    const a = { id: 'a', role: 'owner' },
      b = { id: 'b', role: 'admin' }
    expect(isLastOwner([a, b], a)).toBe(true)
    expect(isLastOwner([a, b], b)).toBe(false)
    expect(isLastOwner([a, { id: 'c', role: 'owner' }], a)).toBe(false)
  })
})

test('meterParts: tones at 80 and 100, overage rescales the rail', () => {
  expect(meterParts(40, 100)).toEqual({ tone: undefined, percent: 40, fill: 40, over: 0, warn: 80 })
  expect(meterParts(80, 100).tone).toBe('caution')
  expect(meterParts(100, 100).tone).toBe('critical')
  const m = meterParts(125, 100)
  expect(m.tone).toBe('critical')
  expect(m).toMatchObject({ percent: 125, fill: 80, over: 20, warn: 64 })
})

test('proration: an upgrade pays the difference, a downgrade waits', () => {
  const free = { name: 'Team', price: 20 },
    big = { name: 'Scale', price: 60 }
  const up = prorate({ from: free, to: big, seats: 3, daysLeft: 15, periodDays: 30 })
  expect(up.due).toBe('today')
  expect(up.total).toBe(60)
  expect(up.lines[1]!.amount).toBe(-30)
  const down = prorate({ from: big, to: free, seats: 3, daysLeft: 15, periodDays: 30 })
  expect(down).toMatchObject({ due: 'next', total: 60 })
  expect(planPrice(25, 'year')).toBe(20)
  expect(planPrice(25, 'month')).toBe(25)
})

test('cart totals, with discount before tax', () => {
  const lines = [
    { id: 'a', name: 'A', price: 10, quantity: 2 },
    { id: 'b', name: 'B', price: 5, quantity: 1 },
  ]
  expect(cartCount(lines)).toBe(3)
  expect(cartTotals(lines, { shipping: 4, percentOff: 10, taxRate: 0.1 })).toEqual({
    subtotal: 25,
    discount: 2.5,
    shipping: 4,
    tax: 2.25,
    total: 28.75,
  })
})

test('per-country address rules: blanks and postal codes', () => {
  expect(addressProblems(null, 'US')).toMatchObject({
    line1: 'Enter a street address.',
    postalCode: 'Enter a zip code.',
  })
  const us = { country: 'US', lines: ['1 Main'], locality: 'SF', region: 'CA', postalCode: '123' }
  expect(addressProblems(us, 'US')).toEqual({ postalCode: 'A ZIP code is 5 digits, like 94107.' })
  expect(addressProblems({ ...us, postalCode: '94107' }, 'US')).toEqual({})
  expect(
    addressProblems(
      { country: 'DE', lines: ['Hauptstr. 1'], locality: 'Berlin', postalCode: '1011' },
      'DE',
    ).postalCode,
  ).toMatch(/PLZ/)
  expect(
    addressProblems(
      { country: 'GB', lines: ['1 High St'], locality: 'London', postalCode: 'SW1A 1AA' },
      'GB',
    ),
  ).toEqual({})
})

test('errorStep sends each order error back where it can be fixed', () => {
  expect(errorStep({ code: 'CARD_DECLINED', reason: 'x' })).toBe('payment')
  expect(errorStep({ code: 'OUT_OF_STOCK', sku: 'a' })).toBe('cart')
  expect(errorStep({ code: 'PRICE_CHANGED', total: 1 })).toBe('review')
})

test('small helpers', () => {
  expect(money(1234.5)).toBe('$1,234.50')
  expect(money(24)).toBe('$24')
  expect(agoText('2026-10-28T13:58:00Z', '2026-10-28T14:02:00Z')).toBe('4 min ago')
  expect(agoText('2026-10-28T09:02:00Z', '2026-10-28T14:02:00Z')).toBe('5 h ago')
  expect(agoText('2026-10-25T14:02:00Z', '2026-10-28T14:02:00Z')).toBe('3 d ago')
  expect(usedWithinDay('2026-10-28T13:58:00Z', '2026-10-28T14:02:00Z')).toBe(true)
  expect(usedWithinDay('2026-10-26T13:58:00Z', '2026-10-28T14:02:00Z')).toBe(false)
  expect(usedWithinDay(undefined, '2026-10-28T14:02:00Z')).toBe(false)
  expect(confirmMatches(' prod ', 'prod')).toBe(true)
  expect(confirmMatches('Prod', 'prod')).toBe(false)
  expect(httpsEndpoint('https://hooks.acme.dev/x')).toBe(true)
  expect(httpsEndpoint('http://hooks.acme.dev')).toBe(false)
  expect(httpsEndpoint('https://localhost')).toBe(false)
})
