import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { SecretStore } from '../../src/services/secret-store'
import { existsSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { rmSync } from 'fs'

/**
 * Comprehensive tests for the SecretStore service.
 *
 * Each test uses a unique temp directory for the secrets & salt files
 * so tests are fully isolated and don't pollute each other.
 */

describe('SecretStore', () => {
  let tempDir: string
  let secretsPath: string
  let saltPath: string

  // Saved originals so we can restore after each test
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'secret-store-test-'))
    secretsPath = join(tempDir, '.secrets.json')
    saltPath = join(tempDir, '.salt')

    // Save and override environment
    savedEnv.SECRET_FILE_PATH = process.env.SECRET_FILE_PATH
    savedEnv.SALT_FILE_PATH = process.env.SALT_FILE_PATH
    savedEnv.KORTIX_TOKEN = process.env.KORTIX_TOKEN

    process.env.SECRET_FILE_PATH = secretsPath
    process.env.SALT_FILE_PATH = saltPath
    process.env.KORTIX_TOKEN = 'test-token-for-encryption'
  })

  afterEach(() => {
    // Restore original environment
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}

    // Clean up any test env vars that may have been set
    delete process.env.TEST_KEY
    delete process.env.TEST_KEY_2
    delete process.env.UNICODE_KEY
    delete process.env.SPECIAL_KEY
    delete process.env.EMPTY_KEY
    delete process.env.LARGE_KEY
    delete process.env.PERSIST_KEY
    delete process.env.LOADED_A
    delete process.env.LOADED_B
  })

  // ─── Core CRUD ────────────────────────────────────────────────────────────

  describe('set / get (encrypt + decrypt roundtrip)', () => {
    it('stores and retrieves a simple string value', async () => {
      const store = new SecretStore()
      await store.set('TEST_KEY', 'hello-world')

      const value = await store.get('TEST_KEY')
      expect(value).toBe('hello-world')
    })

    it('encrypts the value on disk (not stored in plaintext)', async () => {
      const store = new SecretStore()
      await store.set('MY_SECRET', 'super-secret-value')

      // Read the raw file
      const raw = await Bun.file(secretsPath).text()
      // The plaintext value must NOT appear in the file
      expect(raw).not.toContain('super-secret-value')
      // But the key name is visible (it's the JSON key, not encrypted)
      expect(raw).toContain('MY_SECRET')
    })

    it('handles empty string values', async () => {
      const store = new SecretStore()
      await store.set('EMPTY_KEY', '')

      const value = await store.get('EMPTY_KEY')
      expect(value).toBe('')
    })

    it('handles special characters', async () => {
      const store = new SecretStore()
      const special = 'p@$$w0rd!#&*(){}[]|\\;:\'",.<>?/`~'
      await store.set('SPECIAL_KEY', special)

      const value = await store.get('SPECIAL_KEY')
      expect(value).toBe(special)
    })

    it('handles Unicode / emoji values', async () => {
      const store = new SecretStore()
      const emoji = '🔑🚀 ñ ü 日本語'
      await store.set('UNICODE_KEY', emoji)

      const value = await store.get('UNICODE_KEY')
      expect(value).toBe(emoji)
    })

    it('handles large values (10KB)', async () => {
      const store = new SecretStore()
      const large = 'x'.repeat(10_000)
      await store.set('LARGE_KEY', large)

      const value = await store.get('LARGE_KEY')
      expect(value).toBe(large)
    })

    it('overwrites an existing key', async () => {
      const store = new SecretStore()
      await store.set('TEST_KEY', 'original')
      await store.set('TEST_KEY', 'updated')

      const value = await store.get('TEST_KEY')
      expect(value).toBe('updated')
    })

    it('supports multiple keys simultaneously', async () => {
      const store = new SecretStore()
      await store.set('A', 'value-a')
      await store.set('B', 'value-b')
      await store.set('C', 'value-c')

      expect(await store.get('A')).toBe('value-a')
      expect(await store.get('B')).toBe('value-b')
      expect(await store.get('C')).toBe('value-c')
    })
  })

  // ─── get: missing key ────────────────────────────────────────────────────

  describe('get (missing key)', () => {
    it('returns null for a key that was never set', async () => {
      const store = new SecretStore()
      const value = await store.get('NON_EXISTENT')
      expect(value).toBeNull()
    })

    it('returns null when the secrets file does not exist', async () => {
      // Don't set anything — file doesn't even get created
      const store = new SecretStore()
      expect(existsSync(secretsPath)).toBe(false)

      const value = await store.get('ANYTHING')
      expect(value).toBeNull()
    })
  })

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes a key so get returns null', async () => {
      const store = new SecretStore()
      await store.set('TEST_KEY', 'to-delete')
      expect(await store.get('TEST_KEY')).toBe('to-delete')

      await store.delete('TEST_KEY')
      expect(await store.get('TEST_KEY')).toBeNull()
    })

    it('does not throw when deleting a non-existent key', async () => {
      const store = new SecretStore()
      // Should not throw
      await store.delete('NON_EXISTENT')
      expect(await store.get('NON_EXISTENT')).toBeNull()
    })

    it('does not affect other keys', async () => {
      const store = new SecretStore()
      await store.set('KEEP', 'keep-me')
      await store.set('DELETE_ME', 'bye')

      await store.delete('DELETE_ME')

      expect(await store.get('KEEP')).toBe('keep-me')
      expect(await store.get('DELETE_ME')).toBeNull()
    })
  })

  // ─── listKeys ────────────────────────────────────────────────────────────

  describe('listKeys', () => {
    it('returns empty array when no secrets exist', async () => {
      const store = new SecretStore()
      const keys = await store.listKeys()
      expect(keys).toEqual([])
    })

    it('returns all stored key names', async () => {
      const store = new SecretStore()
      await store.set('ALPHA', 'a')
      await store.set('BETA', 'b')
      await store.set('GAMMA', 'c')

      const keys = await store.listKeys()
      expect(keys.sort()).toEqual(['ALPHA', 'BETA', 'GAMMA'])
    })

    it('reflects deletions', async () => {
      const store = new SecretStore()
      await store.set('A', '1')
      await store.set('B', '2')
      await store.delete('A')

      const keys = await store.listKeys()
      expect(keys).toEqual(['B'])
    })
  })

  // ─── getAll ──────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('returns empty object when no secrets exist', async () => {
      const store = new SecretStore()
      const all = await store.getAll()
      expect(all).toEqual({})
    })

    it('returns all key-value pairs decrypted', async () => {
      const store = new SecretStore()
      await store.set('KEY1', 'value1')
      await store.set('KEY2', 'value2')

      const all = await store.getAll()
      expect(all).toEqual({ KEY1: 'value1', KEY2: 'value2' })
    })
  })

  // ─── loadIntoProcessEnv ──────────────────────────────────────────────────

  describe('loadIntoProcessEnv', () => {
    it('loads all stored secrets into process.env', async () => {
      const store = new SecretStore()
      await store.set('LOADED_A', 'aaa')
      await store.set('LOADED_B', 'bbb')

      // Ensure they aren't in env yet
      delete process.env.LOADED_A
      delete process.env.LOADED_B

      await store.loadIntoProcessEnv()

      expect(process.env.LOADED_A).toBe('aaa')
      expect(process.env.LOADED_B).toBe('bbb')
    })

    it('does nothing when there are no secrets', async () => {
      const store = new SecretStore()
      // Should not throw
      await store.loadIntoProcessEnv()
    })
  })

  // ─── setEnv / deleteEnv (combined process.env + store) ───────────────────

  describe('setEnv', () => {
    it('sets the value in the store AND in process.env', async () => {
      const store = new SecretStore()
      await store.setEnv('TEST_KEY', 'env-value')

      // Check process.env
      expect(process.env.TEST_KEY).toBe('env-value')

      // Check store
      const stored = await store.get('TEST_KEY')
      expect(stored).toBe('env-value')
    })
  })

  describe('deleteEnv', () => {
    it('removes the value from the store AND from process.env', async () => {
      const store = new SecretStore()
      await store.setEnv('TEST_KEY', 'env-value')
      expect(process.env.TEST_KEY).toBe('env-value')

      await store.deleteEnv('TEST_KEY')
      expect(process.env.TEST_KEY).toBeUndefined()
      expect(await store.get('TEST_KEY')).toBeNull()
    })
  })

  // ─── Persistence across instances ────────────────────────────────────────

  describe('persistence', () => {
    it('data persists across SecretStore instances sharing the same paths', async () => {
      const store1 = new SecretStore()
      await store1.set('PERSIST', 'persisted-value')

      const store2 = new SecretStore()
      const value = await store2.get('PERSIST')
      expect(value).toBe('persisted-value')
    })

    it('salt is created once and reused', async () => {
      const store1 = new SecretStore()
      await store1.set('KEY1', 'val1')

      // Salt file should exist now
      expect(existsSync(saltPath)).toBe(true)

      // A second store reads the same salt and can decrypt
      const store2 = new SecretStore()
      expect(await store2.get('KEY1')).toBe('val1')
    })
  })
})
