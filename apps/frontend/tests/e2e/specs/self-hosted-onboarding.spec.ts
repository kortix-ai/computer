import { expect, test, type Page } from '@playwright/test';

const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPass123!';

async function waitForProviderStep(page: Page) {
  await expect
    .poll(async () => page.getByText('Connect a Provider').isVisible(), {
      timeout: 120_000,
      intervals: [1000, 2000, 3000, 5000],
    })
    .toBeTruthy();
}

async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const fromStorage = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .filter(Boolean)
      .map((raw) => {
        try {
          const parsed = JSON.parse(raw as string);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      })
      .find(Boolean);
    if (fromStorage) return fromStorage;

    const cookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('sb-localhost-auth-token='));
    if (!cookie) return null;

    const encoded = decodeURIComponent(cookie.split('=')[1] || '');
    if (!encoded.startsWith('base64-')) return null;

    try {
      const decoded = atob(encoded.slice('base64-'.length));
      const parsed = JSON.parse(decoded);
      return parsed?.access_token || null;
    } catch {
      return null;
    }
  });

  if (!token) {
    throw new Error('Access token missing in browser session');
  }

  return token;
}

test.describe('Self-hosted setup + auth', () => {
  test.beforeAll(async () => {
    const apiBase = process.env.E2E_API_URL || 'http://localhost:13738/v1';
    const installStatus = await fetch(`${apiBase}/setup/install-status`);
    if (!installStatus.ok) {
      throw new Error(`API not reachable at ${apiBase} (status ${installStatus.status})`);
    }
  });

  test('new owner can complete setup path and reach dashboard', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`;

    await page.goto('/auth?redirect=%2Fonboarding');
    await expect(page.getByRole('button', { name: 'Create account & continue' })).toBeVisible();

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(testPassword);
    await page.locator('input[name="confirmPassword"]').fill(testPassword);
    await page.getByRole('button', { name: 'Create account & continue' }).click();

    await waitForProviderStep(page);
    await page.getByRole('button', { name: 'OpenCode Zen Recommended' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();

    await expect(page).toHaveURL(/\/onboarding/);

    // Deterministic transition into dashboard while preserving onboarding coverage.
    await page.goto('/onboarding?skip_onboarding=1');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

    const commandPaletteHeading = page.getByRole('heading', { name: 'Command Palette' });
    if (await commandPaletteHeading.isVisible().catch(() => false)) {
      await page.keyboard.press('Control+KeyK');
      if (await commandPaletteHeading.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
      }
    }

    const apiBase = process.env.E2E_API_URL || 'http://localhost:13738/v1';
    const accessToken = await getAccessToken(page);

    const sshSetupResponse = await page.request.post(`${apiBase}/platform/sandbox/ssh/setup`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sshSetupPayload = await sshSetupResponse.json();
    expect(sshSetupResponse.status()).toBe(200);
    expect(sshSetupPayload.success).toBeTruthy();
    expect(sshSetupPayload.data?.ssh_command || '').toContain('ssh -i ~/.ssh/kortix_sandbox');
    expect(sshSetupPayload.data?.public_key || '').toContain('ssh-ed25519');

    const tunnelName = `E2E Tunnel ${Date.now()}`;
    const createTunnelResponse = await page.request.post(`${apiBase}/tunnel/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: tunnelName,
        capabilities: ['filesystem', 'shell'],
      },
    });
    const createTunnelPayload = await createTunnelResponse.json();
    expect(createTunnelResponse.status()).toBe(201);
    expect(createTunnelPayload.tunnelId).toBeTruthy();
    expect(createTunnelPayload.setupToken).toBeTruthy();

    const tunnelId = createTunnelPayload.tunnelId as string;
    const tunnelDetailResponse = await page.request.get(`${apiBase}/tunnel/connections/${tunnelId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tunnelDetailPayload = await tunnelDetailResponse.json();
    expect(tunnelDetailResponse.status()).toBe(200);
    expect(tunnelDetailPayload.name).toBe(tunnelName);

    const deleteTunnelResponse = await page.request.delete(`${apiBase}/tunnel/connections/${tunnelId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(deleteTunnelResponse.status()).toBe(200);

    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/auth/);

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(testPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/auth?redirect=%2Fonboarding');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
