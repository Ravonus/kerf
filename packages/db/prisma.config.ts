import { defineConfig } from 'prisma/config'

export default defineConfig({ schema: 'test/prisma/schema.prisma', datasource: { url: process.env.DATABASE_URL ?? 'file:./test/generated/dev.db' } })
