// `weft add rust [name]`: a crate, its server module and one working function, so `weft check` passes on the first run.
// `native()` by default (one hot function in this process); `--remote` for a sidecar, the same crate behind HTTP. The
// `weft` crate isn't on crates.io: it comes with @weft-js/start, so the app's crate and its TS can't disagree on a version.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { start } from './start.mjs'

const refused = (message) => Object.assign(new Error(message), { code: 'E_ADD' })
const usage = (message) => Object.assign(new Error(message), { code: 'E_USAGE' })
const TOOLCHAIN = '1.99.1'

const camel = (name) => name.replace(/[-_](.)/g, (_, c) => c.toUpperCase())
const pascal = (name) => {
  const c = camel(name)
  return c[0].toUpperCase() + c.slice(1)
}
const lib = (name) => name.replaceAll('-', '_')

const manifest = (name, crate, remote) => `[package]
name = "${name}"
version = "0.0.0"
edition = "2024"
publish = false
${
  remote
    ? ''
    : `
[lib]
crate-type = ["cdylib"]
`
}
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
${
  remote
    ? `tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
weft = { path = "${crate}" }`
    : `weft = { path = "${crate}", default-features = false, features = ["native"] }`
}

[build-dependencies]
weft = { path = "${crate}", default-features = false, features = ["build"] }

# A rebuild in \`weft dev\` should stay quick and not be a hundred times slower than the real thing.
[profile.dev]
opt-level = 1

[profile.release]
lto = "fat"
codegen-units = 1

[workspace]
`

const body = (
  name,
  remote,
) => `weft::contract!(); // types and a \`Service\` trait, generated from your Zod: never hand-written
use contract::*;

struct ${pascal(name)};

impl Service for ${pascal(name)} {
    async fn digest(&self, _ctx: weft::Ctx, input: DigestInput) -> Result<DigestOutput, weft::Error> {
        let hash = input.text.bytes().fold(0x811c9dc5u32, |h, b| (h ^ b as u32).wrapping_mul(0x01000193));
        Ok(DigestOutput { bytes: input.text.len() as i64, hash: format!("{hash:08x}") })
    }
}
${
  remote
    ? `
#[tokio::main]
async fn main() -> std::io::Result<()> {
    weft::serve(weft::router(contract::functions(${pascal(name)}))).await
}
`
    : `
weft::native!(contract::functions(${pascal(name)}));
`
}`

const fn = (name, binding) => `import { query } from '@weft-js/start/data'
import { z } from 'zod'
import { ${binding} } from './rust'

// \`crates/${name}\` is its body. Change the schema and \`weft check\` stops at the Rust it broke.
export const digest = query({
  input: z.object({ text: z.string().max(1_000_000) }),
  output: z.object({ bytes: z.int(), hash: z.string() }),
  impl: ${binding},
})
`

/** The path Cargo gets. `crate/` is in a packed @weft-js/start; a linked one is in this repository, next to the crates. */
async function weftCrate(root, dir) {
  const { startDir } = await start(root, 'vite')
  const found = [
    join(startDir, '..', 'crate'),
    join(startDir, '..', '..', '..', 'crates', 'weft'),
  ].find((d) => existsSync(join(d, 'Cargo.toml')))
  if (!found) throw refused('this @weft-js/start has no `weft` crate in it. Nothing was changed.')
  return relative(dir, found).replaceAll('\\', '/')
}

export async function addRust(
  root,
  name = 'media',
  { remote = false, dryRun = false, install, installSpecs },
) {
  if (!/^[a-z][a-z0-9_-]*$/.test(name))
    throw usage(
      `\`${name}\` isn't a service name: lower case, then letters, digits, \`-\` or \`_\``,
    )
  if (!existsSync(join(root, 'package.json')))
    throw refused('`weft add rust` needs a package.json. Nothing was changed.')
  const dir = join(root, 'crates', name)
  const module = join(root, 'src', 'server', `${name}.ts`)
  const taken = [dir, module].filter(existsSync).map((f) => relative(root, f))
  if (taken.length)
    throw refused(
      `${taken.join(', ')} already exist${taken.length > 1 ? '' : 's'}. Pick another name: \`weft add rust <name>\`. Nothing was changed.`,
    )
  const binding = camel(name)
  const factory = remote ? 'remote' : 'native'
  const call = remote ? `remote('rust://${name}')` : `native('${name}')`
  const rustFile = join(root, 'src', 'server', 'rust.ts')
  const had = existsSync(rustFile)
    ? readFileSync(rustFile, 'utf8')
    : '// The only place Rust targets are named.\n'
  if (new RegExp(`\\b${binding}\\b`).test(had))
    throw refused(`src/server/rust.ts already names \`${binding}\`. Nothing was changed.`)
  const imported = new RegExp(
    `import\\s*\\{[^}]*\\b${factory}\\b[^}]*\\}\\s*from\\s*['"]@weft-js/start/rust['"]`,
  ).test(had)
  const nextRust = `${imported ? had : had.replace(/^((?:\/\/.*\n)*)/, `$1import { ${factory} } from '@weft-js/start/rust'\n`)}${had.endsWith('\n') ? '' : '\n'}\nexport const ${binding} = ${call}\n`

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const needsZod = !pkg.dependencies?.zod && !pkg.devDependencies?.zod
  const gitignore = join(root, '.gitignore')
  const ignored =
    existsSync(gitignore) &&
    /^\/?target\/?$|^\*\*\/target\/?$/m.test(readFileSync(gitignore, 'utf8'))
  const actions = [
    `create crates/${name}`,
    `create src/server/${name}.ts`,
    `add \`${binding}\` to src/server/rust.ts`,
    ...(needsZod && install ? ['install zod'] : []),
    ...(ignored ? [] : ['ignore target/']),
    'this crate needs Rust (`cargo`, from rustup.rs); the rest of weft does not',
    'next: `weft check`, then `weft dev`',
  ]
  if (dryRun)
    return { ok: true, feature: 'rust', service: name, kind: factory, actions, dryRun: true }

  const crate = await weftCrate(root, dir)
  const write = (file, text) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  write(join(dir, 'Cargo.toml'), manifest(name, crate, remote))
  write(join(dir, 'build.rs'), `fn main() {\n    weft::build::generate("${name}");\n}\n`)
  write(
    join(dir, 'rust-toolchain.toml'),
    `[toolchain]\nchannel = "${TOOLCHAIN}"\n${remote ? '' : 'targets = ["wasm32-unknown-unknown"]\n'}`,
  )
  write(join(dir, 'src', remote ? 'main.rs' : 'lib.rs'), body(lib(name), remote))
  write(module, fn(name, binding))
  write(rustFile, nextRust)
  if (!ignored)
    writeFileSync(
      gitignore,
      `${existsSync(gitignore) ? readFileSync(gitignore, 'utf8').replace(/\n?$/, '\n') : ''}target/\n`,
    )
  if (needsZod && install) installSpecs(['zod'])
  return { ok: true, feature: 'rust', service: name, kind: factory, actions }
}
