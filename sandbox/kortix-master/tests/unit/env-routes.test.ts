import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import envRouter from "../../src/routes/env";
import { existsSync, unlinkSync } from "fs";

describe("ENV API Routes", () => {
  let app: Hono;
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
    
    app = new Hono();
    app.route("/env", envRouter);
    
    // Clear test ENV vars
    delete process.env.TEST_API_KEY;
    delete process.env.TEST_SECRET;
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
    delete process.env.TEST_API_KEY;
    delete process.env.TEST_SECRET;
  });

  test("POST /env/:key should set environment variable", async () => {
    const res = await app.request("/env/TEST_API_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "test-api-key-123" })
    });

    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({
      message: "Environment variable set",
      key: "TEST_API_KEY",
      value: "test-api-key-123"
    });

    // Should be available in process.env
    expect(process.env.TEST_API_KEY).toBe("test-api-key-123");
  });

  test("GET /env/:key should retrieve environment variable", async () => {
    // Set first
    await app.request("/env/TEST_SECRET", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "secret-value" })
    });

    const res = await app.request("/env/TEST_SECRET");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({
      TEST_SECRET: "secret-value"
    });
  });

  test("GET /env/:key should return 404 for non-existent key", async () => {
    const res = await app.request("/env/NON_EXISTENT_KEY");
    expect(res.status).toBe(404);
    
    const body = await res.json();
    expect(body.error).toBe("Environment variable not found");
  });

  test("GET /env should list all environment variables", async () => {
    // Set multiple vars
    await app.request("/env/KEY1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "value1" })
    });
    
    await app.request("/env/KEY2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "value2" })
    });

    const res = await app.request("/env");
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({
      KEY1: "value1",
      KEY2: "value2"
    });
  });

  test("DELETE /env/:key should remove environment variable", async () => {
    // Set first
    await app.request("/env/DELETE_TEST", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "to-be-deleted" })
    });

    expect(process.env.DELETE_TEST).toBe("to-be-deleted");

    // Delete
    const res = await app.request("/env/DELETE_TEST", {
      method: "DELETE"
    });

    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toEqual({
      message: "Environment variable deleted",
      key: "DELETE_TEST"
    });

    // Should be removed from process.env
    expect(process.env.DELETE_TEST).toBeUndefined();

    // GET should return 404
    const getRes = await app.request("/env/DELETE_TEST");
    expect(getRes.status).toBe(404);
  });

  test("POST /env/:key should validate request body", async () => {
    // Missing value field
    const res1 = await app.request("/env/TEST_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notValue: "test" })
    });

    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain("value");

    // Non-string value
    const res2 = await app.request("/env/TEST_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 123 })
    });

    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toContain("string");

    // Empty body
    const res3 = await app.request("/env/TEST_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res3.status).toBe(400);
  });

  test("should handle special characters and Unicode", async () => {
    const specialValue = "p@$$w0rd!#&*()";
    const unicodeValue = "🔑🚀";

    // Set special chars
    const res1 = await app.request("/env/SPECIAL_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: specialValue })
    });
    expect(res1.status).toBe(200);

    // Set unicode
    const res2 = await app.request("/env/UNICODE_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: unicodeValue })
    });
    expect(res2.status).toBe(200);

    // Retrieve and verify
    const getRes = await app.request("/env");
    const body = await getRes.json();
    
    expect(body.SPECIAL_KEY).toBe(specialValue);
    expect(body.UNICODE_KEY).toBe(unicodeValue);
  });

  test("should handle empty values", async () => {
    const res = await app.request("/env/EMPTY_KEY", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "" })
    });

    expect(res.status).toBe(200);
    expect(process.env.EMPTY_KEY).toBe("");

    // Retrieve should work
    const getRes = await app.request("/env/EMPTY_KEY");
    const body = await getRes.json();
    expect(body.EMPTY_KEY).toBe("");
  });
});