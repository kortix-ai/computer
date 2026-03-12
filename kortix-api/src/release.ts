import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Release manifest — single source of truth for version + Docker image names.
 * Loaded from release.json (bundled in the Docker image or found in the repo).
 */
export interface ReleaseManifest {
  version: string
  channel: string
  images: {
    sandbox: string
    api: string
    frontend: string
  }
  snapshots: {
    daytona: string
    hetzner: string
  }
}

const RELEASE_MANIFEST_PATHS = [
  resolve('/app/release.json'),
  resolve(process.cwd(), 'packages/sandbox/release.json'),
  resolve(process.cwd(), '../packages/sandbox/release.json'),
  resolve(process.cwd(), '../../packages/sandbox/release.json'),
]

function loadReleaseManifest(): ReleaseManifest {
  for (const manifestPath of RELEASE_MANIFEST_PATHS) {
    if (!existsSync(manifestPath)) continue
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))

    // Support both old and new format for backwards compat during transition
    if (raw.releaseVersion && raw.sandbox?.image) {
      return {
        version: raw.releaseVersion,
        channel: raw.channel || 'unknown',
        images: {
          sandbox: raw.sandbox.image,
          api: raw.api?.image || `kortix/kortix-api:${raw.releaseVersion}`,
          frontend: raw.frontend?.image || `kortix/kortix-frontend:${raw.releaseVersion}`,
        },
        snapshots: {
          daytona: raw.sandbox.daytonaSnapshot || `kortix-sandbox-v${raw.releaseVersion}`,
          hetzner: raw.sandbox.hetznerSnapshotDescription || `kortix-computer-v${raw.releaseVersion}`,
        },
      }
    }

    return raw as ReleaseManifest
  }

  return {
    version: '0.0.0',
    channel: 'unknown',
    images: {
      sandbox: 'kortix/computer:0.0.0',
      api: 'kortix/kortix-api:0.0.0',
      frontend: 'kortix/kortix-frontend:0.0.0',
    },
    snapshots: {
      daytona: 'kortix-sandbox-v0.0.0',
      hetzner: 'kortix-computer-v0.0.0',
    },
  }
}

export const releaseManifest = loadReleaseManifest()
export const SANDBOX_VERSION = releaseManifest.version
