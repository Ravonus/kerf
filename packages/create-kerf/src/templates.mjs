// `--template`: a real app in `templates/<name>/`, laid over the scaffold. `template.json` holds what it
// `requires` (db, auth), its `pages`, its `veneer()` options and any `dependencies` of its own; `files/` is copied as it is.
// A template's Drizzle schema is one dialect's, so it names that dialect, and its `drizzle/` ships with it
// (scripts/template-migrations.mjs): the app runs on a fresh database, and on one that already has these tables.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What `--template` takes: the apps a scaffold can start as. */
export const TEMPLATES = ['landing', 'todo', 'admin', 'catalog']

const templates = fileURLToPath(new URL('../templates/', import.meta.url))
const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Text as a string, and an image or a font as the bytes it is. */
function contents(file) {
  const bytes = readFileSync(file)
  try {
    return utf8.decode(bytes)
  } catch {
    return bytes
  }
}

function tree(dir, base = dir) {
  return Object.fromEntries(
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory()
        ? Object.entries(tree(path, base))
        : [[relative(base, path).split(sep).join('/'), contents(path)]]
    }),
  )
}

const needed = ({ db }) => [
  'src/theme.css',
  'src/routes/_layout.tsx',
  'src/routes/index.tsx',
  ...(db === 'none'
    ? []
    : ['src/db/schema.ts', 'drizzle/meta/_journal.json', 'drizzle/.schema-hash']),
]

export function loadTemplate(name) {
  if (!TEMPLATES.includes(name))
    throw new Error(`--template must be one of ${TEMPLATES.join(', ')} (got "${name}")`)
  const manifest = join(templates, name, 'template.json')
  if (!existsSync(manifest)) throw new Error(`the ${name} template isn't written yet`)
  const {
    requires = {},
    pages = [],
    veneer,
    dependencies = {},
  } = JSON.parse(readFileSync(manifest, 'utf8'))
  const { db = 'none', auth = false } = requires
  if (!['postgres', 'none'].includes(db))
    throw new Error(
      `the ${name} template's requires.db must be postgres or none (got ${JSON.stringify(db)})`,
    )
  const files = tree(join(templates, name, 'files'))
  const missing = needed({ db }).filter((file) => !(file in files))
  if (missing.length) throw new Error(`the ${name} template has no ${missing.join(', ')}`)
  return { name, requires: { db, auth }, pages, veneer, dependencies, files }
}

/** The choices with what the template implies filled in. A choice it can't work with is refused, not ignored. */
export function withTemplate(options) {
  if (!options.template) return options
  const {
    requires: { db, auth },
    files,
  } = loadTemplate(options.template)
  const refuse = (flag, wants) => {
    throw new Error(`the ${options.template} template needs ${flag} ${wants}`)
  }
  if (![undefined, 'veneer'].includes(options.ui)) refuse('--ui', 'veneer')
  if (![undefined, 'drizzle'].includes(options.layer)) refuse('--layer', 'drizzle')
  if (![undefined, db].includes(options.db)) refuse('--db', db)
  if (options.auth !== undefined && Boolean(options.auth) !== auth)
    refuse('sign-in', auth ? 'on' : 'off')
  // Its fonts and media are plugin options in code, which a json or yaml config has no place for.
  const config = 'kerf.config.ts' in files ? 'ts' : options.config
  if (![undefined, config].includes(options.config)) refuse('--config', config)
  return {
    ...options,
    ui: 'veneer',
    layer: 'drizzle',
    db,
    auth: options.auth ?? auth,
    ...(config && { config }),
  }
}

/**
 * drizzle-kit's Postgres migration, made safe to run over tables that are already there: `create` only what's missing, and
 * a foreign key only where the column has none, so an existing schema's differently named constraint isn't doubled.
 */
export function idempotent(sql) {
  return sql
    .replace(/^CREATE TABLE "/gm, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/^CREATE (UNIQUE )?INDEX "/gm, 'CREATE $1INDEX IF NOT EXISTS "')
    .replace(
      /^ALTER TABLE ("\w+") ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\).*?;/gm,
      (statement, table, column) =>
        `DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.conrelid = '${table}'::regclass AND c.contype = 'f' AND a.attname = '${column}') THEN\n    ${statement}\n  END IF;\nEND $$;`,
    )
}

const DATA = {
  drizzle: 'Tables are in `src/db/schema.ts`; after changing it run `npx kerf db generate`.',
  prisma: 'Tables are in `prisma/schema.prisma`; after changing it run `npx kerf db generate`.',
  native: 'Tables are SQL in `migrations/`; `npx kerf db generate <name>` starts a new one.',
}
const LOOK = {
  veneer: "The look is `veneer({ seed, dials, radius, fonts, tokens })` in the kerf config; `kerf check` fails with D010 if a pair can't pass.",
  headless: "The look is `src/app.css`, over veneer's `--veneer-*` tokens.",
  tailwind: 'The look is Tailwind utilities; `src/app.css` is the entry.',
  none: 'The look is `src/app.css`.',
}

/** The scaffold's AGENTS.md: enough to start. `kerf agents-md` writes the full reference over it. */
export function agentsFile({ ui, db, layer, shipped, auth }) {
  return [
    '# AGENTS.md',
    '',
    "This is a **kerf** app (fine-grained reactive TSX). It is not React: components run once, state is a box, and React hooks don't exist.",
    '',
    '## Run',
    '',
    '- `npx kerf dev`: the dev server.',
    '- `npx kerf build`, then `npx kerf start`: production.',
    '- `npx kerf check --json` after every change: each diagnostic has a code, a location, why, and a fix.',
    '- `npx kerf docs <topic>`: rules, props, lists, async, testing, config, diagnostics.',
    ...(db !== 'none' && !shipped
      ? [
          '- `npx kerf db generate` before the first run: the first migration. Migrations apply on the next request.',
        ]
      : []),
    ...(shipped
      ? [
          '- Set `DATABASE_URL` in `.env` to an empty database. `drizzle/` applies on the first request; there is nothing to run.',
        ]
      : []),
    '',
    '## Where things go',
    '',
    "- `src/routes/`: pages, by file path. `_layout.tsx` wraps what's beside it.",
    ...(shipped?.length
      ? [`- This template's pages: ${shipped.map((p) => `\`${p}\``).join(', ')}.`]
      : []),
    ...(db === 'none'
      ? []
      : [
          '- `src/server/`: `query` and `mutation` functions; call them from any component.',
          `- ${DATA[layer]}`,
          '- `.env`: secrets and `DATABASE_URL`, checked by `src/env.server.ts`.',
        ]),
    ...(auth === true
      ? [
          '- `src/auth.server.ts`: Better Auth. Login is an opaque session in the database, in an HTTP-only cookie, never a JWT. Pages may answer from its signed cookie cache for 5 minutes (`session.cookieCache`); mutations always read the database. JWTs are for API access only (`api` in `createAuth`, `npx kerf docs start`).',
        ]
      : []),
    '- `npx kerf map` writes `.kerf/map.md`: what this app has and what to call for each part.',
    '',
    '## Theming',
    '',
    shipped
      ? "`src/theme.css` is this app's CSS: override `--veneer-*` tokens and style `[data-scope]` parts there. The brand, dials and radius are `veneer({ seed, dials, radius })` in the kerf config."
      : LOOK[ui],
    '',
  ].join('\n')
}
