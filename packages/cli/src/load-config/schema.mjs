/** `site.limits` and `site.security`: what Start's server does with requests and responses. */
function serverSite(z) {
  return {
    limits: z
      .strictObject({
        body: z.int().positive().optional(),
        upload: z.int().positive().optional(),
      })
      .optional(),
    security: z
      .union([z.literal(false), z.record(z.string(), z.union([z.string(), z.literal(false)]))])
      .optional(),
    trustProxy: z.union([z.boolean(), z.int().positive()]).optional(),
  }
}

function baseSchemas(z) {
  const zodSchema = z.custom(
    (v) => v != null && typeof v === 'object' && ('_zod' in v || '~standard' in v),
  )
  const globs = z.array(z.string())

  const task = z.strictObject({
    run: z.string().min(1),
    description: z.string().optional(),
    sideEffects: z.array(z.string()).optional(),
    env: z.array(z.string()).optional(),
    args: z.union([zodSchema, z.record(z.string(), z.unknown())]).optional(),
  })

  const pluginEntry = z.looseObject({
    name: z.string().min(1),
    version: z.string().optional(),
    provides: z
      .array(z.union([z.string(), z.strictObject({ slot: z.string(), key: z.string() })]))
      .optional(),
  })

  const image = z.strictObject({
    url: z.string().min(1),
    width: z.int().positive().optional(),
    height: z.int().positive().optional(),
    alt: z.string().optional(),
  })

  const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'must be #rrggbb' })
  const colors = {
    background: hex.optional(),
    text: hex.optional(),
    subtle: hex.optional(),
    accent: hex.optional(),
  }
  const cardFont = z.strictObject({
    family: z.string().regex(/^[\w -]+$/, { error: 'must be a font family name' }),
    src: z.string().min(1),
    weight: z.number().optional(),
  })
  const card = z.strictObject({
    ...colors,
    scheme: z.enum(['dark', 'light']).optional(),
    dark: z.strictObject(colors).optional(),
    light: z.strictObject(colors).optional(),
    fonts: z.strictObject({ display: cardFont.optional(), body: cardFont.optional() }).optional(),
  })

  const site = z.strictObject({
    headers: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    name: z.string().min(1).optional(),
    url: z.url({ protocol: /^https?$/, error: 'must be an absolute http(s) URL' }).optional(),
    title: z.string().includes('%s', { error: 'must contain `%s` (the page title)' }).optional(),
    description: z.string().optional(),
    locale: z
      .string()
      .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, { error: 'must look like `en_US`' })
      .optional(),
    inlineCss: z.boolean().optional(),
    criticalCss: z.boolean().optional(),
    criticalKeep: z.array(z.string()).optional(),
    csp: z.literal('strict').optional(),
    ...serverSite(z),
    image: z.union([z.literal('auto'), z.literal(false), z.string().min(1), image]).optional(),
    card: card.optional(),
    head: z.string().optional(),
    twitter: z
      .strictObject({
        card: z.enum(['summary', 'summary_large_image', 'app', 'player']).optional(),
        site: z.string().optional(),
        creator: z.string().optional(),
      })
      .optional(),
  })

  return { globs, task, pluginEntry, site }
}

