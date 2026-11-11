// Regenerate vendor/ from the pinned KEEL commits, without touching either KEEL checkout.
//   node scripts/vendor.mjs [keel-engine checkout] [keel-modules checkout]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** keel-engine: the lit renderer's source. keel-modules: the catalog that carries each built module. */
export const PINS = {
  engine: 'f4e677c9c21ea47e1af0b28cc97cd3d429e047f2',
  modules: '258811f19f5a805227393b1da216058300ad8f15',
}

/** The keel-modules this package ships, each its own lazily loaded file. */
export const MODULES = [
  'camera-rail',
  'device-profile',
  'lit-finish',
  'look',
  'quality',
  'tracks',
  'tree-growth',
  'tree-render',
  'voxel-dither',
  'world-light',
]

/** Modules not in the catalog yet: built here from their readable source at a pinned keel-modules commit. */
export const SOURCE_MODULES = {
  band: {
    commit: '6d15f0fe55c61534fab88ae1c5ff7aaa5e395329',
    path: 'modules/keel-web3/audio/band',
  },
}

const ENGINE_PACKAGES = ['lit', 'runtime']
const tsc = join(pkg, '../../node_modules/.bin/tsc')

export const digest = (data) => createHash('sha256').update(data).digest('hex')

const git = (repo, args, options = {}) =>
  execFileSync('git', ['-C', repo, ...args], { maxBuffer: 256 * 1024 * 1024, ...options })

/** The pinned engine source lit needs, in a temporary folder. */
function stageEngine(repo) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-keel-engine-'))
  const paths = [
    'LICENSE',
    'packages/lit/NOTICE',
    ...ENGINE_PACKAGES.flatMap((name) => [`packages/${name}/src`, `packages/${name}/package.json`]),
  ]
  execFileSync('tar', ['-x', '-C', dir], { input: git(repo, ['archive', PINS.engine, ...paths]) })
  const linked = join(dir, 'node_modules', '@keel-engine')
  mkdirSync(linked, { recursive: true })
  for (const name of ENGINE_PACKAGES)
    symlinkSync(join(dir, 'packages', name), join(linked, name), 'dir')
  return dir
}

