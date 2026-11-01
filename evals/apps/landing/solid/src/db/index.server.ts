import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connect = () => drizzle(postgres(process.env.DATABASE_URL!, { max: 10 }), { schema });

let cached: ReturnType<typeof connect> | undefined;

/** Connects on first use: only the form needs a database, and the build has none. */
export const db = () => (cached ??= connect());
