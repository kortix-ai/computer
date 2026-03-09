import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { spawn } from "child_process";
import { existsSync, unlinkSync } from "fs";

describe("Environment Variable Persistence", () => {
  const baseURL = "http://localhost:8002"; // Different port for isolation
  const testSecretsPath = "/tmp/persistence-test-secrets.json";
  const testSaltPath = "/tmp/persistence-test-salt";
  
  beforeAll(() => {
    // Clean up any existing test files
    if (existsSync(testSecretsPath)) unlinkSync(testSecretsPath);
    if (existsSync(testSaltPath)) unlinkSync(testSaltPath);
  });

  afterAll(() => {
    if (existsSync(testSecretsPath)) unlinkSync(testSecretsPath);
    if (existsSync(testSaltPath)) unlinkSync(testSaltPath);
  });

  async function startServer(): Promise<any> {
    const serverProcess = spawn("bun", ["run", "src/index.ts"], {
      cwd: "/Users/markokraemer/Projects/heyagi/computer/packages/sandbox/kortix-master",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SECRET_FILE_PATH: testSecretsPath,
        SALT_FILE_PATH: testSaltPath,
        KORTIX_TOKEN: "persistence-test-token",
        KORTIX_MASTER_PORT: "8002"
      }
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      
      if (serverProcess.stdout) {
        serverProcess.stdout.on("data", (data: Buffer) => {
          if (data.toString().includes("Starting on port")) {
            clearTimeout(timeout);
            setTimeout(resolve, 1000); // Give server moment to initialize
          }
        });
      }
    });

    return serverProcess;
  }

  async function stopServer(serverProcess: any) {
    if (serverProcess) {
      serverProcess.kill();
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

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

  async function getEnvVar(key: string): Promise<string | null> {
    const response = await fetch(`${baseURL}/env/${key}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to get env var: ${response.status}`);
    }
    
    const data = await response.json();
    return data[key];
  }

  async function getAllEnvVars(): Promise<Record<string, string>> {
    const response = await fetch(`${baseURL}/env`);
    
    if (!response.ok) {
      throw new Error(`Failed to get all env vars: ${response.status}`);
    }
    
    return await response.json();
  }

  test("environment variables should persist across server restarts", async () => {
    // Start server
    let server = await startServer();

    try {
      // Set multiple environment variables
      await setEnvVar("PERSIST_KEY_1", "value1");
      await setEnvVar("PERSIST_KEY_2", "value2");
      await setEnvVar("PERSIST_SPECIAL", "sp3c!@l#ch@rs");

      // Verify they're set
      expect(await getEnvVar("PERSIST_KEY_1")).toBe("value1");
      expect(await getEnvVar("PERSIST_KEY_2")).toBe("value2");
      expect(await getEnvVar("PERSIST_SPECIAL")).toBe("sp3c!@l#ch@rs");

      // Stop server
      await stopServer(server);

      // Start new server instance
      server = await startServer();

      // Verify variables are still available
      expect(await getEnvVar("PERSIST_KEY_1")).toBe("value1");
      expect(await getEnvVar("PERSIST_KEY_2")).toBe("value2");
      expect(await getEnvVar("PERSIST_SPECIAL")).toBe("sp3c!@l#ch@rs");

      // Verify all variables are loaded
      const allVars = await getAllEnvVars();
      expect(allVars).toMatchObject({
        PERSIST_KEY_1: "value1",
        PERSIST_KEY_2: "value2",
        PERSIST_SPECIAL: "sp3c!@l#ch@rs"
      });

    } finally {
      await stopServer(server);
    }
  });

  test("deleted variables should not persist", async () => {
    let server = await startServer();

    try {
      // Set a variable
      await setEnvVar("DELETE_PERSIST_KEY", "will-be-deleted");
      expect(await getEnvVar("DELETE_PERSIST_KEY")).toBe("will-be-deleted");

      // Delete it
      const deleteResponse = await fetch(`${baseURL}/env/DELETE_PERSIST_KEY`, {
        method: "DELETE"
      });
      expect(deleteResponse.ok).toBe(true);

      // Verify it's gone
      expect(await getEnvVar("DELETE_PERSIST_KEY")).toBeNull();

      // Restart server
      await stopServer(server);
      server = await startServer();

      // Variable should still be gone
      expect(await getEnvVar("DELETE_PERSIST_KEY")).toBeNull();

    } finally {
      await stopServer(server);
    }
  });

  test("modified variables should persist with new values", async () => {
    let server = await startServer();

    try {
      // Set initial value
      await setEnvVar("MODIFY_KEY", "initial-value");
      expect(await getEnvVar("MODIFY_KEY")).toBe("initial-value");

      // Modify value
      await setEnvVar("MODIFY_KEY", "modified-value");
      expect(await getEnvVar("MODIFY_KEY")).toBe("modified-value");

      // Restart server
      await stopServer(server);
      server = await startServer();

      // Should have the modified value
      expect(await getEnvVar("MODIFY_KEY")).toBe("modified-value");

    } finally {
      await stopServer(server);
    }
  });

  test("large number of variables should persist", async () => {
    let server = await startServer();

    try {
      const variableCount = 50;
      const testVars: Record<string, string> = {};

      // Set many variables
      for (let i = 0; i < variableCount; i++) {
        const key = `BULK_KEY_${i}`;
        const value = `bulk-value-${i}`;
        testVars[key] = value;
        await setEnvVar(key, value);
      }

      // Verify all are set
      const allVars = await getAllEnvVars();
      for (const [key, value] of Object.entries(testVars)) {
        expect(allVars[key]).toBe(value);
      }

      // Restart server
      await stopServer(server);
      server = await startServer();

      // Verify all variables persisted
      const persistedVars = await getAllEnvVars();
      for (const [key, value] of Object.entries(testVars)) {
        expect(persistedVars[key]).toBe(value);
      }

    } finally {
      await stopServer(server);
    }
  });
});