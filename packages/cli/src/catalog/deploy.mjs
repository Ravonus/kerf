/** deploy diagnostic entries in catalog order. */
export const deploy = [
  // Deploy (research 46): what a host can run, the files and env a deploy needs, CDN and media setup. `weft check` reports
  // them for `deploy.target` (or the host `--preset` names), `weft deploy` before it builds, `weft doctor` for every host.
  {
    code: 'E001',
    severity: 'error',
    by: 'cli',
    catches:
      "A `channel`, `sharedState` or `realtime({ share })` on a deploy target that can't hold a WebSocket (Netlify, Vercel, AWS Lambda): the page loads and never connects (at runtime: R024)",
    fix: "`deploy: { target: 'fly' }` or `'render'`, `'cloudflare'` (Durable Objects), or the split: pages here, realtime on a server (`weft docs deploy`)",
  },
  {
    code: 'E002',
    severity: 'error',
    by: 'cli',
    catches:
      'Something that needs a process between requests on a target that keeps none: a `required` live query (R013), or a `remote()` sidecar',
    fix: "A server host (`fly`, `render`); for a feed, `weft db listen` on one with `listener: 'external'`; for a sidecar, deploy it on its own with `rust.services.<name>.external: true`",
  },
  {
    code: 'E003',
    severity: 'error',
    by: 'cli',
    catches:
      'A SQLite file or media uploads on local disk, on a target whose disk is gone after a request or a deploy, or on a server host with no volume or disk configured (a warning in `weft deploy hosts`)',
    fix: '`deploy.fly.volume` or `deploy.render.disk` (both billed; they mount at `/app/.data`), or a hosted database',
  },
  {
    code: 'E004',
    severity: 'warning',
    by: 'cli',
    catches:
      'A native npm addon (`better-sqlite3`, `sharp`, `bcrypt`…) built on this machine and deployed from here to a Linux function host',
    fix: "Deploy from CI (`deploy.ci: 'github'` builds on Linux), or drop the addon",
  },
  {
    code: 'E005',
    severity: 'info',
    by: 'cli',
    catches:
      'No `deploy.target` (`weft doctor`, `weft deploy hosts`): which hosts can run this app, and the one weft suggests',
    fix: '`weft deploy init <target>`',
  },
  {
    code: 'E006',
    severity: 'warning',
    by: 'cli',
    catches:
      'A file `weft deploy init` writes for `deploy.target` (`fly.toml`, `Dockerfile`, the workflow…) is missing, or was written from an older config',
    fix: '`weft deploy init` (a file edited by hand is left alone; `--force` overwrites it)',
  },
  {
    code: 'E007',
    severity: 'error',
    by: 'cli',
    catches:
      "A variable `weft deploy --yes` reads is unset (an error in CI or for an id the CLI can't find; a warning where the host CLI's own login stands in)",
    fix: "Set it in the environment, or log in with the host's CLI here. Never in a file",
  },
  // oxlint-disable no-template-curly-in-string -- shows the GitHub Actions syntax
  {
    code: 'E008',
    severity: 'error',
    by: 'cli',
    catches:
      'A deploy credential in a committed file: a Netlify or Fly token, a Render deploy hook, a Cloudinary URL with its secret, or a long value for a key named token, secret, api key or password, in the config, a host file or a workflow',
    fix: 'Move it to the environment (host settings, or GitHub secrets as `${{ secrets.NAME }}`), and rotate it' /* oxlint-enable no-template-curly-in-string */,
  },
  {
    code: 'E009',
    severity: 'warning',
    by: 'cli',
    catches:
      "The memory bus on a target that runs many instances: a message reaches one instance's clients (`weft build` fails on it as R002)",
    fix: '`weft add redis` or `weft add nats`, `postgresBus({ url })`, or `durableObjectBus` on Cloudflare',
  },
  {
    code: 'E010',
    severity: 'warning',
    by: 'cli',
    catches:
      "`deploy.cdn.proxy` is Cloudflare, and `site.url` is the host's own domain (`*.fly.dev`, `*.onrender.com`): nothing goes through the proxy",
    fix: 'Set `site.url` to the domain Cloudflare proxies',
  },
  {
    code: 'E011',
    severity: 'warning',
    by: 'cli',
    catches:
      '`deploy.cdn.proxy` in front of a host that is a CDN already (Netlify, Vercel, Cloudflare): two caches, and a deploy purges only its own',
    fix: 'Drop `cdn.proxy`, or deploy to `fly` or `render` behind it',
  },
  {
    code: 'E012',
    severity: 'error',
    by: 'cli',
    catches: "`deploy.cdn.images` is Cloudinary, and `@weft-js/plugin-media` isn't in `plugins`",
    fix: '`weft add media`, or drop `cdn.images`',
  },
  {
    code: 'E013',
    severity: 'error',
    by: 'cli',
    catches:
      '`deploy.cdn.images` with no `cloud` and no `CLOUDINARY_URL`, or the two naming different clouds (a warning when only the env var is unset, at a deploy)',
    fix: "Set `cdn.images.cloud`, and `CLOUDINARY_URL` in the host's environment",
  },
  {
    code: 'E014',
    severity: 'info',
    by: 'cli',
    catches:
      "`deploy.cdn.images` is checked, and this weft doesn't send uploads to Cloudinary yet: they go to `media({ server: { dir } })`",
    fix: 'Nothing yet (research 46 §9); on a function host, uploads need a server host with a disk (E003)',
  },
]
