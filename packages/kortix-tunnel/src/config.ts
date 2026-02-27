/**
 * Configuration loader for kortix-tunnel local agent.
 *
 * Config sources (highest priority first):
 *   1. CLI flags (--token, --tunnel-id, --api-url)
 *   2. Environment variables (KORTIX_TUNNEL_TOKEN, etc.)
 *   3. Config file (~/.kortix-tunnel/config.json)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface TunnelConfig {
  token: string;
  tunnelId: string;
  apiUrl: string;
  maxFileSize: number;
  allowedPaths: string[];
  allowedCommands: string[];
  workingDir: string;
}

const CONFIG_DIR = join(homedir(), '.kortix-tunnel');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS: Partial<TunnelConfig> = {
  apiUrl: 'http://localhost:8008',
  maxFileSize: 10 * 1024 * 1024,
  allowedPaths: [homedir()],
  allowedCommands: [],
  workingDir: homedir(),
};

export function loadConfig(overrides: Partial<TunnelConfig> = {}): TunnelConfig {
  let fileConfig: Partial<TunnelConfig> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (err) {
      console.warn(`[config] Failed to parse ${CONFIG_FILE}:`, err);
    }
  }

  const envConfig: Partial<TunnelConfig> = {};
  if (process.env.KORTIX_TUNNEL_TOKEN) envConfig.token = process.env.KORTIX_TUNNEL_TOKEN;
  if (process.env.KORTIX_TUNNEL_ID) envConfig.tunnelId = process.env.KORTIX_TUNNEL_ID;
  if (process.env.KORTIX_API_URL) envConfig.apiUrl = process.env.KORTIX_API_URL;
  if (process.env.KORTIX_TUNNEL_MAX_FILE_SIZE) envConfig.maxFileSize = parseInt(process.env.KORTIX_TUNNEL_MAX_FILE_SIZE, 10);

  const merged = {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...overrides,
  } as TunnelConfig;

  return merged;
}
