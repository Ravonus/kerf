import { spawnSync } from 'node:child_process'

const refused = (message) => Object.assign(new Error(message), { code: 'E_REFUSED' })

/** The host's CLI: on PATH, else through npx for the ones on npm. */
export function cliFor(
  name,
  {
    which = (cmd) =>
      spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' })
        .status === 0,
  } = {},
) {
  const npm = { netlify: 'netlify-cli', vercel: 'vercel', wrangler: 'wrangler' }
  for (const cmd of name === 'flyctl' ? ['flyctl', 'fly'] : [name]) if (which(cmd)) return [cmd]
  if (npm[name]) return ['npx', '--yes', npm[name]]
  throw refused(
    `\`${name}\` isn't installed: ${name === 'flyctl' ? 'https://fly.io/docs/flyctl/install/' : `npm install -g ${npm[name] ?? name}`}`,
  )
}
