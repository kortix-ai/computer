import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateSecretKey } from '../repositories/api-keys';
import { validateSandboxToken } from '../repositories/sandboxes';
import { config } from '../config';

/**
 * Validates API key from Authorization header.
 *
 * Auth Flow:
 * - Token "sk_xxx"  = validate against api_keys table via Drizzle, get account_id
 * - Token "sbt_xxx" = validate against kortix.sandboxes table, get account_id
 * - Other tokens    = treat as account_id directly (backward compat / fallback)
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, {
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new HTTPException(401, {
      message: 'Missing token in Authorization header',
    });
  }

  // API key validation (sk_xxx format)
  if (token.startsWith('sk_') && config.DATABASE_URL) {
    const result = await validateSecretKey(token);

    if (!result.isValid) {
      throw new HTTPException(401, {
        message: result.error || 'Invalid API key',
      });
    }

    c.set('accountId', result.accountId);
    c.set('keyId', result.keyId);
    await next();
    return;
  }

  // Sandbox token validation (sbt_xxx format)
  if (token.startsWith('sbt_') && config.DATABASE_URL) {
    const result = await validateSandboxToken(token);

    if (!result.isValid) {
      throw new HTTPException(401, {
        message: result.error || 'Invalid sandbox token',
      });
    }

    c.set('accountId', result.accountId);
    c.set('sandboxId', result.sandboxId);
    await next();
    return;
  }

  // Fallback: treat token as account_id directly (backward compat)
  c.set('accountId', token);
  await next();
}