/** keel/lit as one ES module. */
async function bundleLit(source) {
  if (esbuild.version !== '0.28.2')
    throw new Error(`Expected esbuild 0.28.2, got ${esbuild.version}`)
  const result = await esbuild.build({
    stdin: {
      contents: "export * from './packages/lit/src/index.ts'",
      resolveDir: source,
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    // Shaders become ordinary strings, so the bundle is a few long lines and not thousands of GLSL ones.
    supported: { 'template-literal': false },
    write: false,
    logLevel: 'warning',
    legalComments: 'none',
  })
  const head = `// keel/lit from keel-engine ${PINS.engine.slice(0, 7)} (MIT). Ports Three.js r180 (MIT): see NOTICE. Generated: don't edit.\n`
  return head + result.outputFiles[0].text
}

/** Each module's built bytes and types, read from the pinned catalog and checked against its own digest. */
function catalogModules(repo) {
  const catalog = JSON.parse(git(repo, ['show', `${PINS.modules}:catalog/catalog.json`]).toString())
  const out = new Map()
  for (const id of MODULES) {
    const entry = catalog.modules.find((m) => m.id === id)
    if (!entry) throw new Error(`keel-modules catalog has no \`${id}\``)
    if (entry.license !== 'MIT') throw new Error(`${id}: licence is ${entry.license}, not MIT`)
    const bytes = Buffer.from(entry.runtime.data, entry.runtime.encoding)
    if (`0x${digest(bytes)}` !== entry.outputDigest)
      throw new Error(`${id}: bytes don't match the catalog's outputDigest`)
    const head = `// ${id}@${entry.version} from keel-modules ${PINS.modules.slice(0, 7)} (MIT). Generated: don't edit.\n`
    out.set(`modules/${id}.mjs`, head + bytes.toString())
    const types = Object.entries(entry.types.files)
    if (!types.some(([path]) => path === 'src/index.d.ts'))
      throw new Error(`${id}: the catalog has no src/index.d.ts`)
    for (const [path, text] of types) {
      if (!/^src\/[\w./-]+\.d\.ts$/.test(path) || path.includes('..'))
        throw new Error(`${id}: unexpected types path ${path}`)
      out.set(`modules/${id}/${path.slice(4)}`, text)
    }
    out.set(`modules/${id}.d.mts`, `export * from './${id}/index.js'\n`)
    if (entry.inputs)
      out.set(`modules/${id}.inputs.json`, `${JSON.stringify(entry.inputs, null, 2)}\n`)
  }
  return out
}

/** A module's source at its commit, as one minified ES module and its declarations. */
async function sourceModule(repo, id, { commit, path }) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-keel-module-'))
  try {
    const paths = [`${path}/src`, `${path}/tsconfig.json`, 'tsconfig.base.json', 'LICENSE']
    execFileSync('tar', ['-x', '-C', dir], { input: git(repo, ['archive', commit, ...paths]) })
    const result = await esbuild.build({
      entryPoints: [join(dir, path, 'src/index.ts')],
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      write: false,
      logLevel: 'warning',
      legalComments: 'none',
    })
    const types = join(dir, 'types')
    execFileSync(tsc, [
      '-p',
      join(dir, path, 'tsconfig.json'),
      '--noEmit',
      'false',
      '--declaration',
      '--emitDeclarationOnly',
      '--rootDir',
      join(dir, path, 'src'),
      '--outDir',
      types,
    ])
    const head = `// ${id} from keel-modules ${commit.slice(0, 7)} (MIT), built from source. Generated: don't edit.\n`
    const out = new Map([[`modules/${id}.mjs`, head + result.outputFiles[0].text]])
    for (const name of readdirSync(types).filter((file) => file.endsWith('.d.ts')))
      out.set(`modules/${id}/${name}`, readFileSync(join(types, name)))
    out.set(`modules/${id}.d.mts`, `export * from './${id}/index.js'\n`)
    return out
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const readme = (names) => `# vendor

Built by \`scripts/vendor.mjs\`. Don't edit these files: change the pin and run it again.

- \`lit.mjs\`: keel/lit, KEEL's lit WebGL2 renderer, bundled from keel-engine ${PINS.engine.slice(0, 7)}
  (\`packages/lit\`). MIT, see \`LICENSE\`. It ports Three.js r180 (MIT), see \`NOTICE\`.
- \`modules/\`: ${names.join(', ')} from the keel-modules catalog at ${PINS.modules.slice(0, 7)}. MIT, see
  \`LICENSE-modules\`. Each \`.mjs\` is the catalog's verified build, each \`.d.ts\` its types, and each
  \`.inputs.json\` the settings a host may offer (\`keel-module-inputs@1\`).
- \`modules/\` also holds ${Object.keys(SOURCE_MODULES).join(', ')}: not in the catalog yet, so built here from the
  module's readable source at its pinned keel-modules commit (\`SOURCE_MODULES\` in the script).

\`lock.json\` records every file's sha256. \`test/vendor.test.ts\` holds the folder to it.
`

/** Every generated file, by its path under vendor/. */
export async function generate(engineRepo, modulesRepo) {
  const source = stageEngine(engineRepo)
  try {
    const out = new Map([
      ['LICENSE', readFileSync(join(source, 'LICENSE'))],
      ['NOTICE', readFileSync(join(source, 'packages/lit/NOTICE'))],
      ['LICENSE-modules', git(modulesRepo, ['show', `${PINS.modules}:LICENSE`])],
      ['README.md', readme(MODULES)],
      ['lit.mjs', await bundleLit(source)],
      ['lit.d.mts', "export * from '../src/lit'\n"],
      ...catalogModules(modulesRepo),
    ])
    for (const [id, pinned] of Object.entries(SOURCE_MODULES))
      for (const [name, data] of await sourceModule(modulesRepo, id, pinned)) out.set(name, data)
    const lock = Object.fromEntries([...out].map(([name, data]) => [name, digest(data)]))
    out.set(
      'lock.json',
      `${JSON.stringify({ pins: PINS, sources: SOURCE_MODULES, files: lock }, null, 2)}\n`,
    )
    return out
  } finally {
    rmSync(source, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const engine = resolve(process.argv[2] ?? join(homedir(), 'dev/keel-engine'))
  const modules = resolve(process.argv[3] ?? join(homedir(), 'dev/keel-modules'))
  const outputs = await generate(engine, modules)
  rmSync(join(pkg, 'vendor'), { recursive: true, force: true })
  for (const [name, data] of outputs) {
    const file = join(pkg, 'vendor', name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  console.log(`Vendored KEEL: ${outputs.size} files`)
}