function mainProperties(z, { globs, task, pluginEntry, site }) {
  return {
    scope: z
      .strictObject({ write: globs.optional(), read: globs.optional(), forbid: globs.optional() })
      .optional(),
    tasks: z.record(z.string(), task).optional(),
    environments: z.record(z.string(), z.looseObject({ url: z.string().optional() })).optional(),
    test: z
      .strictObject({
        include: globs.optional(),
        lanes: z.array(z.enum(['fast', 'browser', 'e2e'])).optional(),
        gate: z
          .strictObject({
            mutationBudgetSec: z.number().positive().optional(),
            maxMutants: z.number().int().positive().optional(),
          })
          .optional(),
      })
      .optional(),
    build: z
      .strictObject({
        audit: z
          .union([
            z.boolean(),
            z.strictObject({
              routes: z.array(z.string()).optional(),
              all: z.boolean().optional(),
              max: z.number().int().positive().optional(),
              indexing: z.enum(['auto', 'public', 'private']).optional(),
            }),
          ])
          .optional(),
        unsafeAllow: z
          .record(
            z.string().regex(/^(all|[A-Z]|[A-Z]+\d{3})$/, 'a code (R002), a family (L) or all'),
            z.string().min(1, 'say why'),
          )
          .optional(),
      })
      .optional(),
    check: z
      .strictObject({
        include: globs.optional(),
        exclude: globs.optional(),
        design: z.boolean().optional(),
        routes: z.boolean().optional(),
        props: z.union([z.boolean(), z.literal('manual')]).optional(),
      })
      .optional(),
    plugins: z.array(pluginEntry).optional(),
    slots: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
    site: site.optional(),
    runtime: z.enum(['node', 'bun', 'deno']).optional(),
    hydration: z.enum(['lazy', 'partial', 'full']).optional(),
    rust: z
      .strictObject({
        unions: z.literal('allow').optional(),
        services: z
          .record(
            z.string(),
            z.strictObject({
              crate: z.string().optional(),
              external: z.boolean().optional(),
              wasm: z.literal(false).optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }
}

function deployFirst(z) {
  return {
    target: z.enum(['netlify', 'vercel', 'cloudflare', 'fly', 'render']).optional(),
    netlify: z.strictObject({ site: z.string().min(1).optional() }).optional(),
    vercel: z
      .strictObject({
        project: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, 'a name: letters, digits and dashes')
          .optional(),
      })
      .optional(),
    cloudflare: z
      .strictObject({
        name: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, 'a name: letters, digits and dashes')
          .optional(),
      })
      .optional(),
  }
}

function deployFly(z) {
  return {
    fly: z
      .strictObject({
        app: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, 'a name: letters, digits and dashes')
          .optional(),
        region: z
          .string()
          .regex(/^[a-z]{3}$/, 'a Fly region code, like `iad`')
          .optional(),
        memory: z
          .string()
          .regex(/^\d+(mb|gb)$/, 'like `512mb`')
          .optional(),
        volume: z
          .strictObject({
            name: z
              .string()
              .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores')
              .optional(),
            path: z.string().startsWith('/').optional(),
            sizeGb: z.number().int().positive().optional(),
          })
          .optional(),
      })
      .optional(),
  }
}

function deployRest(z) {
  return {
    render: z
      .strictObject({
        service: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, 'a name: letters, digits and dashes')
          .optional(),
        plan: z.string().optional(),
        region: z.string().optional(),
        disk: z
          .strictObject({
            path: z.string().startsWith('/').optional(),
            sizeGb: z.number().int().positive().optional(),
          })
          .optional(),
      })
      .optional(),
    ci: z.union([z.literal('github'), z.literal(false)]).optional(),
    branch: z.string().min(1).optional(),
    cdn: z
      .strictObject({
        proxy: z.literal('cloudflare').optional(),
        images: z
          .strictObject({
            provider: z.literal('cloudinary'),
            cloud: z
              .string()
              .regex(/^[\w-]+$/, "the cloud's name, not its URL")
              .optional(),
          })
          .optional(),
      })
      .optional(),
  }
}

function deploySchema(z) {
  return z.strictObject({ ...deployFirst(z), ...deployFly(z), ...deployRest(z) }).optional()
}

function remainingProperties(z) {
  return {
    /** Named targets for a query's `live: { verify: 'staging' }`. `db` is an env var's name. */
    live: z
      .strictObject({
        targets: z
          .record(
            z.string(),
            z.strictObject({
              url: z.string().optional(),
              db: z.string().optional(),
              production: z.boolean().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    trust: z.enum(['enforce', 'warn']).optional(),
  }
}

export function createSchemas(z) {
  const base = baseSchemas(z)
  const configSchema = z.strictObject({
    ...mainProperties(z, base),
    deploy: deploySchema(z),
    ...remainingProperties(z),
  })
  const { pluginEntry } = base
  const dataSchema = configSchema.extend({
    $schema: z.string().optional(),
    plugins: z
      .array(z.union([z.string(), z.tuple([z.string(), z.unknown()]), pluginEntry]))
      .optional(),
  })
  return { configSchema, dataSchema }
}
