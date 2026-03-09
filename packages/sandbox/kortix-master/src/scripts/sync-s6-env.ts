import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { SecretStore } from '../services/secret-store'

const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'

async function main() {
  const store = new SecretStore()
  const envVars = await store.getAll()

  if (!existsSync(S6_ENV_DIR)) {
    await mkdir(S6_ENV_DIR, { recursive: true })
  }

  let count = 0
  for (const [key, value] of Object.entries(envVars)) {
    await Bun.write(`${S6_ENV_DIR}/${key}`, value)
    count++
  }

  console.log(`[sync-s6-env] Wrote ${count} env var(s) to ${S6_ENV_DIR}`)
}

await main()
