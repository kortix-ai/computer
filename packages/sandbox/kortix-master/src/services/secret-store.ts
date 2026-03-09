import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { config } from '../config'

interface SecretsData {
  secrets: Record<string, string>
  version: number
}

export class SecretStore {
  private secretsPath: string
  private saltPath: string
  private salt: Buffer | null = null

  constructor() {
    this.secretsPath = process.env.SECRET_FILE_PATH || '/workspace/.secrets/.secrets.json'
    this.saltPath = process.env.SALT_FILE_PATH || '/workspace/.secrets/.salt'
  }

  private async ensureDirectories() {
    const dir = dirname(this.secretsPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
    }
  }

  private async getSalt(): Promise<Buffer> {
    if (this.salt) return this.salt
    await this.ensureDirectories()
    if (existsSync(this.saltPath)) {
      this.salt = await readFile(this.saltPath)
    } else {
      this.salt = randomBytes(32)
      await writeFile(this.saltPath, this.salt, { mode: 0o600 })
    }
    return this.salt
  }

  private async getKey(): Promise<Buffer> {
    const salt = await this.getSalt()
    return scryptSync(process.env.KORTIX_TOKEN || 'default-key', salt, 32)
  }

  private async encrypt(text: string): Promise<string> {
    const key = await this.getKey()
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  }

  private async decrypt(encryptedData: string): Promise<string> {
    const key = await this.getKey()
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  private async loadSecrets(): Promise<SecretsData> {
    await this.ensureDirectories()
    if (!existsSync(this.secretsPath)) {
      return { secrets: {}, version: 1 }
    }
    const data = await readFile(this.secretsPath, 'utf8')
    return JSON.parse(data) as SecretsData
  }

  private async saveSecrets(data: SecretsData): Promise<void> {
    await this.ensureDirectories()
    await writeFile(this.secretsPath, JSON.stringify(data, null, 2), { mode: 0o600 })
  }

  async get(key: string): Promise<string | null> {
    const data = await this.loadSecrets()
    const encrypted = data.secrets[key]
    if (!encrypted) return null
    try {
      return await this.decrypt(encrypted)
    } catch {
      // Stale key encrypted with old master key — silently skip.
      // Callers (loadIntoProcessEnv, getAll) aggregate the count.
      return null
    }
  }

  async set(key: string, value: string): Promise<void> {
    const data = await this.loadSecrets()
    data.secrets[key] = await this.encrypt(value)
    await this.saveSecrets(data)
  }

  async delete(key: string): Promise<void> {
    const data = await this.loadSecrets()
    delete data.secrets[key]
    await this.saveSecrets(data)
  }

  async listKeys(): Promise<string[]> {
    const data = await this.loadSecrets()
    return Object.keys(data.secrets)
  }

  /** Load all secrets into process.env. Auto-purges stale keys that can't be decrypted. */
  async loadIntoProcessEnv(): Promise<void> {
    const data = await this.loadSecrets()
    const keys = Object.keys(data.secrets)
    let loaded = 0
    const staleKeys: string[] = []
    for (const key of keys) {
      try {
        const value = await this.decrypt(data.secrets[key])
        process.env[key] = value
        loaded++
      } catch {
        staleKeys.push(key)
      }
    }
    // Auto-purge stale keys (encrypted with old master key)
    if (staleKeys.length > 0) {
      for (const key of staleKeys) delete data.secrets[key]
      await this.saveSecrets(data)
      console.warn(`[SecretStore] Purged ${staleKeys.length} stale secret(s) (old encryption key)`)
    }
    if (loaded > 0) {
      console.log(`[SecretStore] Loaded ${loaded} env var(s)`)
    }
  }

  /** Get all secrets decrypted. Auto-purges stale keys that can't be decrypted. */
  async getAll(): Promise<Record<string, string>> {
    const data = await this.loadSecrets()
    const result: Record<string, string> = {}
    const staleKeys: string[] = []
    for (const key of Object.keys(data.secrets)) {
      try {
        result[key] = await this.decrypt(data.secrets[key])
      } catch {
        staleKeys.push(key)
      }
    }
    if (staleKeys.length > 0) {
      for (const key of staleKeys) delete data.secrets[key]
      await this.saveSecrets(data)
      console.warn(`[SecretStore] Purged ${staleKeys.length} stale secret(s) (old encryption key)`)
    }
    return result
  }

  async setEnv(key: string, value: string): Promise<void> {
    await this.set(key, value)
    process.env[key] = value
  }

  async deleteEnv(key: string): Promise<void> {
    await this.delete(key)
    delete process.env[key]
  }

  /**
   * Rotate the KORTIX_TOKEN used as the encryption key.
   * Atomically: decrypt everything with old key → update token → re-encrypt with new key.
   */
  async rotateToken(newToken: string): Promise<{ rotated: number }> {
    // 1. Decrypt all secrets using the current key (derived from current KORTIX_TOKEN)
    const allSecrets = await this.getAll()

    // 2. Wipe the salt so a fresh one is generated for the new key
    this.salt = null
    try { await rm(this.saltPath) } catch {}

    // 3. Switch to the new token — getKey() now derives from the new value
    process.env.KORTIX_TOKEN = newToken

    // 4. Re-encrypt and save all secrets (including KORTIX_TOKEN itself if present)
    //    Remove KORTIX_TOKEN from the set — we don't store the token in its own encrypted store
    delete allSecrets['KORTIX_TOKEN']
    const data: SecretsData = { secrets: {}, version: 1 }
    for (const [key, value] of Object.entries(allSecrets)) {
      data.secrets[key] = await this.encrypt(value)
    }
    await this.saveSecrets(data)

    return { rotated: Object.keys(data.secrets).length }
  }
}
