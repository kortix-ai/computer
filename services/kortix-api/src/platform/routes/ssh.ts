/**
 * SSH key setup route — LOCAL DOCKER ONLY.
 *
 * Uses `ssh-keygen` to generate a proper OpenSSH ed25519 keypair, then
 * uses `docker exec` to inject the public key into the container.
 * Returns the private key (OpenSSH format) + connection details.
 *
 * Mounted at /v1/platform/sandbox/ssh
 *
 * Routes:
 *   POST /setup  → Generate keypair, inject pubkey, return private key + ssh command
 */

import { Hono } from 'hono';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Docker from 'dockerode';
import { config } from '../../config';
import type { AuthVariables } from '../../types';

const sshRouter = new Hono<{ Variables: AuthVariables }>();

function getDockerClient(): Docker {
  if (!config.DOCKER_HOST) return new Docker();

  if (config.DOCKER_HOST.startsWith('tcp://') || config.DOCKER_HOST.startsWith('http://')) {
    const url = new URL(config.DOCKER_HOST);
    return new Docker({ host: url.hostname, port: parseInt(url.port || '2375', 10) });
  }

  const socketPath = config.DOCKER_HOST.replace(/^unix:\/\//, '');
  return new Docker({ socketPath });
}

async function runContainerCommand(container: Docker.Container, cmd: string): Promise<void> {
  const exec = await container.exec({
    Cmd: ['sh', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  await new Promise<void>((resolve, reject) => {
    exec.start((err) => {
      if (err) return reject(err);
      return resolve();
    });
  });

  const startedAt = Date.now();
  let result = await exec.inspect();
  while (result.Running) {
    if (Date.now() - startedAt > 15_000) {
      throw new Error('Timed out waiting for container command to finish');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    result = await exec.inspect();
  }

  if (result.ExitCode && result.ExitCode !== 0) {
    throw new Error(`Container command failed with exit code ${result.ExitCode}`);
  }
}

sshRouter.post('/setup', async (c) => {
  try {
    let containerName = 'kortix-sandbox';

    // Try DB lookup for container name (optional — works without)
    try {
      const authHeader = c.req.header('Authorization');
      if (authHeader && config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveAccountId } = await import('../../shared/resolve-account');
        const { db } = await import('../../shared/db');
        const { sandboxes } = await import('@kortix/db');
        const { eq, and } = await import('drizzle-orm');

        const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);

        if (user) {
          const accountId = await resolveAccountId(user.id);
          const [sandbox] = await db.select().from(sandboxes)
            .where(and(eq(sandboxes.accountId, accountId), eq(sandboxes.status, 'active')))
            .limit(1);

          if (sandbox?.provider !== 'local_docker' && sandbox?.provider) {
            return c.json({ success: false, error: 'SSH is only available for Local Docker sandboxes.' }, 400);
          }
          if (sandbox?.externalId) containerName = sandbox.externalId;
        }
      }
    } catch {
      // DB unavailable — use default container name
    }

    // Verify container is running
    const docker = getDockerClient();
    const container = docker.getContainer(containerName);
    try {
      const containerInfo = await container.inspect();
      if (!containerInfo.State?.Running) {
        return c.json({ success: false, error: 'Sandbox is not running.' }, 400);
      }
    } catch (e: any) {
      if (e?.statusCode === 404 || String(e?.message || '').includes('No such container')) {
        return c.json({ success: false, error: 'No sandbox container found. Start your Local Docker sandbox first.' }, 404);
      }
      throw e;
    }

    // Generate keypair using ssh-keygen (produces proper OpenSSH format)
    const tmpPath = join(tmpdir(), `kortix-ssh-${Date.now()}`);
    mkdirSync(tmpPath, { recursive: true });
    const keyPath = join(tmpPath, 'key');

    try {
      execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "kortix-sandbox" -q`, { stdio: 'pipe' });
    } catch (e) {
      throw new Error('Failed to generate SSH keypair via ssh-keygen');
    }

    const privateKey = readFileSync(keyPath, 'utf-8');
    const publicKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim();

    // Cleanup temp files
    try { unlinkSync(keyPath); } catch {}
    try { unlinkSync(`${keyPath}.pub`); } catch {}
    try { rmdirSync(tmpPath); } catch {}

    // Inject public key into container
    const escapedPubKey = publicKey.replace(/'/g, "'\\''");
    await runContainerCommand(
      container,
      `mkdir -p /workspace/.ssh && echo '${escapedPubKey}' >> /workspace/.ssh/authorized_keys && sort -u -o /workspace/.ssh/authorized_keys /workspace/.ssh/authorized_keys && chmod 700 /workspace/.ssh && chmod 600 /workspace/.ssh/authorized_keys && chown -R abc:abc /workspace/.ssh`,
    );
    console.log(`[SSH] Public key injected into container ${containerName}`);

    // Resolve host (VPS-aware)
    const port = config.SANDBOX_PORT_BASE + 7;
    let host = 'localhost';
    const fwdHost = c.req.header('x-forwarded-host') || c.req.header('host') || '';
    const fwdHostOnly = fwdHost.split(':')[0];
    if (fwdHostOnly && fwdHostOnly !== 'localhost' && !fwdHostOnly.includes('kortix-api')) {
      host = fwdHostOnly;
    }

    const sshCmd = `ssh -i ~/.ssh/kortix_sandbox -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -p ${port} abc@${host}`;

    return c.json({
      success: true,
      data: {
        private_key: privateKey,
        public_key: publicKey,
        ssh_command: sshCmd,
        host,
        port,
        username: 'abc',
      },
    });
  } catch (err) {
    console.error('[SSH] setup error:', err);
    return c.json({ success: false, error: err instanceof Error ? err.message : 'Failed to setup SSH' }, 500);
  }
});

export { sshRouter };
