// The logic under DataGrid, the palette, mentions, code and the editors.
import { aggregate, fuzzy, matchStrength, groupRows, indented, jsonProblem, marked, markdownToHtml, mentionToken, moved, pageList, parseMentions, parseTSV, findTrigger, pivotTable, rankCommands, safeUrl, sanitizeHtml, serializeMentions, shiftMarks, toCSV, tokenize, toTSV, treeRows, hideRule } from '../src'

describe('pageList', () => {
  test('keeps the ends and the neighbours', () => {
    expect(pageList(5, 100)).toEqual([1, 'gap', 4, 5, 6, 'gap', 100])
    expect(pageList(1, 3)).toEqual([1, 2, 3])
  })
})

describe('table text', () => {
  test('TSV round-trips, and a own breaks stay in the cell', () => {
    expect(parseTSV(toTSV([['a', 'b'], ['c', 'd']]))).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseTSV(toTSV([['a\tb', 'c\nd']]))).toEqual([['a b', 'c d']])
  })
  test('CSV defuses formulas', () => {
    expect(toCSV(['=SUM(A1)', '@x', 'plain', -2], [])).toBe(`"'=SUM(A1)","'@x",plain,-2`)
    expect(toCSV(['h'], [['a,b'], ['c"d']])).toBe('h\n"a,b"\n"c""d"')
  })
  test('aggregates', () => {
    expect(aggregate('sum', [1, 2, 3])).toBe(6)
    expect(aggregate('avg', [2, 4])).toBe(3)
    expect(aggregate('min', [2, 4])).toBe(2)
    expect(aggregate('max', [2, 4])).toBe(4)
    expect(aggregate('count', [2, 4])).toBe(2)
  })
  test('moved shifts one id', () => {
    expect(moved(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })
})

test('hideRule scopes to one table', () => {
  const css = hideRule('t1', ['team'])
  expect(css).toContain('t1')
  expect(css).toContain('team')
  expect(css).toContain('display')
})

describe('palette ranking', () => {
  const items = [{ label: 'New project', group: 'Create' }, { label: 'Open settings', group: 'Go', keywords: ['preferences'] }]
  test('letters in order; word starts win', () => {
    expect(fuzzy('np', 'New project')!.hits).toEqual([0, 4])
    expect(fuzzy('zz', 'New project')).toBeNull()
    expect(fuzzy('n', 'New')!.score).toBeGreaterThan(fuzzy('e', 'New')!.score)
  })
  test('groups in order, keywords answer', () => {
    expect(rankCommands(items, '').map(g => g.name)).toEqual(['Create', 'Go'])
    expect(rankCommands(items, 'prefer')[0].rows[0].item.label).toBe('Open settings')
  })
  test('a match at a word start or as written beats scattered letters, which show only when nothing better does', () => {
    const regions = ['eu-west', 'us-east', 'ap-south', 'us-west', 'eu-north'].map(label => ({ label }))
    const labels = (q: string) => rankCommands(regions, q).flatMap(g => g.rows.map(r => r.item.label))
    expect(labels('us')).toEqual(['us-east', 'us-west'])
    expect(labels('west')).toEqual(['eu-west', 'us-west'])
    expect(labels('uw')).toEqual(['us-west']) // initials
    expect(labels('est')).toEqual(['eu-west', 'us-west']) // inside a word as written; us-east's e…s…t is dropped
    expect(labels('ewt')).toEqual(['eu-west']) // nothing better: scattered letters
    expect(matchStrength('us', 'eu-west')!.tier).toBe(0)
    expect(matchStrength('us', 'us-east')).toEqual({ tier: 3, score: 100, hits: [0, 1] })
    expect(matchStrength('np', 'New project')!.tier).toBe(2)
    expect(matchStrength('new proj', 'New project')!.tier).toBe(3)
    expect(matchStrength('set', 'Open settings')!.hits).toEqual([5, 6, 7])
  })
  test('marked alternates runs', () => {
    expect(marked('abc', [1])).toEqual([{ text: 'a', hit: false }, { text: 'b', hit: true }, { text: 'c', hit: false }])
  })
})

describe('mentions', () => {
  test('parse and serialize are inverses', () => {
    const v = 'Hi @[Ada Lovelace](user:ada), see #[ops](channel:7)'
    const { text, marks } = parseMentions(v)
    expect(text).toBe('Hi @Ada Lovelace, see #ops')
    expect(serializeMentions(text, marks)).toBe(v)
  })
  test('an edit before shifts a mark; one inside drops it', () => {
    const { text, marks } = parseMentions('a @[B](user:b) c')
    expect(shiftMarks(marks, text, `x${text}`)[0].start).toBe(marks[0].start + 1)
    expect(shiftMarks(marks, text, 'a @ c')).toEqual([])
  })
  test('a trigger only at a word start, and not inside a mark', () => {
    expect(findTrigger('hi @ad', 6, ['@'])).toEqual({ trigger: '@', query: 'ad', at: 3 })
    expect(findTrigger('me@ad', 5, ['@'])).toBeUndefined()
    expect(findTrigger('@Ada', 4, ['@'], [{ start: 0, end: 4, token: '' }])).toBeUndefined()
  })
  test('a label cannot break the token', () => {
    expect(mentionToken('@', { id: 'x', label: 'a]b[c' })).toBe('@[abc](user:x)')
  })
})

describe('code', () => {
  test('a caret takes one indent; a selection moves lines', () => {
    expect(indented('ab', 1, 1, 2)).toMatchObject({ from: 1, to: 1, insert: '  ', start: 3 })
    expect(indented('a\nb', 0, 3, 2)).toMatchObject({ from: 0, to: 3, insert: '  a\n  b' })
    expect(indented('  a', 3, 3, 2, true)).toMatchObject({ insert: 'a', start: 1 })
  })
  test('tokens: JSON keys stay plain', () => {
    expect(tokenize('{"a": "b", "c": 1}', 'json').map(s => s.kind)).toEqual(['string', 'number'])
    expect(tokenize('const a = 1 // x').map(s => s.kind)).toEqual(['keyword', 'number', 'comment'])
  })
  test('a JSON problem names its line', () => {
    expect(jsonProblem('{"a":1}')).toBeNull()
    expect(jsonProblem(`{\n"a": 1,\n"long enough for the engine to name a position": 2,\n"b":\n}`)!.line).toBe(5)
    expect(jsonProblem('{"a":}')).toEqual({ line: 1, message: "Unexpected token '}'" })
  })
})

describe('sanitizeHtml', () => {
  test.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror=alert(1)>', 'onerror'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<a href="  java\tscript:alert(1)">x</a>', 'script:'],
    ['<a href="data:text/html,x">x</a>', 'data:'],
    ['<svg onload=alert(1)></svg>', 'onload'],
    ['<iframe src="//x"></iframe>', 'iframe'],
    ['<p style="background:url(x)">x</p>', 'style'],
    ['<p onclick="x()">x</p>', 'onclick'],
    ['<a href="vbscript:x">x</a>', 'vbscript'],
  ])('%s', (html, word) => {
    expect(sanitizeHtml(html).toLowerCase()).not.toContain(`${word}`.toLowerCase() === 'script' ? '<script' : word.toLowerCase())
  })
  test('keeps the allow-list', () => {
    expect(sanitizeHtml('<p>a <strong>b</strong> <em>c</em></p>')).toBe('<p>a <strong>b</strong> <em>c</em></p>')
    expect(sanitizeHtml('<a href="https://x.dev">x</a>')).toContain('href="https://x.dev"')
  })
  test('keeps entities and mentions', () => {
    expect(sanitizeHtml('<p>a&nbsp;b</p>')).toBe('<p>a&nbsp;b</p>')
    expect(sanitizeHtml('<span data-mention title="Ada">@Ada</span>')).toContain('role="img"')
  })
  test('safeUrl refuses protocol tricks', () => {
    for (const u of ['javascript:x', 'JaVaScRiPt:x', ' javascript:x', '//evil.dev', '/\\evil.dev', '\\\\evil.dev']) expect(safeUrl(u), u).toBeFalsy()
    for (const u of ['https://x.dev', 'mailto:a@x.dev', '/a', '#b']) expect(safeUrl(u), u).toBeTruthy()
  })
})

