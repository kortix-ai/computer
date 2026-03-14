import { getServerPublicEnv } from '@/lib/public-env-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const runtimeEnv = getServerPublicEnv()
  const payload = JSON.stringify(runtimeEnv)
  const script = `window.__KORTIX_RUNTIME_CONFIG=${payload};window.__RUNTIME_ENV=window.__KORTIX_RUNTIME_CONFIG;`

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
