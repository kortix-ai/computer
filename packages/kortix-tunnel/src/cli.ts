#!/usr/bin/env bun
/**
 * kortix-tunnel CLI — local agent for Kortix reverse-tunnel.
 *
 * Usage:
 *   kortix-tunnel connect --token <token> --tunnel-id <id> [--api-url <url>]
 *   kortix-tunnel status  --token <token> --tunnel-id <id> [--api-url <url>]
 *   kortix-tunnel permissions --token <token> --tunnel-id <id> [--api-url <url>]
 */

import { loadConfig } from './config';
import { TunnelAgent } from './agent';
import { CapabilityRegistry } from './capabilities/index';
import { createFilesystemCapability } from './capabilities/filesystem';
import { createShellCapability } from './capabilities/shell';
import { hostname, platform, arch, release } from 'os';

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const command = argv[2] || 'help';
  const flags: Record<string, string> = {};

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      flags[key] = value;
    }
  }

  return { command, flags };
}

async function commandConnect(flags: Record<string, string>): Promise<void> {
  const config = loadConfig({
    token: flags.token,
    tunnelId: flags['tunnel-id'],
    apiUrl: flags['api-url'],
  });

  if (!config.token) {
    console.error('Error: --token is required');
    process.exit(1);
  }

  if (!config.tunnelId) {
    console.error('Error: --tunnel-id is required');
    process.exit(1);
  }

  const registry = new CapabilityRegistry();
  registry.register(createFilesystemCapability(config));
  registry.register(createShellCapability(config));

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 Kortix Tunnel Agent                       ║
╠═══════════════════════════════════════════════════════════╣
║  Tunnel ID:    ${config.tunnelId.padEnd(40)}║
║  API URL:      ${config.apiUrl.padEnd(40)}║
║  Capabilities: ${registry.getCapabilityNames().join(', ').padEnd(40)}║
║  Machine:      ${hostname().padEnd(40)}║
║  Platform:     ${platform()} ${arch()} ${release().split('.').slice(0, 2).join('.')}${' '.repeat(Math.max(0, 40 - (platform() + ' ' + arch() + ' ' + release().split('.').slice(0, 2).join('.')).length))}║
╚═══════════════════════════════════════════════════════════╝
`);

  const agent = new TunnelAgent(config, registry);
  agent.connect();

  const shutdown = () => {
    console.log('\nShutting down...');
    agent.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function commandStatus(flags: Record<string, string>): Promise<void> {
  const config = loadConfig({
    token: flags.token,
    tunnelId: flags['tunnel-id'],
    apiUrl: flags['api-url'],
  });

  if (!config.token || !config.tunnelId) {
    console.error('Error: --token and --tunnel-id are required');
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.apiUrl}/v1/tunnel/connections/${config.tunnelId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      console.error(`Error: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

async function commandPermissions(flags: Record<string, string>): Promise<void> {
  const config = loadConfig({
    token: flags.token,
    tunnelId: flags['tunnel-id'],
    apiUrl: flags['api-url'],
  });

  if (!config.token || !config.tunnelId) {
    console.error('Error: --token and --tunnel-id are required');
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.apiUrl}/v1/tunnel/permissions/${config.tunnelId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      console.error(`Error: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
kortix-tunnel — Local agent for Kortix reverse-tunnel

Usage:
  kortix-tunnel <command> [options]

Commands:
  connect       Connect to Kortix API and start handling RPC requests
  status        Check tunnel connection status
  permissions   List active permissions for this tunnel
  help          Show this help message

Options:
  --token <token>       Kortix API token (or set KORTIX_TUNNEL_TOKEN)
  --tunnel-id <id>      Tunnel connection ID (or set KORTIX_TUNNEL_ID)
  --api-url <url>       Kortix API URL (default: http://localhost:8008)

Config file:
  ~/.kortix-tunnel/config.json
`);
}

const { command, flags } = parseArgs(process.argv);

switch (command) {
  case 'connect':
    commandConnect(flags);
    break;
  case 'status':
    commandStatus(flags);
    break;
  case 'permissions':
    commandPermissions(flags);
    break;
  case 'help':
  default:
    showHelp();
    break;
}
