# @weft-js/db

> **Early release (0.1.x).** APIs can change between minor versions.

Database layers and list sources for [`@weft-js/start`](../start). Each driver is an optional peer dependency, and each
subpath loads only its own.

You rarely install this by hand. `npm create @weft-js` and `weft add db` pick the layer and write the files:

```bash
npm create @weft-js my-app -- --db postgres --layer native
npx weft add db sqlite --layer prisma   # in an existing app
```

`--db` takes `sqlite`, `postgres`, `mysql` or `none`. `--layer` takes `drizzle` (the default, which needs nothing from
this package), `prisma` or `native`.

## What's in it

| Import | What it is |
|---|---|
| `@weft-js/db/plugin-native/<engine>` | `createDb({ url })`: a `sql` tag over the driver, with no ORM. Values always go to the driver as parameters. `<engine>` is `sqlite`, `postgres` or `mysql` |
| `@weft-js/db/plugin-native/auth` | `nativeAuth(db)`: a Better Auth database adapter over that client |
| `@weft-js/db/plugin-prisma` | `withWeft(client, dialect)`: the same Prisma client, with what Weft needs to run its migrations and check its tags |
| `@weft-js/db/sql`, `/kysely`, `/prisma`, `/mongo`, `/dynamodb`, `/firestore` | List sources: the rows behind a `query` that takes `listInput` from `@weft-js/start/list`, paged, filtered, sorted and searched |

The layers and the list sources each have a `/plugin` subpath for `weft.config.ts`, so `weft check` and the plugin lock know it's there.

## Docs

`weft docs start` covers the database: `ctx.db`, migrations with `weft db generate`, and change feeds.

## Links

- [Source](https://github.com/Ravonus/weft/tree/main/packages/db)
- [Weft on GitHub](https://github.com/Ravonus/weft): the framework, the docs and every package
- [Changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md)
- [Issues](https://github.com/Ravonus/weft/issues)
