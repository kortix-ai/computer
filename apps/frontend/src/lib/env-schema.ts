import { z } from 'zod'

const RuntimeEnvSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  BACKEND_URL: z.string().url('BACKEND_URL must be a valid URL'),
  BILLING_ENABLED: z.enum(['true', 'false']).default('false'),
  ENV_MODE: z.enum(['local', 'cloud']).default('local'),
  APP_URL: z.string().url('APP_URL must be a valid URL').default('http://localhost:3000'),
})

export type RuntimeEnv = z.infer<typeof RuntimeEnvSchema>

export function parseRuntimeEnv(raw: Partial<RuntimeEnv>): RuntimeEnv {
  return RuntimeEnvSchema.parse({
    BILLING_ENABLED: 'false',
    ENV_MODE: 'local',
    ...raw,
  })
}
