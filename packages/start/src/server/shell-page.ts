// Production documents are served from the release host. Dev can serve its own static shell.
import { shellDocument } from '../shell-document.mjs'
import type { HandlerOptions } from './types'

export function makeShellPage({ dev, assets, site }: HandlerOptions) {
  return (_url: URL, request: Request): Promise<Response> => {
    if (!dev || !assets?.entry) return Promise.resolve(new Response(null, { status: 404 }))
    const body =
      request.method === 'HEAD'
        ? null
        : shellDocument({
            entry: assets.entry,
            css: assets.css?.map(({ href }) => href),
            js: assets.js?.map(({ href }) => href),
            locale: site?.locale,
            dev: true,
          })
    return Promise.resolve(
      new Response(body, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      }),
    )
  }
}
