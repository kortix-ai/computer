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
import { createDesktopCapability } from './capabilities/desktop';
import { hostname, platform, arch, release } from 'os';

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  italic:  '\x1b[3m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  bgCyan:  '\x1b[46m',
  bgBlue:  '\x1b[44m',
};

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

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

function printBanner(config: { tunnelId: string; apiUrl: string }, capabilities: string[], version: string): void {
  const machine = hostname();
  const plat = `${platform()} ${arch()} ${release().split('.').slice(0, 2).join('.')}`;
  const tunnelShort = config.tunnelId.length > 36
    ? config.tunnelId.slice(0, 36) + '…'
    : config.tunnelId;

  console.log('');
  console.log(`${c.bold}${c.cyan}   _  __         _   _      ${c.reset}`);
  console.log(`${c.bold}${c.cyan}  | |/ /___  _ _| |_(_)_ __ ${c.reset} ${c.dim}Tunnel Agent${c.reset}`);
  console.log(`${c.bold}${c.cyan}  | ' </ _ \\| '_|  _| \\ \\ / ${c.reset} ${c.dim}v${version}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  |_|\\_\\___/|_|  \\__|_/_\\_\\ ${c.reset}`);
  console.log('');
  console.log(`${c.gray}  ── Session ─────────────────────────────────────────${c.reset}`);
  console.log(`${c.gray}  tunnel   ${c.reset}${c.white}${tunnelShort}${c.reset}`);
  console.log(`${c.gray}  api      ${c.reset}${c.white}${config.apiUrl}${c.reset}`);
  console.log(`${c.gray}  machine  ${c.reset}${c.white}${machine}${c.reset} ${c.dim}(${plat})${c.reset}`);
  console.log('');
  console.log(`${c.gray}  ── Capabilities ────────────────────────────────────${c.reset}`);

  const capIcons: Record<string, string> = {
    filesystem: `${c.green}●${c.reset} filesystem`,
    shell:      `${c.green}●${c.reset} shell`,
    desktop:    `${c.green}●${c.reset} desktop`,
  };

  for (const cap of capabilities) {
    console.log(`${c.gray}  ${c.reset}${capIcons[cap] || `${c.green}●${c.reset} ${cap}`}`);
  }

  console.log('');
}

async function commandConnect(flags: Record<string, string>): Promise<void> {
  const config = loadConfig({
    token: flags.token,
    tunnelId: flags['tunnel-id'],
    apiUrl: flags['api-url'],
  });

  if (!config.token) {
    console.error(`${c.red}${c.bold} error${c.reset} --token is required`);
    process.exit(1);
  }

  if (!config.tunnelId) {
    console.error(`${c.red}${c.bold} error${c.reset} --tunnel-id is required`);
    process.exit(1);
  }

  const registry = new CapabilityRegistry();
  registry.register(createFilesystemCapability(config));
  registry.register(createShellCapability(config));
  registry.register(createDesktopCapability());

  clearScreen();
  printBanner(config, registry.getCapabilityNames(), '0.1.0');

  const agent = new TunnelAgent(config, registry);
  agent.connect();

  const shutdown = () => {
    console.log(`\n${c.dim}  Shutting down…${c.reset}`);
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
  console.log('');
  console.log(`${c.bold}${c.cyan}   _  __         _   _      ${c.reset}`);
  console.log(`${c.bold}${c.cyan}  | |/ /___  _ _| |_(_)_ __ ${c.reset} ${c.dim}Tunnel Agent${c.reset}`);
  console.log(`${c.bold}${c.cyan}  | ' </ _ \\| '_|  _| \\ \\ / ${c.reset} ${c.dim}v0.1.0${c.reset}`);
  console.log(`${c.bold}${c.cyan}  |_|\\_\\___/|_|  \\__|_/_\\_\\ ${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}Usage${c.reset}   ${c.dim}kortix-tunnel <command> [options]${c.reset}`);
  console.log('');
  console.log(`${c.gray}  ── Commands ────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.cyan}connect${c.reset}       Connect and start handling RPC requests`);
  console.log(`  ${c.cyan}status${c.reset}        Check tunnel connection status`);
  console.log(`  ${c.cyan}permissions${c.reset}   List active permissions for this tunnel`);
  console.log(`  ${c.cyan}help${c.reset}          Show this help message`);
  console.log('');
  console.log(`${c.gray}  ── Options ─────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.white}--token${c.reset} ${c.dim}<token>${c.reset}       API token ${c.dim}(or KORTIX_TUNNEL_TOKEN)${c.reset}`);
  console.log(`  ${c.white}--tunnel-id${c.reset} ${c.dim}<id>${c.reset}     Tunnel ID ${c.dim}(or KORTIX_TUNNEL_ID)${c.reset}`);
  console.log(`  ${c.white}--api-url${c.reset} ${c.dim}<url>${c.reset}       API URL ${c.dim}(default: http://localhost:8008)${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Config: ~/.kortix-tunnel/config.json${c.reset}`);
  console.log('');
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
