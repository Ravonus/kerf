// The box every agent, and every build of agent-written code, runs in: a scrubbed environment, a fresh HOME and a kernel
// (Seatbelt) profile. It is the same for every stack. `probe` in run.mjs proves what it blocks.
//
// HOME is fake, so there is no ~/.claude, no CLAUDE.md, no memory, no ~/.npmrc and no git identity to find. The one thing
// linked into it is the login keychain, which is where `claude` keeps its sign-in: the keychain is read, never copied.
import { mkdirSync, symlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { claudeBin, hostHome, nodeBin, projects, realHome, registryPort } from './paths.mjs'
import { randomBytes } from 'node:crypto'

export function newBox() {
  const root = join(projects, randomBytes(4).toString('hex'))
  const box = { root, app: join(root, 'app'), home: join(root, 'home'), tmp: join(root, 'tmp') }
  for (const d of [box.home, box.tmp, join(box.home, 'Library/Preferences')])
    mkdirSync(d, { recursive: true })
  symlinkSync(join(realHome, 'Library/Keychains'), join(box.home, 'Library/Keychains'))
  const list = join(realHome, 'Library/Preferences/com.apple.security.plist')
  if (existsSync(list))
    symlinkSync(list, join(box.home, 'Library/Preferences/com.apple.security.plist'))
  return box
}

/** Each parent of `path` as metadata only, so a resolver can walk to it without being able to list what's beside it. */
const ancestors = (path) => {
  const out = []
  for (let p = dirname(path); p !== '/' && p !== '.'; p = dirname(p)) out.push(p)
  return out
}

/** The Seatbelt profile. Later rules win, so each block denies wide and then allows narrow. */
export function profile(box) {
  const root = box.root
  const readable = [dirname(nodeBin), dirname(claudeBin), join(realHome, 'Library/Keychains')]
  const q = (s) => JSON.stringify(s)
  return `(version 1)
(allow default)
(deny file-read* (subpath ${q(realHome)}) (subpath ${q(hostHome)}) (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/Volumes"))
(allow file-read-metadata ${[...new Set([...ancestors(claudeBin), ...ancestors(nodeBin), ...ancestors(root), realHome])].map((p) => `(literal ${q(p)})`).join(' ')})
(allow file-read* ${readable.map((p) => `(subpath ${q(p)})`).join(' ')} (literal ${q(join(realHome, 'Library/Preferences/com.apple.security.plist'))}) (subpath ${q(root)}))
(deny file-write* (subpath "/"))
(allow file-write* (subpath ${q(root)}) (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (regex #"^/dev/(ttys|fd/|ptmx)"))
(deny process-exec (literal "/bin/ps") (literal "/usr/bin/pgrep") (literal "/usr/bin/pkill") (literal "/usr/sbin/lsof") (literal "/usr/bin/top") (literal "/usr/bin/mdfind") (literal "/usr/bin/mdls") (literal "/usr/bin/ssh") (literal "/usr/bin/scp") (literal "/usr/bin/sftp"))
(deny network-outbound (remote tcp "localhost:5432") (remote tcp "localhost:3306") (remote tcp "localhost:6379") (remote tcp "localhost:9222"))
`
}

export function env(box, extra = {}) {
  return {
    HOME: box.home,
    USER: process.env.USER,
    LOGNAME: process.env.USER,
    TMPDIR: `${box.tmp}/`,
    CLAUDE_CODE_TMPDIR: box.tmp,
    LANG: 'en_US.UTF-8',
    SHELL: '/bin/zsh',
    PATH: [nodeBin, '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    NO_COLOR: '1',
    CI: '1',
    NPM_CONFIG_REGISTRY: `http://localhost:${registryPort}/`,
    NEXT_TELEMETRY_DISABLED: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ...extra,
  }
}

/** `[command, args]` for running something inside `box`. */
export const boxed = (box, cmd, args = []) => [
  '/usr/bin/sandbox-exec',
  ['-p', profile(box), cmd, ...args],
]
