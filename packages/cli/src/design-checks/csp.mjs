import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOST_HEADERS, cspDirectives, inlineAllowed, scriptsRun } from './rules.mjs'

export function checkCsp(root, files, reporter) {
  // -- a CSP against the inlined sheets --
  const config = ['ts', 'mts', 'js', 'mjs', 'json', 'yaml', 'yml']
    .map((x) => join(root, `kerf.config.${x}`))
    .find(existsSync)
  const configText = config ? readFileSync(config, 'utf8') : ''
  if (!/inlineCss['"]?\s*:\s*false/.test(configText)) {
    const hosting = HOST_HEADERS.filter(
      (rel) => existsSync(join(root, rel)) && !files.some((f) => f.rel === rel),
    ).map((rel) => ({ rel, text: readFileSync(join(root, rel), 'utf8') }))
    for (const f of [
      ...files,
      ...hosting,
      ...(config
        ? [
            {
              rel: config
                .slice(root.length + 1)
                .split('\\')
                .join('/'),
              text: configText,
            },
          ]
        : []),
    ]) {
      const m = /content-security-policy(?!-report-only)/i.exec(f.text)
      if (!m) continue
      const policy = cspDirectives(f.text)
      const report = reporter(f)
      if (!inlineAllowed(policy, 'style-src-elem', 'style-src', 'default-src'))
        report(
          'D012',
          m.index,
          m.index + m[0].length,
          "This Content-Security-Policy blocks inline styles, and a build inlines the first paint's CSS: the page shows unstyled until its sheets load.",
          { description: 'Set site: { inlineCss: false }', safe: false, text: m[0] },
        )
      else if (!scriptsRun(policy))
        report(
          'D012',
          m.index,
          m.index + m[0].length,
          "This Content-Security-Policy refuses inline scripts and the client entry, so a page's deferred sheets never switch on: hover, focus and every rule its first paint left out stay missing.",
          { description: 'Set site: { inlineCss: false }', safe: false, text: m[0] },
        )
      else if (!inlineAllowed(policy, 'script-src-elem', 'script-src', 'default-src'))
        report.warning(
          'D012',
          m.index,
          m.index + m[0].length,
          "This Content-Security-Policy refuses inline scripts, so a page's deferred sheets switch on only once the client entry has run: rules its first paint left out wait for it.",
          { description: 'Set site: { inlineCss: false }', safe: false, text: m[0] },
        )
    }
  }
}
