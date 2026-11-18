import type { RequestHook } from '@kerf-js/start/server'

const markup = '<b id="peer-markup">Peer injection</b><script>window.peerExecuted=true</script>'

export const handle: RequestHook = async (request, next) => {
  const url = new URL(request.url)
  const attack = url.searchParams.get('attack')
  const response = await next()
  if (!attack || request.headers.get('x-fixture-peer') !== 'b') return response
  if (attack === 'html') return new Response(markup, { headers: { 'content-type': 'text/html' } })
  if (attack === 'transport-redirect') return Response.redirect('https://foreign.invalid/')
  const frames = (await response.text())
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line))
  const first = frames[0]
  switch (attack) {
    case 'legacy':
      frames[0] = { m: [{ s: 1, h: markup }], h: markup, b: markup }
      break
    case 'head':
      first.head = markup
      break
    case 'raw':
      return new Response(markup + '\n' + JSON.stringify(first) + '\n', response)
    case 'version':
      first.v = 2
      break
    case 'build':
      first.build = 'other-release'
      break
    case 'params':
      first.params = { id: markup }
      break
    case 'field':
      first.values[1].html = markup
      break
    case 'type':
      first.values[1].name = { text: markup }
      break
    case 'url':
      first.values[1].link = 'javascript:window.peerExecuted=true'
      break
    case 'oversize':
      first.values[1].name = markup.repeat(10_000)
      break
    case 'redirect-id':
      first.id = '//foreign.invalid/'
      break
    case 'redirect-url':
      first.url = 'https://foreign.invalid/'
      break
    case 'error-message':
      first.message = markup
      break
    case 'deferred':
      frames[1].value.html = markup
      break
    case 'truncated':
      frames.pop()
      break
    case 'text':
      first.values[1].name = markup
      break
  }
  return new Response(frames.map((frame) => JSON.stringify(frame) + '\n').join(''), response)
}
