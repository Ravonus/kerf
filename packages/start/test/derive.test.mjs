// What a page's HTML says about itself (research 20 §10): pure functions, so each hard case is one line.
import { cleanText, decode, deployUrl, descriptionProblem, pageText, truncate } from '../src/derive.mjs'

const P = 'A page that says what it is in a whole sentence, at a good length.'

describe('pageText', () => {
  test('the h1 and the first prose after it', () => {
    expect(pageText(`<main><h1>Lists</h1><p>${P}</p><p>Not this one, which is also long enough to be a description.</p></main>`)).toEqual({ title: 'Lists', description: P })
  })
  test('reads <main>: a layout header and footer never speak for the page', () => {
    expect(pageText(`<header><h1>Site</h1><p>${P}</p></header><main><h1>Page</h1><p>The page itself says this, at a good length here.</p></main><footer><p>${P}</p></footer>`)).toEqual({ title: 'Page', description: 'The page itself says this, at a good length here.' })
  })
  test('bullets, code, tables, navigation and hidden text are skipped', () => {
    const noise = `<ul><li>${P}</li></ul><pre>${P}</pre><table><tr><td><p>${P}</p></td></tr></table><nav><p>${P}</p></nav><div hidden><p>${P}</p></div><div aria-hidden="true"><p>${P}</p></div><details><p>${P}</p></details><svg><text>${P}</text></svg>`
    expect(pageText(`<h1>T</h1>${noise}<p>And this is the first real paragraph of the page.</p>`).description).toBe('And this is the first real paragraph of the page.')
  })
  test('a crumb before the h1, and a paragraph of code, are not a description', () => {
    expect(pageText(`<p>This long paragraph comes before the heading of the page.</p><h1>T</h1><p>xs.map(x =&gt; &lt;Row key={x.id} /&gt;) in a list, at a long enough length.</p>`)).toEqual({ title: 'T' })
  })
  test('no h1: the first smaller heading', () => {
    expect(pageText('<h3>Card title</h3><h2>Later</h2>').title).toBe('Card title')
  })
  test('hydration markers, nested tags and entities come out as text', () => {
    expect(pageText('<h1><!--[-->Salt <em>&amp;</em> Co<!--]--></h1><p>Salt <a href="/x">&amp; pepper</a> <code>rub</code>, it&#39;s all in the one long sentence.</p>')).toEqual({ title: 'Salt & Co', description: "Salt & pepper rub, it's all in the one long sentence." })
  })
  test('an element that nests in itself is skipped whole', () => {
    expect(pageText(`<ul><li><ul><li>x</li></ul>${P}</li></ul><p>${P}</p>`).description).toBe(P)
  })
  test('an attribute holding `>` does not end the tag', () => {
    expect(pageText('<h1 title="a>b">Title</h1>').title).toBe('Title')
  })
  test('nothing to say', () => {
    expect(pageText('<div>hello</div>')).toEqual({})
  })
})

describe('truncate', () => {
  test('whole sentences when they fit', () => {
    const a = 'First sentence is here and it runs for a good while, past a third of the limit.'
    expect(truncate(`${a} ${'Second '.repeat(30)}end.`)).toBe(a)
  })
  test('an abbreviation is not the end of a sentence', () => {
    const t = `${'Word '.repeat(10)}such as e.g. this one. ${'More '.repeat(30)}`
    expect(truncate(t, 80)).toMatch(/this one\.$/)
  })
  test('with no sentence, whole words and an ellipsis', () => {
    const out = truncate('word '.repeat(60))
    expect(out.length).toBeLessThanOrEqual(155)
    expect(out).toMatch(/word…$/)
  })
  test('short text is left alone', () => {
    expect(truncate('Short.')).toBe('Short.')
  })
})

test('cleanText removes a list marker and the space before punctuation, not the dot of `.map`', () => {
  expect(cleanText('- 1. a  b .')).toBe('a b.')
  expect(cleanText('Works with .map here')).toBe('Works with .map here')
  expect(decode('&#x27;&#39;&amp;lt;&unknown;')).toBe("''&lt;&unknown;")
})

describe('descriptionProblem: the two real site bugs, and honest prose', () => {
  test.each([
    ['- xs.map(x = <Row key={x.id} … / ) in JSX is a keyed list.', /list marker/],
    ['1. State is a box. Read and write .value . Everywhere, JSX included.', /list marker/],
    ['State is a box. Read and write .value . Everywhere, JSX included.', /space before punctuation/],
    ['Use items.map(x => x.id) to render.', /code or markup/],
    ['the specimen markup exactly, then the rest of it follows', /lower case/],
    ['This runs on for more than one hundred characters and then is simply cut off right in the middle of what it was about to', /mid-sentence/],
  ])('%s', (text, why) => expect(descriptionProblem(text)).toMatch(why))
  test.each(['Three plans, billed monthly, and what each one includes.', "Lists work as they do in React: .map with a key, && and ternaries.", 'weft: a fast framework.', 'iPhone apps, built with weft.'])('%s', text => expect(descriptionProblem(text)).toBeUndefined())
})

test('deployUrl: config, then WEFT_SITE_URL, then what the host set; never a guess', () => {
  expect(deployUrl({ url: 'https://a.dev' }, { WEFT_SITE_URL: 'https://b.dev' })).toBe('https://a.dev')
  expect(deployUrl({}, { WEFT_SITE_URL: 'https://b.dev', VERCEL_URL: 'c.vercel.app' })).toBe('https://b.dev')
  expect(deployUrl({}, { VERCEL_URL: 'c.vercel.app' })).toBe('https://c.vercel.app')
  expect(deployUrl({}, { URL: 'https://d.netlify.app' })).toBe('https://d.netlify.app')
  expect(deployUrl({}, { FLY_APP_NAME: 'e' })).toBe('https://e.fly.dev')
  expect(deployUrl({}, {})).toBeUndefined()
})
