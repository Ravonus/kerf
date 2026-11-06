/// <reference types="node" />
import process from 'node:process'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

// Checked when the server starts. A build holds no secrets, so `weft build` skips it.
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default('file:.data/app.db'),
    BETTER_AUTH_SECRET: z.string().min(32),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.WEFT_BUILD,
})
