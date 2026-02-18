import { readFile, writeFile, mkdir } from 'fs/promises'
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
    this.secretsPath = process.env.SECRET_FILE_PATH || '/app/secrets/.secrets.json'
    this.saltPath = process.env.SALT_FILE_PATH || '/app/secrets/.salt'
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
    } catch (err) {
      console.error(`[SecretStore] Failed to decrypt key "${key}":`, err)
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

  /** Load all secrets into process.env. Skips keys that fail to decrypt. */
  async loadIntoProcessEnv(): Promise<void> {
    const keys = await this.listKeys()
    let loaded = 0
    let failed = 0
    for (const key of keys) {
      const value = await this.get(key)
      if (value !== null) {
        process.env[key] = value
        loaded++
      } else {
        failed++
      }
    }
    console.log(`[SecretStore] Loaded ${loaded} env vars${failed > 0 ? ` (${failed} failed to decrypt)` : ''}`)
  }

  /** Get all secrets decrypted. Skips keys that fail to decrypt. */
  async getAll(): Promise<Record<string, string>> {
    const keys = await this.listKeys()
    const result: Record<string, string> = {}
    for (const key of keys) {
      const value = await this.get(key)
      if (value !== null) {
        result[key] = value
      }
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
}
