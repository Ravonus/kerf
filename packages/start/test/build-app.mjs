// `node test/build-app.mjs '<options json>'`: one production build of the fixture (build.test.ts runs it per preset).
import { build } from '../src/app.mjs'
await build(JSON.parse(process.argv[2]))
