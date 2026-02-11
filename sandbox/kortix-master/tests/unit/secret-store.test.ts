import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SecretStore } from "../../src/services/secret-store";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

describe("SecretStore ENV Extensions", () => {
  let secretStore: SecretStore;
  const testSecretsPath = "/tmp/test-secrets.json";
  const testSaltPath = "/tmp/test-salt";
  
  beforeEach(() => {
    // Clear existing ENV vars first
    delete process.env.SECRET_FILE_PATH;
    delete process.env.SALT_FILE_PATH;
    delete process.env.KORTIX_TOKEN;
    
    // Override config for testing
    process.env.SECRET_FILE_PATH = testSecretsPath;
    process.env.SALT_FILE_PATH = testSaltPath;
    process.env.KORTIX_TOKEN = "test-token-for-encryption";
    
    secretStore = new SecretStore();
    
    // Clear test ENV vars
    delete process.env.TEST_KEY;
    delete process.env.TEST_KEY_2;
    delete process.env.UNICODE_KEY;
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testSecretsPath)) {
      unlinkSync(testSecretsPath);
    }
    if (existsSync(testSaltPath)) {
      unlinkSync(testSaltPath);
    }
    
    // Clean up test ENV vars
    delete process.env.TEST_KEY;
    delete process.env.TEST_KEY_2;
    delete process.env.UNICODE_KEY;
  });

  test("setEnv should store secret and set process.env", async () => {
    await secretStore.setEnv("TEST_KEY", "test-value");
    
    // Should be in process.env immediately
    expect(process.env.TEST_KEY).toBe("test-value");
    
    // Should be retrievable via get()
    const retrieved = await secretStore.get("TEST_KEY");
    expect(retrieved).toBe("test-value");
  });

  test("deleteEnv should remove secret and unset process.env", async () => {
    // Set first
    await secretStore.setEnv("TEST_KEY", "test-value");
    expect(process.env.TEST_KEY).toBe("test-value");
    
    // Delete
    await secretStore.deleteEnv("TEST_KEY");
    expect(process.env.TEST_KEY).toBeUndefined();
    
    // Should not be retrievable
    const retrieved = await secretStore.get("TEST_KEY");
    expect(retrieved).toBeNull();
  });

  test("getAll should return all secrets", async () => {
    await secretStore.setEnv("TEST_KEY", "value1");
    await secretStore.setEnv("TEST_KEY_2", "value2");
    
    const all = await secretStore.getAll();
    expect(all).toEqual({
      "TEST_KEY": "value1",
      "TEST_KEY_2": "value2"
    });
  });

  test("loadIntoProcessEnv should load all stored secrets", async () => {
    // Store some secrets without using setEnv (to test loading)
    await secretStore.set("TEST_KEY", "value1");
    await secretStore.set("TEST_KEY_2", "value2");
    
    // Clear process.env
    delete process.env.TEST_KEY;
    delete process.env.TEST_KEY_2;
    
    // Load into process.env
    await secretStore.loadIntoProcessEnv();
    
    expect(process.env.TEST_KEY).toBe("value1");
    expect(process.env.TEST_KEY_2).toBe("value2");
  });

  test("should handle special characters and Unicode", async () => {
    const specialValue = "p@$$w0rd!#&*";
    const unicodeValue = "🔑🚀";
    
    await secretStore.setEnv("SPECIAL_KEY", specialValue);
    await secretStore.setEnv("UNICODE_KEY", unicodeValue);
    
    expect(process.env.SPECIAL_KEY).toBe(specialValue);
    expect(process.env.UNICODE_KEY).toBe(unicodeValue);
    
    const all = await secretStore.getAll();
    expect(all.SPECIAL_KEY).toBe(specialValue);
    expect(all.UNICODE_KEY).toBe(unicodeValue);
  });

  test("should handle empty values", async () => {
    await secretStore.setEnv("EMPTY_KEY", "");
    
    expect(process.env.EMPTY_KEY).toBe("");
    
    const retrieved = await secretStore.get("EMPTY_KEY");
    expect(retrieved).toBe("");
  });

  test("should persist across SecretStore instances", async () => {
    // Set with first instance
    await secretStore.setEnv("PERSIST_KEY", "persist-value");
    
    // Create new instance
    const newStore = new SecretStore();
    const retrieved = await newStore.get("PERSIST_KEY");
    
    expect(retrieved).toBe("persist-value");
  });

  test("should handle large values", async () => {
    const largeValue = "a".repeat(10000);
    
    await secretStore.setEnv("LARGE_KEY", largeValue);
    
    expect(process.env.LARGE_KEY).toBe(largeValue);
    
    const retrieved = await secretStore.get("LARGE_KEY");
    expect(retrieved).toBe(largeValue);
  });
});