import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ReleaseManifest {
  releaseVersion: string
  channel: string
  sandbox: {
    package: {
      name: string
      version: string
    }
    image: string
    daytonaSnapshot: string
    hetznerSnapshotDescription: string
  }
  api: {
    image: string
  }
  frontend: {
    image: string
  }
  packages: {
    kortixOc: {
      name: string
      version: string
    }
    opencodeChannels: {
      name: string
      version: string
    }
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
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest
  }

  return {
    releaseVersion: '0.0.0',
    channel: 'unknown',
    sandbox: {
      package: {
        name: '@kortix/sandbox',
        version: '0.0.0',
      },
      image: 'kortix/computer:0.0.0',
      daytonaSnapshot: 'kortix-sandbox-v0.0.0',
      hetznerSnapshotDescription: 'kortix-computer-v0.0.0',
    },
    api: {
      image: 'kortix/kortix-api:0.0.0',
    },
    frontend: {
      image: 'kortix/kortix-frontend:0.0.0',
    },
    packages: {
      kortixOc: {
        name: '@kortix/kortix-oc',
        version: '0.0.0',
      },
      opencodeChannels: {
        name: '@kortix/opencode-channels',
        version: '0.0.0',
      },
    },
  }
}

export const releaseManifest = loadReleaseManifest()
export const SANDBOX_VERSION = releaseManifest.sandbox.package.version
