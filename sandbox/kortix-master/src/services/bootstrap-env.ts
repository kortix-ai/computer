/**
 * Bootstrap environment persistence.
 *
 * Core vars (KORTIX_TOKEN, KORTIX_API_URL, INTERNAL_SERVICE_KEY) are the
 * sandbox's identity credentials. They arrive as Docker env vars at container
 * creation and are synced to the s6 env dir on boot.
 *
 * Problem: if process.env loses them (container restart race, env cleared, etc.)
 * AND the s6 env dir is empty, the sandbox can't authenticate to kortix-api.
 * The SecretStore can't help because KORTIX_TOKEN is its own encryption key.
 *
 * Solution: persist these vars in a plaintext JSON file that's always readable.
 * On boot, load from this file BEFORE anything else to ensure they're in
 * process.env. On any update (boot sync, POST /env), re-save the file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const BOOTSTRAP_PATH = '/workspace/.secrets/.bootstrap-env.json'

const CORE_VARS = ['KORTIX_TOKEN', 'KORTIX_API_URL', 'INTERNAL_SERVICE_KEY'] as const

/**
 * Load bootstrap env vars into process.env.
 * Only sets vars that are missing from process.env — never overwrites existing values.
 * Call this BEFORE SecretStore.loadIntoProcessEnv().
 */
export function loadBootstrapEnv(): number {
  let restored = 0
  try {
    if (!existsSync(BOOTSTRAP_PATH)) return 0
    const data = JSON.parse(readFileSync(BOOTSTRAP_PATH, 'utf-8'))
    for (const key of CORE_VARS) {
      if (!process.env[key] && data[key]) {
        process.env[key] = data[key]
        restored++
      }
    }
    if (restored > 0) {
      console.log(`[Bootstrap] Restored ${restored} core env var(s) from ${BOOTSTRAP_PATH}`)
    }
  } catch (err) {
    console.warn('[Bootstrap] Failed to load bootstrap env:', err)
  }
  return restored
}

/**
 * Save current core env vars to the bootstrap file.
 * Call this after the core vars are confirmed set in process.env.
 */
export function saveBootstrapEnv(): void {
  try {
    const data: Record<string, string> = {}
    for (const key of CORE_VARS) {
      if (process.env[key]) {
        data[key] = process.env[key]!
      }
    }
    if (Object.keys(data).length === 0) return

    const dir = dirname(BOOTSTRAP_PATH)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    writeFileSync(BOOTSTRAP_PATH, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (err) {
    console.warn('[Bootstrap] Failed to save bootstrap env:', err)
  }
}

/**
 * Update a single key in the bootstrap file (for incremental updates via POST /env).
 */
export function updateBootstrapKey(key: string, value: string): void {
  if (!(CORE_VARS as readonly string[]).includes(key)) return
  try {
    let data: Record<string, string> = {}
    if (existsSync(BOOTSTRAP_PATH)) {
      data = JSON.parse(readFileSync(BOOTSTRAP_PATH, 'utf-8'))
    }
    data[key] = value
    const dir = dirname(BOOTSTRAP_PATH)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    writeFileSync(BOOTSTRAP_PATH, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (err) {
    console.warn(`[Bootstrap] Failed to update ${key}:`, err)
  }
}
