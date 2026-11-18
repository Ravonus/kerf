// The release artifact is independent of request URLs, loader data and application views.
import { esc } from '@kerf-js/core/markup'

export const SHELL_FILE = 'kerf-shell.html'

/** @param {{entry: string, css?: string[] | undefined, js?: string[] | undefined, locale?: string | undefined, dev?: boolean}} options */
export function shellDocument({ entry, css = [], js = [], locale = 'en', dev = false }) {
  const links = [
    ...[...new Set(css)].map((href) => `<link rel="stylesheet" href="${esc(href)}">`),
    ...[...new Set(js)].map((href) => `<link rel="modulepreload" href="${esc(href)}">`),
  ].join('\n')
  return `<!doctype html>
<html lang="${esc(locale.replace('_', '-'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${links}
${dev ? '<script type="module" src="/@vite/client"></script>' : ''}
<script type="module" src="${esc(entry)}"></script>
</head>
<body>
<div id="app"></div>
<p id="kerf-shell-pending" role="status">Loading…</p>
<noscript>This application requires JavaScript.</noscript>
</body>
</html>
`
}
