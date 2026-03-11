const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const RELEASE_MANIFEST_PATH = path.join(REPO_ROOT, 'packages', 'sandbox', 'release.json')

function loadReleaseManifest() {
  return JSON.parse(fs.readFileSync(RELEASE_MANIFEST_PATH, 'utf8'))
}

function writeReleaseManifest(nextManifest) {
  fs.writeFileSync(RELEASE_MANIFEST_PATH, JSON.stringify(nextManifest, null, 2) + '\n')
}

module.exports = {
  REPO_ROOT,
  RELEASE_MANIFEST_PATH,
  loadReleaseManifest,
  writeReleaseManifest,
}
