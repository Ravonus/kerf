// Byte ranges for built video and audio. Nitro's static handler has none and runs before any middleware, and Safari
// won't play a video without them, so this Nitro plugin answers ranged requests for those files in front of the app.
export default nitro => {
  const app = nitro.fetch
  nitro.fetch = async (request, ...rest) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
    const id = range && new URL(request.url).pathname
    if (!id?.startsWith('/assets/')) return app(request, ...rest)
    // Lazily: the prerender step builds this file without Nitro's asset table.
    const { getAsset, readAsset } = await import('#nitro/virtual/public-assets')
    const asset = getAsset(id)
    if (!/^(video|audio)\//.test(asset?.type ?? '')) return app(request, ...rest)
    const bytes = Buffer.from(await readAsset(id))
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : Infinity, bytes.length - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}` } })
    return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { 'content-type': asset.type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'cache-control': 'public, max-age=31536000, immutable' } })
  }
}
