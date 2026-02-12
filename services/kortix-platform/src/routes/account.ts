import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { sandboxes, accountUser } from '@kortix/db';
import { db } from '../db';
import { config } from '../config';
import { getDaytona } from '../lib/daytona';
import { generateSandboxToken } from '../lib/token';
import { authMiddleware } from '../middleware/auth';
import type { AuthVariables } from '../types';

const accountRouter = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
accountRouter.use('/*', authMiddleware);

/**
 * POST /v1/account/init
 *
 * Initialize a user's account. Ensures they have at least one sandbox.
 * If no sandbox exists, provisions one via Daytona with a scoped auth token.
 *
 * The sandbox gets KORTIX_URL and KORTIX_TOKEN injected as environment
 * variables so it can authenticate back to the Kortix Router.
 *
 * Returns the user's sandbox info (idempotent -- safe to call multiple times).
 */
accountRouter.post('/init', async (c) => {
  const userId = c.get('userId');

  try {
    // Resolve accountId: user may belong to a team account via basejump.account_user.
    // For now, use the user's own personal account (userId == accountId in basejump).
    const accountId = await resolveAccountId(userId);

    // Check if user already has an active sandbox
    const [existing] = await db
      .select()
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.accountId, accountId),
          eq(sandboxes.status, 'active'),
        )
      )
      .limit(1);

    if (existing) {
      return c.json({
        success: true,
        data: {
          sandbox_id: existing.sandboxId,
          external_id: existing.externalId,
          name: existing.name,
          base_url: existing.baseUrl,
          status: existing.status,
          created_at: existing.createdAt.toISOString(),
        },
        created: false,
      });
    }

    // No sandbox -- provision one
    const sandbox = await provisionSandbox(accountId, userId);

    return c.json({
      success: true,
      data: {
        sandbox_id: sandbox.sandboxId,
        external_id: sandbox.externalId,
        name: sandbox.name,
        base_url: sandbox.baseUrl,
        status: sandbox.status,
        created_at: sandbox.createdAt.toISOString(),
      },
      created: true,
    }, 201);
  } catch (err) {
    console.error('[PLATFORM] initAccount error:', err);
    return c.json({ success: false, error: 'Failed to initialize account' }, 500);
  }
});

/**
 * GET /v1/account/sandbox
 *
 * Get the user's current sandbox. Returns 404 if none exists.
 */
accountRouter.get('/sandbox', async (c) => {
  const userId = c.get('userId');

  try {
    const accountId = await resolveAccountId(userId);

    const [sandbox] = await db
      .select()
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.accountId, accountId),
          eq(sandboxes.status, 'active'),
        )
      )
      .limit(1);

    if (!sandbox) {
      return c.json({ success: false, error: 'No sandbox found. Call POST /v1/account/init first.' }, 404);
    }

    return c.json({
      success: true,
      data: {
        sandbox_id: sandbox.sandboxId,
        external_id: sandbox.externalId,
        name: sandbox.name,
        base_url: sandbox.baseUrl,
        status: sandbox.status,
        created_at: sandbox.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[PLATFORM] getSandbox error:', err);
    return c.json({ success: false, error: 'Failed to get sandbox' }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the accountId for a user.
 * In basejump, each user has a personal account where userId == accountId.
 * If the user belongs to a team, we'd pick their primary account.
 * For now, use the first account the user belongs to (personal = userId).
 */
async function resolveAccountId(userId: string): Promise<string> {
  // Try to find user's account via basejump.account_user
  const [membership] = await db
    .select({ accountId: accountUser.accountId })
    .from(accountUser)
    .where(eq(accountUser.userId, userId))
    .limit(1);

  if (membership) {
    return membership.accountId;
  }

  // Fallback: in basejump, personal accounts have id == userId
  return userId;
}

/**
 * Provision a new Daytona sandbox for an account.
 * Generates a scoped auth token and injects KORTIX_URL + KORTIX_TOKEN as env vars.
 */
async function provisionSandbox(accountId: string, userId: string) {
  const authToken = generateSandboxToken();

  const daytona = getDaytona();

  // Create sandbox via Daytona SDK using the Kortix sandbox snapshot
  // which has OpenCode, Kortix Master (port 8000), desktop (port 6080), etc. pre-installed.
  const daytonaSandbox = await daytona.create({
    snapshot: 'kortix-sandbox-v0.4.0',
    envVars: {
      KORTIX_API_URL: config.KORTIX_URL,
      KORTIX_TOKEN: authToken,
      ENV_MODE: 'cloud',
    },
    autoStopInterval: 15,
    autoArchiveInterval: 30,
    public: false,
  }, { timeout: 300 });

  const externalId = daytonaSandbox.id;

  // Build the base URL for the sandbox.
  // kortix.cloud proxies to the Daytona sandbox by ID, port 8000 is OpenCode's HTTP server.
  const baseUrl = `https://kortix.cloud/${externalId}/8000`;

  // Insert into kortix.sandboxes
  const [sandbox] = await db
    .insert(sandboxes)
    .values({
      accountId,
      name: `sandbox-${accountId.slice(0, 8)}`,
      externalId,
      status: 'active',
      baseUrl,
      authToken,
      config: {},
      metadata: {
        provisionedBy: userId,
        daytonaSandboxId: externalId,
      },
    })
    .returning();

  console.log(`[PLATFORM] Provisioned sandbox ${sandbox.sandboxId} (daytona: ${externalId}) for account ${accountId}`);

  return sandbox;
}

export { accountRouter };