describe('markdownToHtml', () => {
  test('headings, lists, code, links', () => {
    const h = markdownToHtml('# A\n\n- b\n- c\n\n`d` **e** [f](https://x.dev)')
    expect(h).toContain('<li>b</li>')
    expect(h).toContain('>d</code>')
    expect(h).toContain('<strong>e</strong>')
    expect(h).toContain('href="https://x.dev"')
  })
  test('raw HTML is text, and a bad link is not a link', () => {
    expect(markdownToHtml('<script>x</script>')).not.toContain('<script')
    expect(markdownToHtml('[x](javascript:alert(1))')).not.toContain('href="javascript')
  })
  test('emphasis does not reach into an href', () => {
    expect(markdownToHtml('[a](https://x.dev/_b_c_)')).toContain('href="https://x.dev/_b_c_"')
  })
})

describe('tree and group rows', () => {
  const rows = [{ id: 'a', t: 'x', kids: [{ id: 'b', t: 'x' }] }, { id: 'c', t: 'y' }]
  test('a closed branch hides its kids; a query opens the path to a hit', () => {
    const src = { key: (r: any) => r.id, kids: (r: any) => r.kids, branch: (r: any) => !!r.kids, open: () => false }
    expect(treeRows(rows, src).map(e => e.key)).toEqual(['a', 'c'])
    const open = treeRows(rows, { ...src, open: () => true })
    expect(open.map(e => [e.key, e.level])).toEqual([['a', 1], ['b', 2], ['c', 1]])
    expect(open[0]).toMatchObject({ branch: true, size: 2, pos: 1 })
  })
  test('groupRows keeps first-seen order', () => {
    expect([...groupRows(rows, (r: any) => r.t).keys()]).toEqual(['x', 'y'])
  })
  test('pivotTable totals both ways', () => {
    const p: any = pivotTable([{ r: 'a', c: 'x', v: 2 }, { r: 'a', c: 'y', v: 3 }], (o: any) => o.r, (o: any) => o.c, (o: any) => o.v)
    expect(JSON.stringify(p)).toContain('5')
  })
})
