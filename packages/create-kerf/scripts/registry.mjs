// A registry for the packed gates: these tarballs as if they were published, and everything else from npm. It's how an
// install that can't take a `file:` tarball (Deno's) gets tested, and how optionalDependencies get picked the real way.
// Runs on Node, Bun and Deno. Standalone it serves until killed and prints its port:
//   <runtime> packages/create-kerf/scripts/registry.mjs <dir of .tgz> [port]
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const UPSTREAM = 'https://registry.npmjs.org'

/** Each file of an uncompressed tarball: `{ name, header, body }`. */
function* entries(tar) {
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0;) {
    const header = tar.subarray(at, at + 512)
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0
    yield {
      name: header.subarray(0, 100).toString().replace(/\0.*$/s, ''),
      header,
      body: tar.subarray(at + 512, at + 512 + size),
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
}

/** The tarball with its package.json replaced. */
function withManifest(tar, pkg) {
  const blocks = []
  for (const e of entries(tar)) {
    const body =
      e.name === 'package/package.json' ? Buffer.from(JSON.stringify(pkg, null, 2)) : e.body
    const header = Buffer.from(e.header)
    header.write(body.length.toString(8).padStart(11, '0'), 124, 'ascii')
    header.fill(' ', 148, 156)
    header.write(
      `${header
        .reduce((a, b) => a + b, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
      'ascii',
    )
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

/** Sibling `file:` dependencies as versions, which publishing has to do too: `pin`'s overrides hide them, a registry can't. */
function published(pkg) {
  const deps = (group) =>
    pkg[group] &&
    Object.fromEntries(
      Object.entries(pkg[group]).map(([k, v]) => [k, v.startsWith('file:') ? pkg.version : v]),
    )
  return {
    ...pkg,
    dependencies: deps('dependencies'),
    optionalDependencies: deps('optionalDependencies'),
    peerDependencies: deps('peerDependencies'),
    devDependencies: undefined,
  }
}

function manifest(dir, file) {
  const tar = gunzipSync(readFileSync(join(dir, file)))
  return {
    file,
    tar,
    pkg: published(
      JSON.parse([...entries(tar)].find((e) => e.name === 'package/package.json').body.toString()),
    ),
  }
}

/** Serve `dir`'s tarballs. Returns `{ url, close }`. */
export function serveRegistry(dir, port = 0) {
  const packages = new Map()
  const manifests = readdirSync(dir)
    .filter((f) => f.endsWith('.tgz') && !f.startsWith('._'))
    .map((file) => manifest(dir, file))
  const here = new Set(manifests.map((m) => m.pkg.name))
  for (const { file, tar, pkg } of manifests) {
    // Addons for platforms not packed here: Deno fails an install on any optional dependency it can't find.
    if (pkg.optionalDependencies)
      pkg.optionalDependencies = Object.fromEntries(
        Object.entries(pkg.optionalDependencies).filter(
          ([name]) => here.has(name) || !name.startsWith('@kerf-js/'),
        ),
      )
    packages.set(pkg.name, { file, pkg, tgz: withManifest(tar, pkg) })
  }
  // `npm publish`, so a release can be rehearsed against this: the body is the packument with the tarball attached.
  const accept = async (req) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { _attachments: attached } = JSON.parse(Buffer.concat(chunks).toString())
    const [name, { data }] = Object.entries(attached)[0]
    const file = name.replace('@', '').replace('/', '-')
    writeFileSync(join(dir, file), Buffer.from(data, 'base64'))
    const { tar, pkg } = manifest(dir, file)
    packages.set(pkg.name, { file, pkg, tgz: withManifest(tar, pkg) })
  }
  const answer = async (req, res) => {
    try {
      if (req.method === 'PUT') {
        await accept(req)
        return res.writeHead(201, { 'content-type': 'application/json' }).end('{"ok":true}')
      }
      const url = new URL(req.url, 'http://registry')
      const tarball =
        url.pathname.startsWith('/-/') &&
        [...packages.values()].find((p) => p.file === url.pathname.slice(3))
      if (tarball)
        return res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(tarball.tgz)
      const name = decodeURIComponent(url.pathname.slice(1))
      const ours = packages.get(name)
      if (ours) {
        const { pkg, tgz, file } = ours
        const dist = {
          tarball: `http://localhost:${server.address().port}/-/${file}`,
          shasum: createHash('sha1').update(tgz).digest('hex'),
          integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`,
        }
        const released = '2026-01-01T00:00:00.000Z'
        return res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            name,
            'dist-tags': { latest: pkg.version },
            time: { [pkg.version]: released, created: released, modified: released },
            versions: { [pkg.version]: { ...pkg, dist } },
          }),
        )
      }
      if (name.startsWith('@kerf-js/')) return res.writeHead(404).end('{}')
      const upstream = await fetch(`${UPSTREAM}/${url.pathname.slice(1)}`, {
        headers: { accept: req.headers.accept ?? 'application/json' },
      })
      res
        .writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/json',
        })
        .end(Buffer.from(await upstream.arrayBuffer()))
    } catch (e) {
      res.writeHead(502).end(String(e.message))
    }
  }
  const server = createServer((req, res) => void answer(req, res))
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () =>
      ok({ url: `http://localhost:${server.address().port}/`, close: () => server.close() }),
    )
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await serveRegistry(resolve(process.argv[2]), Number(process.argv[3] ?? 0))
  console.log(url)
}
