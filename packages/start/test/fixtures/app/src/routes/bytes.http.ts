export function GET(request: Request) {
  if (new URL(request.url).searchParams.get('fixture') === 'fault')
    throw new Error('private fixture raw handler detail')
  const range = request.headers.get('range')
  return new Response(range ? '234' : '0123456789', {
    status: range ? 206 : 200,
    headers: {
      'content-type': 'application/json',
      'content-length': range ? '3' : '10',
      ...(range && { 'content-range': 'bytes 2-4/10' }),
      'cache-control': 'public, max-age=42',
      'x-frame-options': 'DENY',
    },
  })
}
