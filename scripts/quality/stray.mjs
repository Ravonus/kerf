// What must never ship in a tarball. Used by release.mjs on the real tarballs and by `npm run check` on `npm pack --dry-run`.
export const STRAY = [[/(^|\/)(test|tests|__tests__|fixtures?)\//, 'a test file'], [/\.(test|spec)\.[cm]?[jt]sx?$/, 'a test file'], [/(^|\/)vitest\.config/, 'test config'], [/(^|\/)tsconfig[\w.-]*\.json$/, 'build config'], [/(^|\/)\.env(\.|$)/, 'an env file'], [/(^|\/)netlify\.env$/, 'an env file'], [/(^|\/)\.neon$/, 'a credentials file'], [/(^|\/)\.mcp\.json$/, 'a credentials file'], [/(^|\/)\.npmrc$/, 'a credentials file'], [/\.(pem|key|p12)$/, 'a key'], [/(^|\/)\.DS_Store$|(^|\/)\._/, 'OS clutter'], [/(^|\/)package-lock\.json$/, 'a lockfile'], [/\.tgz$/, 'a tarball']]
export const SECRET = /(sk_live_[0-9a-zA-Z]{8}|AKIA[0-9A-Z]{16}|npm_[0-9a-zA-Z]{36}|ghp_[0-9a-zA-Z]{36}|-----BEGIN [A-Z ]*PRIVATE KEY)/

/** Why `file`, a path inside a tarball, shouldn't be in it. Undefined when it's fine. */
export const strayReason = file => STRAY.find(([re]) => re.test(file))?.[1]
