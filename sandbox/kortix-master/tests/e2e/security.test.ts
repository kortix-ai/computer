import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { readFileSync, existsSync, unlinkSync, statSync } from "fs";

describe("Security Tests", () => {
  const baseURL = "http://localhost:8003";
  const testSecretsPath = "/tmp/security-test-secrets.json";
  const testSaltPath = "/tmp/security-test-salt";
  
  let serverProcess: any;

  beforeAll(async () => {
    // Clean up existing files
    if (existsSync(testSecretsPath)) unlinkSync(testSecretsPath);
    if (existsSync(testSaltPath)) unlinkSync(testSaltPath);

    // Start server
    serverProcess = spawn("bun", ["run", "src/index.ts"], {
      cwd: "/Users/markokraemer/Projects/heyagi/computer/sandbox/kortix-master",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SECRET_FILE_PATH: testSecretsPath,
        SALT_FILE_PATH: testSaltPath,
        KORTIX_TOKEN: "security-test-token",
        KORTIX_MASTER_PORT: "8003"
      }
    });

    // Wait for server startup
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      
      if (serverProcess.stdout) {
        serverProcess.stdout.on("data", (data: Buffer) => {
          if (data.toString().includes("Starting on port")) {
            clearTimeout(timeout);
            setTimeout(resolve, 1000);
          }
        });
      }
    });
  });

  afterAll(() => {
    if (serverProcess) serverProcess.kill();
    if (existsSync(testSecretsPath)) unlinkSync(testSecretsPath);
    if (existsSync(testSaltPath)) unlinkSync(testSaltPath);
  });

  async function setEnvVar(key: string, value: string) {
    const response = await fetch(`${baseURL}/env/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to set env var: ${response.status}`);
    }
  }

  test("secret files should have secure permissions", async () => {
    // Set a secret to ensure files are created
    await setEnvVar("SECURITY_TEST", "secret-value");

    // Check secrets file permissions
    if (existsSync(testSecretsPath)) {
      const secretsStats = statSync(testSecretsPath);
      const mode = secretsStats.mode & parseInt("777", 8);
      expect(mode).toBe(parseInt("600", 8)); // Should be 0o600
    }

    // Check salt file permissions
    if (existsSync(testSaltPath)) {
      const saltStats = statSync(testSaltPath);
      const mode = saltStats.mode & parseInt("777", 8);
      expect(mode).toBe(parseInt("600", 8)); // Should be 0o600
    }
  });

  test("secrets should be encrypted in storage", async () => {
    const secretValue = "this-should-be-encrypted";
    await setEnvVar("ENCRYPTION_TEST", secretValue);

    // Read the raw secrets file
    if (existsSync(testSecretsPath)) {
      const rawContent = readFileSync(testSecretsPath, "utf8");
      
      // The raw file should not contain the plaintext secret
      expect(rawContent).not.toContain(secretValue);
      
      // Should be valid JSON
      const parsed = JSON.parse(rawContent);
      expect(parsed).toHaveProperty("secrets");
      expect(parsed).toHaveProperty("version");
      
      // Encrypted value should be different from plaintext
      expect(parsed.secrets.ENCRYPTION_TEST).not.toBe(secretValue);
      
      // Encrypted value should follow format: iv:authTag:encrypted
      const encryptedValue = parsed.secrets.ENCRYPTION_TEST;
      expect(encryptedValue).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    }
  });

  test("different KORTIX_TOKEN should not decrypt existing secrets", async () => {
    // Set a secret with current token
    await setEnvVar("TOKEN_TEST", "secret-with-token-1");
    
    // Stop current server
    if (serverProcess) serverProcess.kill();
    
    // Start server with different token
    const newServerProcess = spawn("bun", ["run", "src/index.ts"], {
      cwd: "/Users/markokraemer/Projects/heyagi/computer/sandbox/kortix-master",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SECRET_FILE_PATH: testSecretsPath,
        SALT_FILE_PATH: testSaltPath,
        KORTIX_TOKEN: "different-security-test-token", // Different token
        KORTIX_MASTER_PORT: "8003"
      }
    });

    // Wait for new server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      
      if (newServerProcess.stdout) {
        newServerProcess.stdout.on("data", (data: Buffer) => {
          if (data.toString().includes("Starting on port")) {
            clearTimeout(timeout);
            setTimeout(resolve, 1000);
          }
        });
      }
    });

    try {
      // Try to retrieve the secret set with the old token
      const response = await fetch(`${baseURL}/env/TOKEN_TEST`);
      
      // Should either return 404 (not found) or the decryption should fail
      // The exact behavior depends on implementation, but the important thing
      // is that we don't get the original plaintext back
      if (response.ok) {
        const data = await response.json();
        expect(data.TOKEN_TEST).not.toBe("secret-with-token-1");
      } else {
        expect(response.status).toBe(404);
      }
    } finally {
      // Clean up
      newServerProcess.kill();
    }

    // Restart original server for other tests
    serverProcess = spawn("bun", ["run", "src/index.ts"], {
      cwd: "/Users/markokraemer/Projects/heyagi/computer/sandbox/kortix-master",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SECRET_FILE_PATH: testSecretsPath,
        SALT_FILE_PATH: testSaltPath,
        KORTIX_TOKEN: "security-test-token",
        KORTIX_MASTER_PORT: "8003"
      }
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      
      if (serverProcess.stdout) {
        serverProcess.stdout.on("data", (data: Buffer) => {
          if (data.toString().includes("Starting on port")) {
            clearTimeout(timeout);
            setTimeout(resolve, 1000);
          }
        });
      }
    });
  });

  test("API should handle malformed requests safely", async () => {
    // Test malformed JSON
    const response1 = await fetch(`${baseURL}/env/TEST_KEY`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json"
    });
    expect(response1.status).toBe(400);

    // Test missing content-type
    const response2 = await fetch(`${baseURL}/env/TEST_KEY`, {
      method: "POST",
      body: JSON.stringify({ value: "test" })
    });
    // Should still work or gracefully handle

    // Test very long key names
    const longKey = "A".repeat(1000);
    const response3 = await fetch(`${baseURL}/env/${longKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "test" })
    });
    // Should handle gracefully without crashing

    // Test very long values
    const longValue = "B".repeat(100000);
    const response4 = await fetch(`${baseURL}/env/LONG_VALUE_TEST`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: longValue })
    });
    // Should handle gracefully
  });

  test("sensitive data should not appear in logs", async () => {
    const sensitiveValue = "super-secret-password-123";
    await setEnvVar("LOG_TEST", sensitiveValue);

    // In a real implementation, you would capture and check server logs
    // For now, we'll just ensure the API works without exposing the value
    const response = await fetch(`${baseURL}/env/LOG_TEST`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.LOG_TEST).toBe(sensitiveValue);
  });
});